import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import stripeInstance from "../../../../utils/stripe";
import { supabaseAdmin } from "../../../../lib/supabase";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { ProductType } from "../../../../types/enums/productEnum";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";

/**
 * Defaults — used when auto-creating the plan for the first time.
 * Once the plan exists in the DB, the mentor can edit it from the dashboard.
 */
const DEFAULT_PLAN_TITLE = "Bli min klient";
const DEFAULT_PLAN_PRICE_ORE = 50000; // 500 kr
const DEFAULT_PLAN_DESCRIPTION =
  "Personlig trenings- og kostholdsplan, aktivitetssporing, ubegrenset chat og AI-tilpasning.";
const COACH_MAJEN_USERNAME = "Coach.Majen";
const COACH_MAJEN_CURRENCY = "nok";

/**
 * Find-or-create the mentor's subscription plan.
 * Returns the plan row (with id, title, price, description).
 */
async function ensureMentorPlan(mentorUserId: string) {
  // Try to find an existing plan
  const { data: existingPlan } = await supabaseAdmin
    .from("subscription_plans")
    .select("*")
    .eq("user_id", mentorUserId)
    .eq("is_deleted", false)
    .in("plan_type", [SubscriptionPlanType.CUSTOM, SubscriptionPlanType.FIXED])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingPlan) return existingPlan;

  // Auto-create the plan so it shows up in the Mentor Dashboard
  const { data: newPlan, error } = await supabaseAdmin
    .from("subscription_plans")
    .insert({
      user_id: mentorUserId,
      title: DEFAULT_PLAN_TITLE,
      price: DEFAULT_PLAN_PRICE_ORE,
      plan_type: SubscriptionPlanType.CUSTOM,
      description: DEFAULT_PLAN_DESCRIPTION,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[ensureMentorPlan] Failed to create plan:", error);
    return null;
  }
  return newPlan;
}

/**
 * Create a Stripe Checkout Session for a mentor's onboarding fee.
 * The price is read from the mentor's subscription plan in the DB.
 * If no plan exists yet, one is auto-created with defaults (500 kr).
 *
 * Body (optional): { mentorId?: string }
 *   — If omitted, falls back to looking up Coach.Majen by username.
 */
export const createCoachMajenCheckout = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const reqUser = req.user as UserInterface;
    if (!reqUser?.id) {
      return res.status(401).json({ error: { message: "Unauthorized" } });
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", reqUser.id)
      .eq("is_deleted", false)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: { message: "User not found" } });
    }

    // ── Resolve the mentor ──────────────────────────────────────────
    let mentorUserId: string | undefined = req.body?.mentorId;

    if (!mentorUserId) {
      // Fallback: look up Coach.Majen by username
      const { data: mentorUser } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("user_name", COACH_MAJEN_USERNAME)
        .eq("is_deleted", false)
        .limit(1)
        .maybeSingle();
      mentorUserId = mentorUser?.id;
    }

    // ── Find or create the mentor's subscription plan ───────────────
    let plan: any = null;
    if (mentorUserId) {
      plan = await ensureMentorPlan(mentorUserId);
    }
    const checkoutAmountOre = plan?.price || DEFAULT_PLAN_PRICE_ORE;
    const planTitle = plan?.title || DEFAULT_PLAN_TITLE;
    const planDescription = plan?.description || DEFAULT_PLAN_DESCRIPTION;

    // Ensure the user has a Stripe customer ID
    let stripeCustomerId = user.stripe_client_id;
    if (!stripeCustomerId) {
      const customer = await stripeInstance.customers.create({
        email: user.email,
        name: user.full_name,
        metadata: { userId: String(user.id) },
      });
      stripeCustomerId = customer.id;
      await supabaseAdmin
        .from("users")
        .update({ stripe_client_id: customer.id, is_stripe_customer: true })
        .eq("id", user.id);
    }

    // Check if user has already paid for this mentor
    const { data: existingPayment } = await supabaseAdmin
      .from("transactions")
      .select("id")
      .eq("user_id", user.id)
      .eq("product_type", ProductType.COACHING)
      .eq("status", TransactionStatus.SUCCESS)
      .limit(1)
      .maybeSingle();

    if (existingPayment) {
      return res.status(200).json({
        alreadyPaid: true,
        message: "Du har allerede betalt for onboarding.",
      });
    }

    // Derive the frontend origin for redirect URLs
    const frontendOrigin =
      process.env.FRONTEND_ORIGIN || "https://mentorio.no";

    // Create a Stripe Checkout Session using the plan's price
    const session = await stripeInstance.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: COACH_MAJEN_CURRENCY,
            unit_amount: checkoutAmountOre,
            product_data: {
              name: `${planTitle} – Onboarding`,
              description: planDescription,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: String(user.id),
        mentorId: mentorUserId || "",
        planId: plan?.id || "",
        productType: ProductType.COACHING,
        type: "coach_majen_onboarding",
      },
      success_url: `${frontendOrigin}/coach-majen?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendOrigin}/coach-majen?payment=cancelled`,
    });

    // Create a pending transaction
    await supabaseAdmin.from("transactions").insert({
      user_id: user.id,
      amount: checkoutAmountOre,
      type: TransactionType.DEBIT,
      product_type: ProductType.COACHING,
      stripe_payment_intent_id: session.payment_intent || session.id,
      status: TransactionStatus.PENDING,
    });

    return res.status(200).json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error: any) {
    console.error("[createCoachMajenCheckout] Error:", error);
    return res.status(500).json({
      error: { message: error.message || "Something went wrong." },
    });
  }
};
