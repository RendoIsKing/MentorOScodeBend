import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { SubscriptionPlanType } from "../../../../types/enums/subscriptionPlanEnum";

export const getSubscriptionPlan = async (
  _req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id: queryId } = _req.query;
    const user = _req.user as UserInterface;

    let dataToFind: any = {
      isDeleted: false,
      $or: [
        { planType: SubscriptionPlanType.CUSTOM },
        { planType: SubscriptionPlanType.FIXED },
      ],
    };

    // const LIMIT = 10;

    // const perPage =
    //   _req.query &&
    //   _req.query.perPage &&
    //   parseInt(_req.query.perPage as string) > 0
    //     ? parseInt(_req.query.perPage as string)
    //     : LIMIT;

    // const page =
    //   _req.query && _req.query.page && parseInt(_req.query.page as string) > 0
    //     ? parseInt(_req.query.page as string)
    //     : 1;
    // let skip = (page - 1) * perPage;

    if (_req.query.search) {
      dataToFind = {
        ...dataToFind,
        $or: [{ title: { $regex: _req.query.search } }],
      };
      //   skip = 0;
    }

    const userId = queryId ? queryId : user._id;

    const [query]: any = await SubscriptionPlan.aggregate([
      {
        $match: {
          userId: userId,
        },
      },
      {
        $facet: {
          results: [
            { $match: dataToFind },
            // { $skip: skip },
            // { $limit: perPage },
            { $sort: { createdAt: -1 } },
            {
              $unwind: "$featureIds",
            },
            {
              $lookup: {
                from: "features",
                localField: "featureIds",
                foreignField: "_id",
                as: "featureIds",
              },
            },
            {
              $unwind: "$featureIds",
            },
            {
              $group: {
                _id: "$_id",
                featureIds: { $push: "$featureIds" },
                title: { $first: "$title" },
                description: { $first: "$description" },
                price: { $first: "$price" },
                isDeleted: { $first: "$isDeleted" },
                planType: { $first: "$planType" },
                createdAt: { $first: "$createdAt" },
                updatedAt: { $first: "$updatedAt" },
              },
            },
          ],
          planCount: [{ $match: dataToFind }, { $count: "count" }],
        },
      },
    ]);

    // const planCount = query.planCount[0]?.count || 0;
    // const totalPages = Math.ceil(planCount / perPage);

    return res.json({
      data: query.results,
      //   meta: {
      //     perPage: perPage,
      //     page: _req.query.page || 1,
      //     pages: totalPages,
      //     total: planCount,
      //   },
    });
  } catch (err) {
    console.log(err, "Error while fetching subscription plan");
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};

// new addition: 
export const getOneSubscriptionPlanForAllUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    // Define the price to query
    const queryPrice = 20;

    // Fetch the subscription plan with the specified price
    const subscriptionPlan = await SubscriptionPlan.findOne({
      price: queryPrice,
      isDeleted: false,
    });

    // Check if a subscription plan was found
    if (!subscriptionPlan) {
      return res.status(404).json({
        success: false,
        message: `No subscription plan found for price ${queryPrice}.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: subscriptionPlan,
    });
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching the subscription plan.",
      error: error.message,
    });
  }
};
