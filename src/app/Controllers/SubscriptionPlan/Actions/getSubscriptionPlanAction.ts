import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { db, findOne, Tables } from "../../../../lib/db";

// ── Default plan values for auto-seed ────────────────────────────────────────
const DEFAULT_PLAN_TITLE = "Bli min klient";
const DEFAULT_PLAN_PRICE_ORE = 50000; // 500 kr
const DEFAULT_PLAN_DESCRIPTION =
  "Personlig trenings- og kostholdsplan, aktivitetssporing, ubegrenset chat og AI-tilpasning.";

/**
 * Auto-create a default subscription plan for a mentor if they have none.
 * Returns the newly created plan row, or null on failure.
 */
async function autoSeedPlanIfEmpty(
  mentorUserId: string,
  selectColumns = "*"
): Promise<any | null> {
  // Verify the user actually exists before creating a plan
  const { data: mentorUser } = await db
    .from(Tables.USERS)
    .select("id")
    .eq("id", mentorUserId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!mentorUser) return null;

  const { data: newPlan, error } = await db
    .from(Tables.SUBSCRIPTION_PLANS)
    .insert({
      user_id: mentorUserId,
      title: DEFAULT_PLAN_TITLE,
      price: DEFAULT_PLAN_PRICE_ORE,
      plan_type: SubscriptionPlanType.CUSTOM,
      description: DEFAULT_PLAN_DESCRIPTION,
    })
    .select(selectColumns)
    .single();

  if (error) {
    console.error("[autoSeedPlanIfEmpty] Failed to create plan:", error);
    return null;
  }
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

    // Auto-seed a default plan so it appears in the Mentor Dashboard
    if (!results || results.length === 0) {
      const seeded = await autoSeedPlanIfEmpty(mentorId, publicCols);
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
    const userId = queryId ? (queryId as string) : user.id;
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

    // Auto-seed a default plan when a user views their own empty plan list
    // (e.g. Coach.Majen opens her Mentor Dashboard for the first time)
    if (isFetchingOwnPlans && (!results || results.length === 0)) {
      const seeded = await autoSeedPlanIfEmpty(userId, "*, features:feature_ids(*)");
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
