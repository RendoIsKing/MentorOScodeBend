import { Request, Response } from "express";
import { Interaction } from "../../../Models/Interaction";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import { File } from "../../../Models/File";

const populateInteractedBy = async (comment: any) => {
  if (!comment) return null;

  let interaction = { ...comment.toObject() };

  if (interaction.replies && interaction.replies.length > 0) {
    interaction.replies = await Promise.all(
      interaction.replies.map(async (replyId: any) => {
        const reply = await Interaction.findOne({
          _id: replyId,
          isDeleted: false,
        })
          .populate("interactedBy")
          .exec();
        return populateInteractedBy(reply);
      })
    );
  }

  interaction.interactedBy = await Interaction.populate(
    interaction.interactedBy,
    { path: "interactedBy" }
  );

  if (interaction.interactedBy && interaction.interactedBy.photoId) {
    const photo = await File.findById(interaction.interactedBy.photoId).exec();
    interaction.interactedBy.photo = photo;
  }

  return interaction;
};

export const getCommentsByPostId = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { id } = req.params;

    const postComments = await Interaction.find({
      post: id,
      type: InteractionType.COMMENT,
      isDeleted: false,
      deletedAt: null,
    })
      .populate("interactedBy")
      .exec();

    const populatedComments = await Promise.all(
      postComments.map(async (comment: any) => {
        return populateInteractedBy(comment);
      })
    );

    const replyIds = new Set<string>();
    const collectReplyIds = (comment: any) => {
      if (comment && comment.replies && comment.replies.length > 0) {
        comment.replies.forEach((reply: any) => {
          if (reply) {
            replyIds.add(reply._id.toString());
            collectReplyIds(reply);
          }
        });
      }
    };

    populatedComments.forEach((comment) => collectReplyIds(comment));

    // Filter out comments that are replies
    const filteredComments = populatedComments.filter((comment) => {
      return comment && !replyIds.has(comment._id.toString());
    });

    if (filteredComments.length === 0) {
      return res
        .status(200)
        .json({ data: [], error: { message: "No comments to show." } });
    }

    return res.json({
      data: filteredComments,
      message: "Comments retrieved successfully.",
    });
  } catch (error) {
    console.log("Error in getting all comments", error);
    return res
      .status(500)
      .json({ error: { message: "Something went wrong." } });
  }
};
