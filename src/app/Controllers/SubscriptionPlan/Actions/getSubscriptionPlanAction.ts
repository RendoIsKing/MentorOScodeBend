import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { db, findOne, Tables } from "../../../../lib/db";

// ── Coach.Majen-specific auto-seed ───────────────────────────────────────────
// Only Coach.Majen gets an auto-seeded plan because the plan features are
// custom-designed for her. Other mentors create plans from the dashboard.
const COACH_MAJEN_USERNAME = "Coach.Majen";
const DEFAULT_PLAN_TITLE = "Bli min klient";
const DEFAULT_PLAN_PRICE_ORE = 50000; // 500 kr
const DEFAULT_PLAN_DESCRIPTION =
  "Personlig trenings- og kostholdsplan, aktivitetssporing, ubegrenset chat og AI-tilpasning.";

/**
 * Auto-create Coach.Majen's default plan if she has none.
 * Returns the newly created plan row, or null if the user isn't Coach.Majen.
 */
async function autoSeedCoachMajenPlan(
  userId: string
): Promise<any | null> {
  // Only seed for Coach.Majen (case-insensitive check)
  const { data: user } = await db
    .from(Tables.USERS)
    .select("id, user_name")
    .eq("id", userId)
    .eq("is_deleted", false)
    .maybeSingle();

  console.log("[autoSeedCoachMajenPlan] user lookup:", {
    userId,
    found: !!user,
    user_name: user?.user_name,
  });

  if (!user) return null;

  // Case-insensitive username match
  if ((user.user_name || "").toLowerCase() !== COACH_MAJEN_USERNAME.toLowerCase()) {
    return null;
  }

  // Insert with simple select (joins like feature_ids(*) fail on fresh inserts)
  const { data: newPlan, error } = await db
    .from(Tables.SUBSCRIPTION_PLANS)
    .insert({
      user_id: userId,
      title: DEFAULT_PLAN_TITLE,
      price: DEFAULT_PLAN_PRICE_ORE,
      plan_type: SubscriptionPlanType.CUSTOM,
      description: DEFAULT_PLAN_DESCRIPTION,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[autoSeedCoachMajenPlan] Failed to create plan:", error);
    return null;
  }

  console.log("[autoSeedCoachMajenPlan] Created plan:", newPlan?.id);
  return newPlan;
}

/**
 * Public endpoint — returns a mentor's subscription plans.
 * No auth required; only non-sensitive plan info is returned.
 * If the mentor has no plans yet, a default one is auto-created.
 * GET /plans/public/:mentorId
 */
export const getMentorPublicPlans = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const mentorId = req.params.mentorId;
    if (!mentorId) {
      return res
        .status(400)
        .json({ error: { message: "mentorId is required." } });
    }

    const publicCols = "id, title, price, description, plan_type, created_at";

    let { data: results, error } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select(publicCols)
      .eq("user_id", mentorId)
      .eq("is_deleted", false)
      .in("plan_type", [SubscriptionPlanType.CUSTOM, SubscriptionPlanType.FIXED])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getMentorPublicPlans] Error:", error);
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    // Auto-seed Coach.Majen's plan if she has none yet
    if (!results || results.length === 0) {
      const seeded = await autoSeedCoachMajenPlan(mentorId);
      if (seeded) results = [seeded];
    }

    return res.json({ data: results || [] });
  } catch (err) {
    console.error("[getMentorPublicPlans] Error:", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};

/**
 * Authenticated endpoint — returns subscription plans for the logged-in user
 * (or for another user if ?id=<userId> is passed).
 * When fetching own plans and none exist, a default plan is auto-created.
 * GET /plans
 */
export const getSubscriptionPlan = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id: queryId } = _req.query;
    const user = _req.user as UserInterface;
    const userId: string = queryId ? (queryId as string) : String(user.id);
    const isFetchingOwnPlans = !queryId || queryId === user.id;

    let query = db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("*, features:feature_ids(*)")
      .eq("user_id", userId)
      .eq("is_deleted", false)
      .in("plan_type", [SubscriptionPlanType.CUSTOM, SubscriptionPlanType.FIXED])
      .order("created_at", { ascending: false });

    if (_req.query.search) {
      query = query.ilike("title", `%${_req.query.search}%`);
    }

    let { data: results, error } = await query;

    if (error) {
      console.log(error, "Error while fetching subscription plan");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
    }

    // Auto-seed Coach.Majen's plan when she opens her Mentor Dashboard
    if (isFetchingOwnPlans && (!results || results.length === 0)) {
      const seeded = await autoSeedCoachMajenPlan(userId);
      if (seeded) results = [seeded];
    }

    return res.json({
      data: results || [],
    });
  } catch (err) {
    console.log(err, "Error while fetching subscription plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};

export const getOneSubscriptionPlanForAllUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const queryPrice = 20;

    const subscriptionPlan = await findOne(Tables.SUBSCRIPTION_PLANS, {
      price: queryPrice,
      is_deleted: false,
    });

    if (!subscriptionPlan) {
      return res.status(404).json({
        success: false,
        message: `No subscription plan found for price ${queryPrice}.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: subscriptionPlan,
    });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching the subscription plan.",
      error: error.message,
    });
  }
};
