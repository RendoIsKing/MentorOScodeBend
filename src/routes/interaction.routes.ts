import { Router } from "express";
import { InteractionController } from "../app/Controllers/Interaction";
import { Auth } from "../app/Middlewares";

const InteractionRoutes: Router = Router();

InteractionRoutes.post(
  "/toggle-like/:id",
  Auth,
  InteractionController.toggleLike
);
InteractionRoutes.post("/comment/:id", Auth, InteractionController.postComment);
InteractionRoutes.delete(
  "/comment/:id",
  Auth,
  InteractionController.softDeleteComment
);
InteractionRoutes.post(
  "/toggle-saved/:id",
  Auth,
  InteractionController.togglePost
);
InteractionRoutes.post(
  "/reply-comment/:id",
  Auth,
  InteractionController.addNestedComment
);
InteractionRoutes.get(
  "/comments/:id",
  Auth,
  InteractionController.getCommentsByPostId
);
InteractionRoutes.post(
  "/like-comment/:id",
  Auth,
  InteractionController.likeAComment
);
InteractionRoutes.post(
  "/like-story/:id",
  Auth,
  InteractionController.toggleLikeStoryAction
);
InteractionRoutes.post(
  "/impressions",
  Auth,
  InteractionController.createImpression
);
InteractionRoutes.post("/log-view", Auth, InteractionController.logView);

export default InteractionRoutes;
