import { Request, Response } from "express";
import { plainToClass } from "class-transformer";
import { UserInterface } from "../../../../types/UserInterface";
import { UpdatePostDto } from "../Inputs/updatePost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { RolesEnum } from "../../../../types/RolesEnum";
import {
  db,
  findById,
  findOne,
  findMany,
  updateById,
  count,
  Tables,
} from "../../../../lib/db";

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

    const postExists = await findById(Tables.POSTS, postId);

    if (!postExists) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    if (
      postExists.user_id?.toString() !== user.id?.toString() &&
      user.role !== RolesEnum.ADMIN
    ) {
      return res.status(400).json({ error: { message: "Invalid post" } });
    }

    if (postInput.isPinned) {
      const pinnedPostsCount = await count(Tables.POSTS, {
        user_id: user.id,
        is_deleted: false,
        is_pinned: true,
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
      const validUsers = await findMany(
        Tables.USERS,
        { id: uniqueUserIds, is_deleted: false },
        { select: "id" }
      );

      if (validUsers.length !== uniqueUserIds.length) {
        return res
          .status(400)
          .json({ error: { message: "One or more user IDs are invalid." } });
      }
    }

    if (postInput.planToAccess) {
      const subscriptionPlan = await findOne(Tables.SUBSCRIPTION_PLANS, {
        user_id: user.id,
        title: postInput.planToAccess,
      });

      if (!subscriptionPlan) {
        return res
          .status(400)
          .json({ error: { message: "Invalid planToAccess value." } });
      }
    }

    // Build update object with snake_case keys
    const updates: Record<string, any> = {};
    if (postInput.content !== undefined) updates.content = postInput.content;
    if (postInput.planToAccess !== undefined)
      updates.plan_to_access = postInput.planToAccess;
    if (postInput.isPinned !== undefined)
      updates.is_pinned = postInput.isPinned;
    if (postInput.tags !== undefined) updates.tags = postInput.tags;
    if (postInput.privacy !== undefined) updates.privacy = postInput.privacy;
    if (postInput.price !== undefined) updates.price = postInput.price;
    if (postInput.status !== undefined) updates.status = postInput.status;
    if (postInput.type !== undefined) updates.type = postInput.type;

    const post = await updateById(Tables.POSTS, postId, updates);

    // Update media if provided (replace all)
    if (postInput.media) {
      await db.from(Tables.POST_MEDIA).delete().eq("post_id", postId);
      if (postInput.media.length > 0) {
        const mediaRows = postInput.media.map((m) => ({
          post_id: postId,
          media_id: m.mediaId,
          media_type: m.mediaType,
        }));
        await db.from(Tables.POST_MEDIA).insert(mediaRows);
      }
    }

    // Update user tags if provided (replace all)
    if (postInput.userTags) {
      await db.from(Tables.POST_USER_TAGS).delete().eq("post_id", postId);
      if (postInput.userTags.length > 0) {
        const tagRows = postInput.userTags.map((tag) => ({
          post_id: postId,
          user_id: tag.userId,
          user_name: tag.userName,
          location_x: tag.location.x,
          location_y: tag.location.y,
        }));
        await db.from(Tables.POST_USER_TAGS).insert(tagRows);
      }
    }

    return res.json({
      data: post,
    });
  } catch (error) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
