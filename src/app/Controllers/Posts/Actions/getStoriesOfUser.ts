import { Response, Request } from "express";
import { plainToClass } from "class-transformer";
import { GetAllItemsInputs } from "../Inputs/getPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { commonPaginationPipeline } from "../../../../utils/pipeline/commonPagination";
import { User } from "../../../Models/User";
import { PostType } from "../../../../types/enums/postTypeEnum";
import { Types } from "mongoose";
import { twentyFourHoursAgo } from "./getAllStoriesAction";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { UserInterface } from "../../../../types/UserInterface";

export const getStoriesOfUserByUserName = async (
  req: Request,
  res: Response
) => {
  try {
    const { userName } = req.query;
    if (!userName) {
      return res
        .status(400)
        .json({ error: "userName query parameter is required." });
    }

    const user = await User.findOne({ userName });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const loggedInUser = req.user as UserInterface;

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
      {
        $match: {
          user: new Types.ObjectId(user.id),
          type: PostType.STORY,
          createdAt: { $gte: twentyFourHoursAgo },
          privacy: Privacy.PUBLIC,
          deletedAt: null,
          isDeleted: false,
        },
      },
      // {
      //   $unwind: "$media",
      // },
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
          let: { postId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$post", "$$postId"] },
                    {
                      $eq: [
                        "$interactedBy",
                        new Types.ObjectId(loggedInUser._id),
                      ],
                    },
                    { $eq: ["$type", InteractionType.LIKE_STORY] },
                  ],
                },
              },
            },
          ],
          as: "likes",
        },
      },
      {
        $addFields: {
          isLiked: { $gt: [{ $size: "$likes" }, 0] },
        },
      },
      {
        $project: {
          _id: 1,
          user: 1,
          media: 1,
          content: 1,
          isActive: 1,
          isDeleted: 1,
          type: 1,
          createdAt: 1,
          updatedAt: 1,
          mediaFiles: 1,
          userInfo: 1,
          isLiked: 1,
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
    console.log("Error while getting stories of user", err);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong.", err } });
  }
};
