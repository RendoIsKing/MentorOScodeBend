import { Schema } from "mongoose";

const ContentSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  subContent: {
    type: [String],
    required: true,
  },
});

const TopicSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: [ContentSchema],
    required: true,
  },
});

const FAQSchema = new Schema(
  {
    topics: {
      type: [TopicSchema],
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export { FAQSchema };
