import { Request, Response } from "express";
import { db, count, findMany, Tables } from "../../../../lib/db";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getDashboardStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const [totalUsers, activeMentors, pendingVerifications, totalTransactions] =
      await Promise.all([
        count(Tables.USERS, { is_deleted: false }),
        count(Tables.USERS, {
          is_deleted: false,
          is_mentor: true,
          is_verified: true,
          is_active: true,
        }),
        count(Tables.DOCUMENTS, {
          is_deleted: false,
          status: DocumentStatusEnum.Pending,
        }),
        count(Tables.TRANSACTIONS),
      ]);

    // Total revenue
    const { data: revenueRows } = await db
      .from(Tables.TRANSACTIONS)
      .select("amount")
      .eq("status", TransactionStatus.SUCCESS);
    const totalRevenue = (revenueRows || []).reduce(
      (s: number, t: any) => s + (t.amount || 0),
      0
    );

    // User growth (last 7 days)
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const { data: growthRows } = await db
      .from(Tables.USERS)
      .select("created_at")
      .eq("is_deleted", false)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    const growthMap = new Map<string, number>();
    (growthRows || []).forEach((row: any) => {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      growthMap.set(key, (growthMap.get(key) || 0) + 1);
    });

    const userGrowth = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = formatDateKey(d);
      return { date: key, count: growthMap.get(key) || 0 };
    });

    // Recent users
    const { data: recentUsers } = await db
      .from(Tables.USERS)
      .select("full_name, email, user_name, created_at")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(5);

    // Recent transactions
    const { data: recentTransactions } = await db
      .from(Tables.TRANSACTIONS)
      .select("amount, currency, status, created_at, user_id")
      .order("created_at", { ascending: false })
      .limit(5);

    return res.json({
      data: {
        kpis: {
          totalUsers,
          activeMentors,
          pendingVerifications,
          totalRevenue: totalRevenue || totalTransactions,
          totalTransactions,
        },
        userGrowth,
        recentUsers: recentUsers || [],
        recentTransactions: recentTransactions || [],
      },
    });
  } catch (error) {
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
