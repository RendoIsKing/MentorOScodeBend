import { Request, Response } from "express";
import { createPostAction } from "./Actions/createPost.action";
import { updatePostAction } from "./Actions/updatePost.action";
import { deletePostsAction } from "./Actions/deletePost.action";
import { getAllPostsActions } from "./Actions/getAllPosts.action";
import { getPostById } from "./Actions/getPostByIdAction";
import { getPostsOfUserByUserName } from "./Actions/getPostsOfUserAction";
import { getAllStoriesActions } from "./Actions/getAllStoriesAction";
import { getStoriesOfUserByUserName } from "./Actions/getStoriesOfUser";
import { getTaggedUsers } from "./Actions/getTaggedUserOfPost.action";
import { getFirstPost } from "./Actions/testPostAction";
import { deletePostByAdmin, getAdminPosts } from "./Actions/adminPostActions";

export class PostsController {
  static createPost = (req: Request, res: Response) => {
    createPostAction(req, res);
  };

  static updatePost = (req: Request, res: Response) => {
    updatePostAction(req, res);
  };

  static deletePost = (req: Request, res: Response) => {
    deletePostsAction(req, res);
  };

  static getAllPosts = (req: Request, res: Response) => {
    getAllPostsActions(req, res);
  };

  static getPostById = (req: Request, res:Response) => {
    getPostById(req, res);
  }

  static getPostsOfUserByUserName = (req: Request, res:Response) => {
    getPostsOfUserByUserName(req, res);
  }

  static getAllStoriesActions = (req: Request , res:Response) => {
    getAllStoriesActions(req, res);
  }

  static getStoriesOfUserByUserName = (req: Request, res:Response) => {
    getStoriesOfUserByUserName(req, res);
  }

  static getTaggedUsers = (req:Request,  res: Response) => {
    getTaggedUsers(req, res);
  }

  static getFirstPost = (req:Request,  res: Response) => {
    getFirstPost(req, res);
  }

  static getAdminPosts = (req: Request, res: Response) => {
    getAdminPosts(req, res);
  };

  static deletePostByAdmin = (req: Request, res: Response) => {
    deletePostByAdmin(req, res);
  };
}
