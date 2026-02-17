import { Request, Response } from "express";
import { plainToClass } from "class-transformer";
import { CreatePostDto } from "../Inputs/createPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { UserInterface } from "../../../../types/UserInterface";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { createPayPerViewProductOnStripe } from "../../../../utils/stripe/createPayPerViewProductOnStripe";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";
import { db, findOne, findMany, insertOne, Tables } from "../../../../lib/db";

export const createPostAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;

    // Normalise enum fields to UPPERCASE so they match PostgreSQL enums
    const body = { ...req.body };
    if (typeof body.privacy === "string") body.privacy = body.privacy.toUpperCase();
    if (typeof body.status === "string") body.status = body.status.toUpperCase();
    if (typeof body.type === "string") body.type = body.type.toUpperCase();

    const postInput = plainToClass(CreatePostDto, body);
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

    let accessibleFeatures: any = [];
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

      accessibleFeatures = (subscriptionPlan.permissions || []).map(
        (permission: any) => ({
          name: permission.feature,
          description: permission.description,
        })
      );
    }

    let stripePayperViewProduct;
    if (postInput.privacy == Privacy.PAY_PER_VIEW) {
      stripePayperViewProduct = await createPayPerViewProductOnStripe({
        title: "POST per view",
        description: postInput.content,
        stripe_currency: stripe_currency,
        price: +postInput.price,
      });
    }

    // Insert the post
    const post = await insertOne(Tables.POSTS, {
      content: postInput.content,
      price: postInput.price,
      plan_to_access: postInput.planToAccess,
      orientation: postInput.orientation,
      tags: postInput.tags,
      privacy: postInput.privacy,
      status: postInput.status,
      type: postInput.type,
      user_id: user.id,
      accessible_to: accessibleFeatures,
      ...(stripePayperViewProduct
        ? {
            stripe_product_id: (stripePayperViewProduct as any)?.id,
            stripe_product: stripePayperViewProduct,
          }
        : {}),
    });

    if (!post) {
      return res
        .status(500)
        .json({ error: { message: "Failed to create post" } });
    }

    // Insert media into post_media table
    if (postInput.media && postInput.media.length > 0) {
      const mediaRows = postInput.media.map((m) => ({
        post_id: post.id,
        media_id: m.mediaId,
        media_type: m.mediaType,
      }));
      await db.from(Tables.POST_MEDIA).insert(mediaRows);
    }

    // Insert user tags into post_user_tags table
    if (postInput.userTags && postInput.userTags.length > 0) {
      const tagRows = postInput.userTags.map((tag) => ({
        post_id: post.id,
        user_id: tag.userId,
        user_name: tag.userName,
        location_x: tag.location.x,
        location_y: tag.location.y,
      }));
      await db.from(Tables.POST_USER_TAGS).insert(tagRows);
    }

    return res.status(201).json({ postId: String(post.id), data: post });
  } catch (error) {
    console.log("Error while posting content", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
