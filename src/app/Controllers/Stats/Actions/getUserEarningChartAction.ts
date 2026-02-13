import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables } from "../../../../lib/db";
import { ProductType } from "../../../../types/enums/productEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import getDatesInRange from "../../../../utils/getDatesBetRange";

export const getUserEarningChart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { startDate, endDate } = req.body;

    const { data: transactions } = await db
      .from(Tables.TRANSACTIONS)
      .select("amount, product_type, created_at")
      .eq("user_id", user.id)
      .eq("type", TransactionType.CREDIT)
      .gte("created_at", new Date(startDate).toISOString())
      .lt("created_at", new Date(endDate).toISOString());

    const rows = transactions || [];

    const dateRange = getDatesInRange(startDate, endDate);
    const dateSet = new Set<string>(dateRange);

    // Group by product_type and date
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
