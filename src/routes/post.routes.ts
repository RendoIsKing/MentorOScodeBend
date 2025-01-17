import { Router } from "express";
import { PostsController } from "../app/Controllers/Posts";
import { Auth } from "../app/Middlewares";

const PostRoutes: Router = Router();
PostRoutes.get("/test", PostsController.getFirstPost)

PostRoutes.get("/story", Auth, PostsController.getAllStoriesActions);
PostRoutes.get("/user-story", Auth, PostsController.getStoriesOfUserByUserName);
PostRoutes.get("/users", PostsController.getPostsOfUserByUserName);
PostRoutes.post("/", Auth, PostsController.createPost);
PostRoutes.post("/:id", Auth, PostsController.updatePost);
PostRoutes.delete("/:id", Auth, PostsController.deletePost);
PostRoutes.get("/", Auth, PostsController.getAllPosts);
PostRoutes.get("/:id", Auth, PostsController.getPostById);
PostRoutes.get("/tagged/:id", Auth, PostsController.getTaggedUsers);

export default PostRoutes;
