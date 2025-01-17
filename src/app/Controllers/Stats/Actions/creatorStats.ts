import { Request, Response } from "express";
import { Types } from "mongoose";
import { UserInterface } from "../../../../types/UserInterface";
import { userConnection } from "../../../Models/Connection";
import { isValidDateFormat } from "../../../../utils/regx/isValidDate";
import { Subscription } from "../../../Models/Subscription";
import { SubscriptionStatusEnum } from "../../../../types/enums/SubscriptionStatusEnum";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { Post } from "../../../Models/Post";
import { Transaction } from "../../../Models/Transaction";
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

  return {
    startDate: startDate,
    endDate: endDate,
  };
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

    const start = new Date(startDate);
    const end = new Date(endDate);

    const followersCountAggregation = await userConnection.aggregate([
      {
        $match: {
          followingTo: new Types.ObjectId(user.id),
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$followingTo",
          followersCount: { $sum: 1 },
        },
      },
    ]);

    const initialFollowersCountAggregation = await userConnection.aggregate([
      {
        $match: {
          followingTo: new Types.ObjectId(user.id),
          createdAt: { $lt: start },
        },
      },
      {
        $group: {
          _id: "$followingTo",
          initialFollowersCount: { $sum: 1 },
        },
      },
    ]);

    const finalFollowersCountAggregation = await userConnection.aggregate([
      {
        $match: {
          followingTo: new Types.ObjectId(user.id),
          createdAt: { $lte: end },
        },
      },
      {
        $group: {
          _id: "$followingTo",
          finalFollowersCount: { $sum: 1 },
        },
      },
    ]);

    const followersCount = followersCountAggregation[0]?.followersCount || 0;
    const initialFollowersCount =
      initialFollowersCountAggregation[0]?.initialFollowersCount || 0;
    const finalFollowersCount =
      finalFollowersCountAggregation[0]?.finalFollowersCount || 0;
    let percentageChange;
    if (initialFollowersCount === 0) {
      percentageChange = finalFollowersCount > 0 ? 100 : 0;
    } else {
      percentageChange =
        ((finalFollowersCount - initialFollowersCount) /
          initialFollowersCount) *
        100;
    }

    const activeSubscriptionsAggregation = await Subscription.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(user.id),
          createdAt: { $gte: start, $lte: end },
          status: SubscriptionStatusEnum.ACTIVE,
        },
      },
      {
        $group: {
          _id: null,
          activeSubscriptionsCount: { $sum: 1 },
        },
      },
    ]);

    const initialActiveSubscriptionsAggregation = await Subscription.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(user.id),
          createdAt: { $lt: start },
          status: SubscriptionStatusEnum.ACTIVE,
        },
      },
      {
        $group: {
          _id: null,
          initialActiveSubscriptionsCount: { $sum: 1 },
        },
      },
    ]);

    const activeSubscriptionsCount =
      activeSubscriptionsAggregation[0]?.activeSubscriptionsCount || 0;
    const initialActiveSubscriptionsCount =
      initialActiveSubscriptionsAggregation[0]
        ?.initialActiveSubscriptionsCount || 0;

    let subscriptionPercentageChange;
    if (initialActiveSubscriptionsCount === 0) {
      subscriptionPercentageChange = activeSubscriptionsCount > 0 ? 100 : 0;
    } else {
      subscriptionPercentageChange =
        ((activeSubscriptionsCount - initialActiveSubscriptionsCount) /
          initialActiveSubscriptionsCount) *
        100;
    }

    const likesCountAggregation = await Interaction.aggregate([
      {
        $match: {
          user: new Types.ObjectId(user.id),
          type: InteractionType.LIKE_POST,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          likesCount: { $sum: 1 },
        },
      },
    ]);

    const finalLikesCount = likesCountAggregation[0]?.likesCount || 0;

    const initialLikesCountAggregation = await Interaction.aggregate([
      {
        $match: {
          user: new Types.ObjectId(user.id),
          type: InteractionType.LIKE_POST,
          createdAt: { $lt: start },
        },
      },
      {
        $group: {
          _id: null,
          initialLikesCount: { $sum: 1 },
        },
      },
    ]);

    const initialLikesCount =
      initialLikesCountAggregation[0]?.initialLikesCount || 0;

    let percentageChangeLikes;
    if (initialLikesCount === 0) {
      percentageChangeLikes = finalLikesCount > 0 ? 100 : 0;
    } else {
      percentageChangeLikes =
        ((finalLikesCount - initialLikesCount) / initialLikesCount) * 100;
    }

    const mostRecentPost = await Post.findOne({ user: user.id })
      .sort({ createdAt: -1 })
      .select("_id")
      .lean();

    if (!mostRecentPost) {
      console.log("No post found");
    }

    const likesCountOnRecentPostAggregation = await Interaction.aggregate([
      {
        $match: {
          post: mostRecentPost?._id,
          type: InteractionType.LIKE_POST,
        },
      },
      {
        $group: {
          _id: null,
          likesCountOnRecentPost: { $sum: 1 },
        },
      },
    ]);

    const likesCountOnRecentPost =
      likesCountOnRecentPostAggregation[0]?.likesCountOnRecentPost || 0;

    let tippedmostRecentPost = 0;

    if (mostRecentPost?._id) {
      const transactions = await Transaction.find({
        productId: mostRecentPost?._id.toString(),
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
      });
      transactions.forEach((transaction) => {
        tippedmostRecentPost += transaction.amount;
      });
    }

    const mostLikedPostAggregation = await Interaction.aggregate([
      {
        $match: {
          user: new Types.ObjectId(user.id),
          type: InteractionType.LIKE_POST,
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$post",
          likesCount: { $sum: 1 },
        },
      },
      {
        $sort: { likesCount: -1 },
      },
      {
        $limit: 1,
      },
    ]);

    const mostLikedPostId = mostLikedPostAggregation[0]?._id;

    let likesCountOnMostLikedPost = 0;
    if (mostLikedPostId) {
      const likesOnMostLikedPostAggregation = await Interaction.aggregate([
        {
          $match: {
            post: mostLikedPostId,
            type: InteractionType.LIKE_POST,
          },
        },
        {
          $group: {
            _id: null,
            likesCount: { $sum: 1 },
          },
        },
      ]);

      likesCountOnMostLikedPost =
        likesOnMostLikedPostAggregation[0]?.likesCount || 0;
    }

    let tippedmostLikedPost = 0;
    if (mostLikedPostId?._id) {
      const transactions = await Transaction.find({
        productId: mostLikedPostId?._id.toString(),
        type: TransactionType.CREDIT,
        status: TransactionStatus.SUCCESS,
      });

      transactions.forEach((transaction) => {
        tippedmostLikedPost += transaction.amount;
      });
    }
    const userPosts = await Post.find({ user: user.id }).select("_id").lean();

    const postIds = userPosts.map((post) => post._id.toString());

    const transactionsForUserPosts = await Transaction.aggregate([
      {
        $match: {
          productId: { $in: postIds },
          type: TransactionType.CREDIT,
          status: TransactionStatus.SUCCESS,
        },
      },
      {
        $group: {
          _id: "$productId",
          totalTippedAmount: { $sum: "$amount" },
        },
      },
      {
        $sort: { totalTippedAmount: -1 },
      },
      {
        $limit: 1,
      },
    ]);

    const mostTippedPostId = transactionsForUserPosts[0]?._id;
    const mostTippedAmount =
      transactionsForUserPosts[0]?.totalTippedAmount || 0;

    let likesCountOnMostTippedPost = 0;
    if (mostTippedPostId) {
      const likesOnMostTippedPostAggregation = await Interaction.aggregate([
        {
          $match: {
            post: new Types.ObjectId(mostTippedPostId),
            type: InteractionType.LIKE_POST,
          },
        },
        {
          $group: {
            _id: null,
            likesCount: { $sum: 1 },
          },
        },
      ]);

      likesCountOnMostTippedPost =
        likesOnMostTippedPostAggregation[0]?.likesCount || 0;
    }

    const response: any = {
      statistics: [
        {
          title: "Followers",
          value: followersCount.toString(),
          percentageChange: parseFloat(percentageChange.toFixed(2)),
        },
        {
          title: "Subscribers",
          value: activeSubscriptionsCount.toString(),
          percentageChange: parseFloat(subscriptionPercentageChange.toFixed(2)),
        },
        {
          title: "Likes",
          value: finalLikesCount.toString(),
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
          liked: likesCountOnMostLikedPost,
          tipped: tippedmostLikedPost,
        },
        {
          title: "Most Tipped post",
          liked: likesCountOnMostTippedPost,
          tipped: mostTippedAmount,
        },
      ],
    };

    return res.json(response);
  } catch (error) {
    console.error(error, "Error while fetching creator stats");
    return res.status(500).json({ error: "Internal server error." });
  }
};
