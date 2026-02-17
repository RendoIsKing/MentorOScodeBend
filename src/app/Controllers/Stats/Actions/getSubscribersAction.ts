import { Request, Response } from "express";
import { db, findMany, Tables } from "../../../../lib/db";

export const getSubscribers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    // Get plan IDs for this user
    const plans = await findMany(Tables.SUBSCRIPTION_PLANS, {
      user_id: id,
      is_deleted: false,
    }, { select: "id" });
    const planIds = plans.map((plan: any) => plan.id);

    if (!planIds.length) {
      return res.status(200).json({ data: [] });
    }

    // Get active subscriptions for those plans (handle both 'ACTIVE' enum and legacy 'active')
    const { data: subscriptions, error } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("user_id")
      .in("plan_id", planIds)
      .or("status.eq.ACTIVE,status.eq.active");

    if (error || !subscriptions?.length) {
      return res.status(200).json({ data: [] });
    }

    // Get unique subscriber user IDs
    const uniqueUserIds = [...new Set(subscriptions.map((s: any) => s.user_id))];

    // Get user details with photos
    const { data: users } = await db
      .from(Tables.USERS)
      .select("id, full_name, user_name, photo:files!photo_id(path)")
      .in("id", uniqueUserIds);

    const subscribers = (users || []).map((u: any) => ({
      userId: u.id,
      fullName: u.full_name,
      userName: u.user_name,
      photoId: u.photo?.path || null,
    }));

    return res.status(200).json({ data: subscribers });
  } catch (error) {
    console.error("Error while fetching susbcribers", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
