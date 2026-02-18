import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables } from "../../../../lib/db";
import { ProductType } from "../../../../types/enums/productEnum";
import getDatesInRange from "../../../../utils/getDatesBetRange";

export const getUserEarningChart = async (
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

    const dateRange = getDatesInRange(startDate, endDate);
    const dateSet = new Set<string>(dateRange);

    const grouped: Record<string, Record<string, number>> = {
      subscription: {},
      tips: {},
      posts: {},
    };

    // 2. Compute subscription revenue from subscriptions table by date
    if (planIds.length > 0) {
      const subsQuery = db
        .from(Tables.SUBSCRIPTIONS)
        .select("plan_id, created_at")
        .in("plan_id", planIds);

      if (startDate) subsQuery.gte("created_at", new Date(startDate).toISOString());
      if (endDate) subsQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

      const { data: subs } = await subsQuery;
      for (const sub of subs || []) {
        const d = new Date(sub.created_at).toISOString().slice(0, 10);
        dateSet.add(d);
        const price = planPriceMap.get(sub.plan_id) || 0;
        grouped["subscription"][d] = (grouped["subscription"][d] || 0) + price;
      }
    }

    // 3. Tips/posts from transactions
    if (planIds.length > 0) {
      const txQuery = db
        .from(Tables.TRANSACTIONS)
        .select("amount, product_type, created_at")
        .in("product_id", planIds)
        .neq("product_type", ProductType.SUBSCRIPTION);

      if (startDate) txQuery.gte("created_at", new Date(startDate).toISOString());
      if (endDate) txQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

      const { data: txRows } = await txQuery;
      for (const t of txRows || []) {
        const d = new Date(t.created_at).toISOString().slice(0, 10);
        dateSet.add(d);
        const key = t.product_type === ProductType.TIPS ? "tips" : "posts";
        grouped[key][d] = (grouped[key][d] || 0) + Number(t.amount || 0);
      }
    }

    // Direct credit transactions
    const directQuery = db
      .from(Tables.TRANSACTIONS)
      .select("amount, product_type, created_at")
      .eq("user_id", user.id)
      .eq("type", "credit");

    if (startDate) directQuery.gte("created_at", new Date(startDate).toISOString());
    if (endDate) directQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

    const { data: directTx } = await directQuery;
    for (const t of directTx || []) {
      const d = new Date(t.created_at).toISOString().slice(0, 10);
      dateSet.add(d);
      const key = t.product_type === ProductType.TIPS ? "tips" : "posts";
      grouped[key][d] = (grouped[key][d] || 0) + Number(t.amount || 0);
    }

    const dateSetArray = [...dateSet].sort();

    const statsData = Object.entries(grouped).map(([label, dateMap]) => ({
      label,
      data: dateSetArray.map((date) => (dateMap[date] || 0) / 100),
      paymentMethod: "Card",
    }));

    return res.status(200).json({
      data: {
        labels: dateSetArray,
        datasets: statsData,
      },
    });
  } catch (error) {
    console.error("Error while fetching user earnings", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
