import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables } from "../../../../lib/db";
import { ProductType } from "../../../../types/enums/productEnum";

export const getUserEarningStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { startDate, endDate } = req.body;

    // 1. Get the mentor's subscription plans with prices
    const { data: plans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id, price")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const planIds = (plans || []).map((p: any) => p.id);
    const planPriceMap = new Map((plans || []).map((p: any) => [p.id, Number(p.price || 0)]));

    // 2. Compute subscription revenue from subscriptions table directly
    //    Each subscription = one payment of the plan price
    let subscriptionRevenue = 0;
    if (planIds.length > 0) {
      const subsQuery = db
        .from(Tables.SUBSCRIPTIONS)
        .select("plan_id, created_at")
        .in("plan_id", planIds);

      if (startDate) subsQuery.gte("created_at", new Date(startDate).toISOString());
      if (endDate) subsQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

      const { data: subs } = await subsQuery;
      for (const sub of subs || []) {
        subscriptionRevenue += planPriceMap.get(sub.plan_id) || 0;
      }
    }

    // 3. Also try transactions table for additional revenue (tips, posts, or properly-linked subscription transactions)
    let tipsRevenue = 0;
    let postsRevenue = 0;

    if (planIds.length > 0) {
      const txQuery = db
        .from(Tables.TRANSACTIONS)
        .select("amount, product_type")
        .in("product_id", planIds)
        .neq("product_type", ProductType.SUBSCRIPTION);

      if (startDate) txQuery.gte("created_at", new Date(startDate).toISOString());
      if (endDate) txQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

      const { data: txRows } = await txQuery;
      for (const t of txRows || []) {
        if (t.product_type === ProductType.TIPS) tipsRevenue += Number(t.amount || 0);
        if (t.product_type === ProductType.POSTS) postsRevenue += Number(t.amount || 0);
      }
    }

    // Also check for direct credit transactions (tips/posts paid to this user)
    const directQuery = db
      .from(Tables.TRANSACTIONS)
      .select("amount, product_type")
      .eq("user_id", user.id)
      .eq("type", "credit");

    if (startDate) directQuery.gte("created_at", new Date(startDate).toISOString());
    if (endDate) directQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

    const { data: directTx } = await directQuery;
    for (const t of directTx || []) {
      if (t.product_type === ProductType.TIPS) tipsRevenue += Number(t.amount || 0);
      if (t.product_type === ProductType.POSTS) postsRevenue += Number(t.amount || 0);
    }

    const data = [
      { invoice: "Subscription", gross: subscriptionRevenue, netAmt: subscriptionRevenue, paymentMethod: "Card" },
      { invoice: "Tips", gross: tipsRevenue, netAmt: tipsRevenue, paymentMethod: "Card" },
      { invoice: "Posts", gross: postsRevenue, netAmt: postsRevenue, paymentMethod: "Card" },
    ];

    return res.status(200).json({ data });
  } catch (error) {
    console.error("Error fetching user earning stats", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
