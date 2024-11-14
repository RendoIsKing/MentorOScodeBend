import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { UserInterface } from "../../../../types/UserInterface";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";

export const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

export const getAllStoriesActions = async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const postQuery = plainToClass(GetAllItemsInputs, req.query);
    const errors = await validate(postQuery);
    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const { perPage, page } = postQuery;

    let skip =
      ((page as number) > 0 ? (page as number) - 1 : 0) * (perPage as number);

    const posts = await Post.aggregate([
      // {
      //   $match: {
      //     user: user._id,
      //   },
      // },
      // {
      //   $unwind: "$media",
      // },
      {
        $match: {
          type: PostType.STORY,
          createdAt: { $gte: twentyFourHoursAgo },
          deletedAt: null,
          isDeleted: false,
        },
      },
      {
        $lookup: {
          from: "userconnections",
          let: { userId: "$user" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$owner", user._id] },
                    { $eq: ["$followingTo", "$$userId"] },
                  ],
                },
              },
            },
          ],
          as: "connections",
        },
      },
      {
        $match: {
          "connections.0": { $exists: true },
        },
      },

      {
        $lookup: {
          from: "files",
          localField: "media.mediaId",
          foreignField: "_id",
          as: "mediaFiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $lookup: {
          from: "files",
          localField: "userInfo.photoId",
          foreignField: "_id",
          as: "userInfo.photo",
        },
      },
      {
        $lookup: {
          from: "interactions",
          let: { postId: "$_id", userId: user?._id },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    { $eq: ["$interactedBy", "$$userId"] },
                    { $eq: ["$type", InteractionType.LIKE_STORY] },
                  ],
                },
              },
            },
          ],
          as: "likeInteractions", //for isLiked key
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$likeInteractions" }, 0] },
        },
      },
      // {
      //   $lookup: {
      //     from: "interactions",
      //     let: { postId: "$_id" },
      //     pipeline: [
      //       {
      //         $match: {
      //           $expr: {
      //             $and: [
      //               { $eq: ["$post", "$$postId"] },
      //               { $eq: ["$user", new Types.ObjectId(user._id)] },
      //               { $eq: ["$type", InteractionType.LIKE_STORY] },
      //             ],
      //           },
      //         },
      //       },
      //     ],
      //     as: "likes",
      //   },
      // },
      // {
      //   $addFields: {
      //     isLiked: { $gt: [{ $size: "$likes" }, 0] },
      //   },
      // },
      {
        $group: {
          _id: "$user",
          userInfo: { $first: "$userInfo" },
          stories: {
            $push: {
              _id: "$_id",
              media: "$media",
              content: "$content",
              isActive: "$isActive",
              isDeleted: "$isDeleted",
              type: "$type",
              createdAt: "$createdAt",
              updatedAt: "$updatedAt",
              mediaFiles: "$mediaFiles",
              isLiked: "$isLiked",
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          userInfo: {
            $mergeObjects: ["$userInfo", { stories: "$stories" }],
          },
        },
      },
      ...commonPaginationPipeline(page as number, perPage as number, skip),
    ]);
    let data = {
      data: posts[0]?.data ?? [],
      meta: posts[0]?.metaData?.[0] ?? {},
    };

    return res.json(data);
  } catch (err) {
    console.log("Error while getting stories", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
