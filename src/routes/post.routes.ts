import { Router } from "express";
import { PostsController } from "../app/Controllers/Posts";
import { Auth } from "../app/Middlewares";
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import ModerationReport from '../models/ModerationReport';

const PostRoutes: Router = Router();
PostRoutes.get("/test", PostsController.getFirstPost)

PostRoutes.get("/story", Auth, PostsController.getAllStoriesActions);
PostRoutes.get("/user-story", Auth, PostsController.getStoriesOfUserByUserName);
PostRoutes.get("/users", PostsController.getPostsOfUserByUserName);
// Canonical plural route to match FE env
PostRoutes.post("/posts", Auth, perUserIpLimiter({ windowMs: 60_000, max: 12 }) as any, PostsController.createPost);
// Deprecated singular route (temporary)
PostRoutes.post("/", Auth, (req, res, next)=>{ try{ console.warn('[DEPRECATION] POST /api/backend/v1/post/ is deprecated; use /api/backend/v1/post/posts'); }catch{}; return PostsController.createPost(req, res); });
PostRoutes.post("/:id", Auth, PostsController.updatePost);
PostRoutes.delete("/:id", Auth, PostsController.deletePost);
PostRoutes.get("/", Auth, PostsController.getAllPosts);
PostRoutes.get("/:id", Auth, PostsController.getPostById);
PostRoutes.get("/tagged/:id", Auth, PostsController.getTaggedUsers);

// Basic moderation: report a post
PostRoutes.post('/:id/report', Auth, async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String((req.body?.reason || '').toString().slice(0, 500));
    // @ts-ignore
    const reporter = req.user?._id;
    await ModerationReport.create({ post: id as any, reporter, reason });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: { message: 'report failed' } });
  }
});

export default PostRoutes;
