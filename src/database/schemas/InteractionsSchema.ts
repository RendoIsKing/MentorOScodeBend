import { Schema, Types } from "mongoose";
import { InteractionType } from "../../types/enums/InteractionTypeEnum";
import { IInteractionSchema } from "../../types/interfaces/InteractionInterface";

const InteractionSchema: Schema<IInteractionSchema> = new Schema(
  {
    type: {
      type: String,
      enum: [
        InteractionType.LIKE_POST,
        InteractionType.LIKE_STORY,
        InteractionType.COMMENT,
        InteractionType.COLLECTION_SAVED,
        InteractionType.LIKE_COMMENT,
        InteractionType.IMPRESSION,
        InteractionType.VIEW,
      ],
    },
    post: {
      type: Types.ObjectId,
      ref: "Post",
    },
    user: {
      type: Types.ObjectId,
      ref: "User",
    },
    replies: [
      {
        type: Types.ObjectId,
        ref: "Interaction",
        // default: [],
      },
    ],
    likes: [
      {
        type: Types.ObjectId,
        ref: "Interaction",
        default: [],
      },
    ],
    interactedBy: {
      type: Types.ObjectId,
      ref: "User",
    },
    comment: String,

    isDeleted: {
      default: false,
      type: Boolean,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

// InteractionSchema.index({ post: 1, type: 1, user: 1 }, { unique: true });

export { InteractionSchema };
