import { Request, Response } from "express";
import { plainToClass } from "class-transformer";
import { CreatePostDto } from "../Inputs/createPost.input";
import { validate } from "class-validator";
import { ValidationErrorResponse } from "../../../../types/ValidationErrorResponse";
import { Post } from "../../../Models/Post";
import { UserInterface } from "../../../../types/UserInterface";
import { SubscriptionPlan } from "../../../Models/SubscriptionPlan";
import { FeatureInterface } from "../../../../types/FeatureInterface";
import { User } from "../../../Models/User";
import { Privacy } from "../../../../types/enums/privacyEnums";
import { createPayPerViewProductOnStripe } from "../../../../utils/stripe/createPayPerViewProductOnStripe";
import { stripe_currency } from "../../../../utils/consts/stripeCurrency";

export const createPostAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postInput = plainToClass(CreatePostDto, req.body);
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

    let accessibleFeatures: any = [];
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

      accessibleFeatures = subscriptionPlan.permissions.map(
        (permission: FeatureInterface) => ({
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

    const post = await Post.create({
      ...postInput,
      ...(stripePayperViewProduct
        ? {
            stripeProductId: (stripePayperViewProduct as any)?.id,
            stripePayperViewProduct,
          }
        : {}),
      ...(stripePayperViewProduct
        ? {
            stripeProduct: stripePayperViewProduct,
            stripePayperViewProduct,
          }
        : {}),
      //   content: postInput.content.map((content) => {

      //   }),
      user: user.id,
      accessibleTo: accessibleFeatures,
    });

    return res.status(201).json({ postId: String(post._id), data: post });
  } catch (error) {
    console.log("Error while posting content", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
