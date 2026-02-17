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

    // For mentors: find earnings via subscription plans they own
    // First get the mentor's plan IDs
    const { data: plans } = await db
      .from(Tables.SUBSCRIPTION_PLANS)
      .select("id")
      .eq("user_id", user.id)
      .eq("is_deleted", false);

    const planIds = (plans || []).map((p: any) => p.id);

    let rows: any[] = [];

    if (planIds.length > 0) {
      // Find all transactions for these plans (subscribers paying)
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

    const sumByType = (type: string) =>
      rows
        .filter((t: any) => t.product_type === type)
        .reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

    const data = [
      {
        invoice: "Subscription",
        gross: sumByType(ProductType.SUBSCRIPTION),
        netAmt: sumByType(ProductType.SUBSCRIPTION),
        paymentMethod: "Card",
      },
      {
        invoice: "Tips",
        gross: sumByType(ProductType.TIPS),
        netAmt: sumByType(ProductType.TIPS),
        paymentMethod: "Card",
      },
      {
        invoice: "Posts",
        gross: sumByType(ProductType.POSTS),
        netAmt: sumByType(ProductType.POSTS),
        paymentMethod: "Card",
      },
    ];

    return res.status(200).json({ data });
  } catch (error) {
    console.error("Error fetching user earning stats", error);
    return res.status(500).json({ error: "Something went wrong." });
  }
};
