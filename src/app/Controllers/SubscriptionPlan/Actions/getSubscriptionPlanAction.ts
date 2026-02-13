import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";
import { db, findOne, Tables } from "../../../../lib/db";

/**
 * Public endpoint — returns a mentor's subscription plans.
 * No auth required; only non-sensitive plan info is returned.
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

    const { data: results, error } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id, title, price, description, plan_type, created_at")
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

    return res.json({ data: results || [] });
  } catch (err) {
    console.error("[getMentorPublicPlans] Error:", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};

export const getSubscriptionPlan = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id: queryId } = _req.query;
    const user = _req.user as UserInterface;
    const userId = queryId ? (queryId as string) : user.id;

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

    const { data: results, error } = await query;

    if (error) {
      console.log(error, "Error while fetching subscription plan");
      return res
        .status(500)
        .json({ error: { message: "Something went wrong." } });
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
