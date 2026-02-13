import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { db, count, findMany, Tables } from "../../../../lib/db";
import { isValidDateFormat } from "../../../../utils/regx/isValidDate";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { TransactionType } from "../../../../types/enums/transactionTypeEnum";
import { TransactionStatus } from "../../../../types/enums/transactionStatusEnum";

type DateRangeOutput = {
  startDate?: string;
  endDate?: string;
};

type DateRangeInput = {
  startDate?: string;
  endDate?: string;
  range?: string;
};

const datesFromRange = (range: string): DateRangeOutput => {
  switch (range.toLowerCase()) {
    case "yesterday": {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return {
        startDate: yesterday.toISOString().split("T")[0],
        endDate: yesterday.toISOString().split("T")[0],
      };
    }
    case "tomorrow": {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        startDate: tomorrow.toISOString().split("T")[0],
        endDate: tomorrow.toISOString().split("T")[0],
      };
    }
    case "today": {
      const today = new Date();
      return {
        startDate: today.toISOString().split("T")[0],
        endDate: today.toISOString().split("T")[0],
      };
    }
    case "this_week": {
      const today = new Date();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());
      const endOfWeek = new Date(today);
      endOfWeek.setDate(today.getDate() - today.getDay() + 6);
      return {
        startDate: startOfWeek.toISOString().split("T")[0],
        endDate: endOfWeek.toISOString().split("T")[0],
      };
    }
    case "14_days": {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 13);
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    }
    case "30_days": {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 29);
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    }
    case "90_days": {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 89);
      return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
      };
    }
    default:
      return {};
  }
};

const computeDateRange = (body: DateRangeInput): DateRangeOutput => {
  let { startDate, endDate, range } = body;

  if (!(startDate || !endDate) && range) {
    const { startDate: computedStart, endDate: computedEnd } =
      datesFromRange(range);
    startDate = computedStart;
    endDate = computedEnd;
  }

  return { startDate, endDate };
};

export const creatorStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { startDate, endDate } = computeDateRange(req.body);
    const user = req.user as UserInterface;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "startDate and endDate are required." });
    }

    if (!isValidDateFormat(startDate) || !isValidDateFormat(endDate)) {
      return res
        .status(400)
        .json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const startIso = new Date(startDate).toISOString();
    const endIso = new Date(endDate + "T23:59:59.999Z").toISOString();

    // Followers in range
    const { count: followersCount } = await db
      .from(Tables.USER_CONNECTIONS)
      .select("id", { count: "exact", head: true })
      .eq("following_to", user.id)
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    // Initial followers (before start)
    const { count: initialFollowersCount } = await db
      .from(Tables.USER_CONNECTIONS)
      .select("id", { count: "exact", head: true })
      .eq("following_to", user.id)
      .lt("created_at", startIso);

    // Final followers (up to end)
    const { count: finalFollowersCount } = await db
      .from(Tables.USER_CONNECTIONS)
      .select("id", { count: "exact", head: true })
      .eq("following_to", user.id)
      .lte("created_at", endIso);

    const fc = followersCount || 0;
    const ifc = initialFollowersCount || 0;
    const ffc = finalFollowersCount || 0;
    const percentageChange = ifc === 0 ? (ffc > 0 ? 100 : 0) : ((ffc - ifc) / ifc) * 100;

    // Active subscriptions in range
    const { count: activeSubscriptionsCount } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", SubscriptionStatusEnum.ACTIVE)
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    const { count: initialActiveSubscriptionsCount } = await db
      .from(Tables.SUBSCRIPTIONS)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", SubscriptionStatusEnum.ACTIVE)
      .lt("created_at", startIso);

    const asc = activeSubscriptionsCount || 0;
    const iasc = initialActiveSubscriptionsCount || 0;
    const subscriptionPercentageChange = iasc === 0 ? (asc > 0 ? 100 : 0) : ((asc - iasc) / iasc) * 100;

    // Likes count in range
    const { count: likesInRange } = await db
      .from(Tables.INTERACTIONS)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "LIKE_POST")
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    const { count: initialLikesCount } = await db
      .from(Tables.INTERACTIONS)
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "LIKE_POST")
      .lt("created_at", startIso);

    const flc = likesInRange || 0;
    const ilc = initialLikesCount || 0;
    const percentageChangeLikes = ilc === 0 ? (flc > 0 ? 100 : 0) : ((flc - ilc) / ilc) * 100;

    // Most recent post
    const { data: recentPosts } = await db
      .from(Tables.POSTS)
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const mostRecentPostId = recentPosts?.[0]?.id;

    let likesCountOnRecentPost = 0;
    let tippedmostRecentPost = 0;

    if (mostRecentPostId) {
      const { count: recentLikes } = await db
        .from(Tables.INTERACTIONS)
        .select("id", { count: "exact", head: true })
        .eq("post_id", mostRecentPostId)
        .eq("type", "LIKE_POST");
      likesCountOnRecentPost = recentLikes || 0;

      const { data: recentTxns } = await db
        .from(Tables.TRANSACTIONS)
        .select("amount")
        .eq("product_id", mostRecentPostId)
        .eq("type", TransactionType.CREDIT)
        .eq("status", TransactionStatus.SUCCESS);
      tippedmostRecentPost = (recentTxns || []).reduce((s: number, t: any) => s + (t.amount || 0), 0);
    }

    const response: any = {
      statistics: [
        {
          title: "Followers",
          value: String(fc),
          percentageChange: parseFloat(percentageChange.toFixed(2)),
        },
        {
          title: "Subscribers",
          value: String(asc),
          percentageChange: parseFloat(subscriptionPercentageChange.toFixed(2)),
        },
        {
          title: "Likes",
          value: String(flc),
          percentageChange: parseFloat(percentageChangeLikes.toFixed(2)),
        },
      ],
      postAnalytics: [
        {
          title: "Your Recent post",
          liked: likesCountOnRecentPost,
          tipped: tippedmostRecentPost,
        },
        {
          title: "Most Liked post",
          liked: 0,
          tipped: 0,
        },
        {
          title: "Most Tipped post",
          liked: 0,
          tipped: 0,
        },
      ],
    };

    return res.json(response);
  } catch (error) {
    console.error(error, "Error while fetching creator stats");
    return res.status(500).json({ error: "Internal server error." });
  }
};
