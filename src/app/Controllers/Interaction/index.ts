import { Response, Request } from "express";
import { toggleLikeAction } from "./Actions/likePost.action";
import { commentAction } from "./Actions/commentPost.action";
import { softDeleteComment } from "./Actions/deleteCommentAction";
import { savePostAction } from "./Actions/savePostAction";
import { addNestedComment } from "./Actions/nestedCommentAction";
import { getCommentsByPostId } from "./Actions/getAllCommentsAction";
import { likeAComment } from "./Actions/likeACommentAction";
import { toggleLikeStoryAction } from "./Actions/likeStoryAction";
import { createImpression } from "./Actions/createImpressionAction";
import { logView } from "./Actions/logViewAction";

export class InteractionController {
  static toggleLike(req: Request, res: Response) {
    toggleLikeAction(req, res);
  }

  static postComment(req: Request, res: Response) {
    commentAction(req, res);
  }
  static softDeleteComment(req: Request, res: Response) {
    softDeleteComment(req, res);
  }

  static togglePost(req: Request, res: Response) {
    savePostAction(req, res);
  }

  static addNestedComment(req: Request, res: Response) {
    addNestedComment(req, res);
  }

  static getCommentsByPostId(req: Request, res: Response) {
    getCommentsByPostId(req, res);
  }

  static likeAComment(req: Request, res: Response) {
    likeAComment(req, res);
  }

  static toggleLikeStoryAction(req: Request, res: Response) {
    toggleLikeStoryAction(req, res);
  }

  static createImpression(req: Request, res: Response){
    createImpression(req, res);

  }

  static logView(req: Request, res: Response) {
    logView(req, res);
  }
}
