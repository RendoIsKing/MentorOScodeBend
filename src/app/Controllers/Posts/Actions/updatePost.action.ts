import { Request, Response } from "express";
import { plainToClass } from "class-transformer";
import { UserInterface } from "../../../../types/UserInterface";
import { UpdatePostDto } from "../Inputs/updatePost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { FeatureInterface } from "../../../../types/FeatureInterface";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { User } from "../../../Models/User";
import { RolesEnum } from "../../../../types/RolesEnum";

export const updatePostAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postInput = plainToClass(UpdatePostDto, req.body);
    const postId = req.params.id;
    const errors = await validate(postInput);

    if (errors.length) {
      const errorsInfo: ValidationErrorResponse[] = errors.map((error) => ({
        property: error.property,
        constraints: error.constraints,
      }));

      return res
        .status(400)
        .json({ error: { message: "VALIDATIONS_ERROR", info: errorsInfo } });
    }

    const postExists = await Post.findById(postId);

    if (!postExists) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    if (
      postExists.user.toString() !== user.id &&
      user.role !== RolesEnum.ADMIN
    ) {
      return res.status(400).json({ error: { message: "Invalid post" } });
    }

    if (postInput.isPinned) {
      const pinnedPostsCount = await Post.countDocuments({
        user: user.id,
        deletedAt: null,
        isDeleted: false,
        isPinned: true,
      });

      if (pinnedPostsCount >= 3) {
        return res
          .status(400)
          .json({ error: { message: "You can only pin up to 3 posts." } });
      }
    }

    if (postInput.userTags && postInput.userTags.length > 0) {
      const userIds = postInput.userTags.map((tag) => tag.userId);
      const uniqueUserIds = [...new Set(userIds)];
      const validUserIds = await User.find(
        { _id: { $in: uniqueUserIds }, deletedAt: null, isDeleted: false },
        "_id"
      ).lean();

      if (validUserIds.length !== uniqueUserIds.length) {
        return res
          .status(400)
          .json({ error: { message: "One or more user IDs are invalid." } });
      }
    }

    if (postInput.planToAccess) {
      const subscriptionPlan = await SubscriptionPlan.findOne({
        userId: user.id,
        title: postInput.planToAccess,
      });

      if (!subscriptionPlan) {
        return res
          .status(400)
          .json({ error: { message: "Invalid planToAccess value." } });
      }

      subscriptionPlan.permissions.map((permission: FeatureInterface) => ({
        name: permission.feature,
        description: permission.description,
      }));
    }

    const post = await Post.findByIdAndUpdate(
      postId,
      {
        ...postInput,
      },
      { new: true }
    );

    return res.json({
      data: post,
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
