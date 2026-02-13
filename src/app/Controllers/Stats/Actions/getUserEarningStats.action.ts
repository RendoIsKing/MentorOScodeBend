import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, Tables } from "../../../../lib/db";
import { ProductType } from "../../../../types/enums/productEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";

export const getUserEarningStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const { startDate, endDate } = req.body;

    // Fetch credit transactions in the date range
    const { data: transactions } = await db
      .from(Tables.TRANSACTIONS)
      .select("amount, product_type")
      .eq("user_id", user.id)
      .eq("type", TransactionType.CREDIT)
      .gte("created_at", new Date(startDate).toISOString())
      .lt("created_at", new Date(endDate).toISOString());

    const rows = transactions || [];

    const sumByType = (type: string) =>
      rows
        .filter((t: any) => t.product_type === type)
        .reduce((acc: number, t: any) => acc + (t.amount || 0), 0);

    const data = [
      {
        invoice: "Subcription",
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
