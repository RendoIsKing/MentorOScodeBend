import { Response, Request } from "express";
import { UserInterface } from "../../../../types/UserInterface";
import { InteractionType } from "../../../../types/enums/InteractionTypeEnum";
import {
  findById,
  findOne,
  insertOne,
  deleteById,
  Tables,
} from "../../../../lib/db";

export const savePostAction = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user as UserInterface;
    const postId = req.params.id;
    const postExists = await findById(Tables.POSTS, postId);

    if (!postExists || postExists.is_deleted) {
      return res.status(400).json({ error: { message: "Post not exist" } });
    }

    const saveInteractionExist = await findOne(Tables.INTERACTIONS, {
      user_id: postExists.user_id,
      interacted_by: user.id,
      type: InteractionType.COLLECTION_SAVED,
      post_id: postId,
    });

    if (saveInteractionExist) {
      await deleteById(Tables.INTERACTIONS, saveInteractionExist.id);
      return res.json({
        data: {
          message: "Saved post removed",
        },
      });
    }

    const savedInteraction = await insertOne(Tables.INTERACTIONS, {
      user_id: postExists.user_id,
      interacted_by: user.id,
      type: InteractionType.COLLECTION_SAVED,
      post_id: postId,
      collection_id: user.primaryCollection
        ? [user.primaryCollection]
        : [],
    });

    return res.json({
      data: savedInteraction,
      message: "Interaction saved .",
    });
  } catch (err) {
    return res.status(500).json({ error: { message: "Something went wrong" } });
  }
};
