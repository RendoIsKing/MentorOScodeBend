import { Router } from "express";
import { PostsController } from "../app/Controllers/Posts";
import { Auth, OnlyAdmins } from "../app/Middlewares";
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import ModerationReport from '../models/ModerationReport';
import { z } from 'zod';

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

// Basic moderation: report a post (idempotent per (post, reporter))
PostRoutes.post('/:id/report', Auth, perUserIpLimiter({ windowMs: 60_000, max: 12 }) as any, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = z.object({ reason: z.string().trim().min(1).max(500) });
    const parsed = schema.safeParse({ reason: req.body?.reason });
    if (!parsed.success) return res.status(422).json({ error: 'validation_failed', details: parsed.error.flatten() });
    const reason = parsed.data.reason;
    // @ts-ignore
    const reporter = req.user?._id;
    await ModerationReport.updateOne(
      { post: id as any, reporter },
      { $setOnInsert: { post: id as any, reporter }, $set: { reason, status: 'open' } },
      { upsert: true }
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: { message: 'report failed' } });
  }
});

// Minimal admin endpoints for moderation queue
PostRoutes.get('/moderation/reports', OnlyAdmins, async (req, res) => {
  try {
    const items = await ModerationReport.find({}).sort({ createdAt: -1 }).limit(50).lean();
    return res.json({ items: items.map(it => ({ id: String(it._id), post: String((it as any).post), reporter: String((it as any).reporter), reason: (it as any).reason, status: (it as any).status, createdAt: (it as any).createdAt })) });
  } catch {
    return res.status(500).json({ error: { message: 'list failed' } });
  }
});

PostRoutes.post('/moderation/reports/:id/resolve', OnlyAdmins, async (req, res) => {
  try {
    const { id } = req.params;
    await ModerationReport.updateOne({ _id: id as any }, { $set: { status: 'resolved' } });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: { message: 'resolve failed' } });
  }
});

export default PostRoutes;
