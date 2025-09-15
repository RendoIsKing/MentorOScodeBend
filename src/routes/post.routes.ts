import { Router } from "express";
import { PostsController } from "../app/Controllers/Posts";
import { Auth } from "../app/Middlewares";

const PostRoutes: Router = Router();
PostRoutes.get("/test", PostsController.getFirstPost)

PostRoutes.get("/story", Auth, PostsController.getAllStoriesActions);
PostRoutes.get("/user-story", Auth, PostsController.getStoriesOfUserByUserName);
PostRoutes.get("/users", PostsController.getPostsOfUserByUserName);
// Canonical plural route to match FE env
PostRoutes.post("/posts", Auth, PostsController.createPost);
// Deprecated singular route (temporary)
PostRoutes.post("/", Auth, (req, res, next)=>{ try{ console.warn('[DEPRECATION] POST /api/backend/v1/post/ is deprecated; use /api/backend/v1/post/posts'); }catch{}; return PostsController.createPost(req, res); });
PostRoutes.post("/:id", Auth, PostsController.updatePost);
PostRoutes.delete("/:id", Auth, PostsController.deletePost);
PostRoutes.get("/", Auth, PostsController.getAllPosts);
PostRoutes.get("/:id", Auth, PostsController.getPostById);
PostRoutes.get("/tagged/:id", Auth, PostsController.getTaggedUsers);

export default PostRoutes;
