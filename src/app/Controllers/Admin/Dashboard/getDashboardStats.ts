import { Request, Response } from "express";
import { User } from "../../../Models/User";
import { Document } from "../../../Models/Document";
import { Transaction } from "../../../Models/Transaction";
import { DocumentStatusEnum } from "../../../../types/DocumentStatusEnum";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";

const formatDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const getDashboardStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const [
      totalUsers,
      activeMentors,
      pendingVerifications,
      totalTransactions,
    ] = await Promise.all([
      User.countDocuments({ isDeleted: false }),
      User.countDocuments({
        isDeleted: false,
        isMentor: true,
        isVerified: true,
        isActive: true,
      }),
      Document.countDocuments({
        isDeleted: false,
        status: DocumentStatusEnum.Pending,
      }),
      Transaction.countDocuments({}),
    ]);

    const revenueAgg = await Transaction.aggregate([
      { $match: { status: TransactionStatus.SUCCESS } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueAgg?.[0]?.total ?? 0;

    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const growthAgg = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const growthMap = new Map<string, number>(
      growthAgg.map((row) => [row._id, row.count])
    );

    const userGrowth = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      const key = formatDateKey(d);
      return { date: key, count: growthMap.get(key) || 0 };
    });

    const recentUsers = await User.find({ isDeleted: false })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("fullName email userName createdAt")
      .lean();

    const recentTransactions = await Transaction.find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .select("amount currency status createdAt userId")
      .lean();

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
        recentUsers,
        recentTransactions,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong." } });
  }
};
