import { Response, Request } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { findById, softDelete, Tables } from "../../../../lib/db";
import { RolesEnum } from "../../../../types/RolesEnum";

export const deletePostsAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const id = req.params.id;
    const postExists = await findById(Tables.POSTS, id);

    if (!postExists) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    if (
      postExists.user_id?.toString() !== user.id?.toString() &&
      user.role !== RolesEnum.ADMIN
    ) {
      return res.status(400).json({ error: { message: "Invalid post" } });
    }

    await softDelete(Tables.POSTS, id);

    return res.json({
      data: {
        message: "post deleted successfully.",
      },
    });
  } catch (error) {
    console.log("Error while deleting post", error);
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
