import { Schema, Types } from "mongoose";
import { IPostSchema } from "../../types/interfaces/postsInterface";
import { MediaType } from "../../types/enums/mediaTypeEnum";
import { Privacy } from "../../types/enums/privacyEnums";
import { PostStatusEnum } from "../../types/enums/postStatuseEnum";
import { PostType } from "../../types/enums/postTypeEnum";
import { FeatureSchema } from "./featureSchema";

interface IMedia {
  mediaId: Types.ObjectId;
  mediaType: MediaType;
}

interface ILocation {
  x: number;
  y: number;
}

interface IUserTag {
  location: ILocation;
  userId: Types.ObjectId;
}

const LocationSchema: Schema<ILocation> = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
});

const UserTagSchema: Schema<IUserTag> = new Schema({
  location: { type: LocationSchema, required: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
});

const MediaSchema: Schema<IMedia> = new Schema({
  mediaId: Types.ObjectId,
  mediaType: {
    type: String,
    enum: [MediaType.IMAGE, MediaType.LIVE, MediaType.VIDEO, MediaType.STORY],
  },
});

const PostSchema: Schema<IPostSchema> = new Schema(
  {
    media: [MediaSchema],
    content: String,
    price: {
      type: Number,
      default: 0,
    },
    orientation: String,
    tags: {
      type: [String],
    },
    privacy: {
      type: String,
      enum: [
        Privacy.FOLLOWERS,
        Privacy.FRIENDS,
        Privacy.PRIVATE,
        Privacy.PUBLIC,
        Privacy.SUBSCRIBER,
        Privacy.PAY_PER_VIEW,
      ],
    },
    status: {
      type: String,
      enum: [
        PostStatusEnum.DRAFT,
        PostStatusEnum.FLAGGED,
        PostStatusEnum.PUBLISHED,
        PostStatusEnum.RESTRICTED,
        PostStatusEnum.UNPUBLISHED,
      ],
    },
    user: {
      type: Types.ObjectId,
      ref: "User",
    },

    isActive: {
      default: true,
      type: Boolean,
    },
    isPinned: {
      default: false,
      type: Boolean,
    },
    isDeleted: {
      default: false,
      type: Boolean,
    },
    deletedAt: Date,
    type: {
      type: String,
      enum: [PostType.POST, PostType.STORY],
    },
    accessibleTo: {
      type: [{ type: FeatureSchema }],
      default: [],
    },
    userTags: {
      type: [{ type: UserTagSchema }],
      default: [],
    },
    stripeProductId: String,
    stripeProduct: {
      type: {},
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

export { PostSchema };
