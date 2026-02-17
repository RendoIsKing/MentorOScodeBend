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

    // For mentors: find earnings via subscription plans they own
    const { data: plans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const planIds = (plans || []).map((p: any) => p.id);

    let rows: any[] = [];

    if (planIds.length > 0) {
      const query = db
        .from(Tables.TRANSACTIONS)
        .select("amount, product_type, created_at")
        .in("product_id", planIds);

      if (startDate) query.gte("created_at", new Date(startDate).toISOString());
      if (endDate) query.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

      const { data: transactions } = await query;
      rows = transactions || [];
    }

    // Also check for direct credit transactions (tips, post purchases)
    const directQuery = db
      .from(Tables.TRANSACTIONS)
      .select("amount, product_type, created_at")
      .eq("user_id", user.id)
      .eq("type", "credit");

    if (startDate) directQuery.gte("created_at", new Date(startDate).toISOString());
    if (endDate) directQuery.lt("created_at", new Date(endDate + "T23:59:59").toISOString());

    const { data: directTransactions } = await directQuery;
    rows = rows.concat(directTransactions || []);

    const dateRange = getDatesInRange(startDate, endDate);
    const dateSet = new Set<string>(dateRange);

    const grouped: Record<string, Record<string, number>> = {
      subscription: {},
      tips: {},
      posts: {},
    };

    rows.forEach((t: any) => {
      const d = new Date(t.created_at).toISOString().slice(0, 10);
      dateSet.add(d);
      const key =
        t.product_type === ProductType.SUBSCRIPTION
          ? "subscription"
          : t.product_type === ProductType.TIPS
          ? "tips"
          : "posts";
      grouped[key][d] = (grouped[key][d] || 0) + (t.amount || 0);
    });

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
