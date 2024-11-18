import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { Interaction } from "../../../Models/Interaction";
import { RolesEnum } from "../../../../types/RolesEnum";

const softDeleteChildComments = async (commentId: string) => {
  const comment = await Interaction.findById(commentId);

  if (comment && comment.replies && comment.replies.length > 0) {
    for (const replyId of comment.replies) {
      const reply = await Interaction.findById(replyId);
      if (reply && !reply.isDeleted) {
        reply.isDeleted = true;
        reply.deletedAt = new Date();
        await reply.save();
        await softDeleteChildComments(reply._id.toString());
      }
    }
  }
};

export const softDeleteComment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const id = req.params.id;

    const comment = await Interaction.findById(id);

    if (!comment) {
      return res.status(404).json({ error: { message: "Comment not found" } });
    }

    if (
      comment.interactedBy.toString() !== user.id.toString() &&
      user?.role !== RolesEnum.ADMIN
    ) {
      return res
        .status(400)
        .json({ error: { message: "You cannot delete this comment" } });
    }

    if (comment.isDeleted) {
      return res
        .status(400)
        .json({ error: { message: "Comment is already deleted" } });
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    await softDeleteChildComments(comment._id.toString());

    return res.json({ message: "Comment/child comments deleted successfully" });
  } catch (error) {
    console.log(error, "error in deleting comment");
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
