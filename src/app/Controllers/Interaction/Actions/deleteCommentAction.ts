import { Request, Response } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { RolesEnum } from "../../../../types/RolesEnum";
import { findById, findMany, updateById, Tables } from "../../../../lib/db";

/**
 * Recursively soft-delete all child comments via parent_id.
 * Replaces the old replies[] array traversal.
 */
const softDeleteChildComments = async (commentId: string) => {
  const children = await findMany(Tables.INTERACTIONS, {
    parent_id: commentId,
    is_deleted: false,
  });

  for (const child of children) {
    await updateById(Tables.INTERACTIONS, child.id, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    });
    await softDeleteChildComments(child.id);
  }
};

export const softDeleteComment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const id = req.params.id;

    const comment = await findById(Tables.INTERACTIONS, id);

    if (!comment) {
      return res.status(404).json({ error: { message: "Comment not found" } });
    }

    if (
      comment.interacted_by?.toString() !== user.id?.toString() &&
      user?.role !== RolesEnum.ADMIN
    ) {
      return res
        .status(400)
        .json({ error: { message: "You cannot delete this comment" } });
    }

    if (comment.is_deleted) {
      return res
        .status(400)
        .json({ error: { message: "Comment is already deleted" } });
    }

    await updateById(Tables.INTERACTIONS, id, {
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    });

    await softDeleteChildComments(id);

    return res.json({ message: "Comment/child comments deleted successfully" });
  } catch (error) {
    console.log(error, "error in deleting comment");
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
