import { Router } from "express";
import { PostsController } from "../app/Controllers/Posts";
import { Auth, OnlyAdmins, validateZod } from "../app/Middlewares";
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';
import ModerationReport from '../models/ModerationReport';
import { z } from 'zod';
import { nonEmptyString, objectIdParam } from "../app/Validation/requestSchemas";
import { MediaType } from "../types/enums/mediaTypeEnum";
import { PostStatusEnum } from "../types/enums/postStatuseEnum";
import { Privacy } from "../types/enums/privacyEnums";
import { PostType } from "../types/enums/postTypeEnum";

const PostRoutes: Router = Router();
PostRoutes.get("/test", PostsController.getFirstPost)

const mediaSchema = z.object({
  mediaId: nonEmptyString,
  mediaType: z.nativeEnum(MediaType),
}).strict();

const locationSchema = z.object({
  x: z.number(),
  y: z.number(),
}).strict();

const userTagSchema = z.object({
  location: locationSchema,
  userId: nonEmptyString,
  userName: nonEmptyString,
}).strict();

const createPostSchema = z.object({
  content: nonEmptyString,
  price: z.number().optional(),
  planToAccess: z.string().optional(),
  orientation: z.string().optional(),
  userTags: z.array(userTagSchema).optional(),
  media: z.array(mediaSchema),
  tags: z.array(z.string()),
  privacy: z.nativeEnum(Privacy),
  status: z.nativeEnum(PostStatusEnum),
  type: z.nativeEnum(PostType),
}).strict();

const updatePostSchema = z.object({
  content: z.string().optional(),
  planToAccess: z.string().optional(),
  isPinned: z.boolean().optional(),
  media: z.array(mediaSchema).optional(),
  tags: z.array(z.string()).optional(),
  privacy: z.nativeEnum(Privacy).optional(),
  userTags: z.array(userTagSchema).optional(),
  price: z.number().optional(),
  status: z.nativeEnum(PostStatusEnum).optional(),
  type: z.nativeEnum(PostType).optional(),
}).strict();

// Read endpoints require auth to compute personalized fields
PostRoutes.get("/story", Auth, PostsController.getAllStoriesActions);
PostRoutes.get("/user-story", Auth, PostsController.getStoriesOfUserByUserName);
PostRoutes.get("/users", Auth, PostsController.getPostsOfUserByUserName);
// Canonical plural route to match FE env
PostRoutes.post(
  "/posts",
  Auth,
  perUserIpLimiter({ windowMs: 60_000, max: 12 }) as any,
  validateZod({ body: createPostSchema }),
  PostsController.createPost
);
// Deprecated singular route (temporary)
PostRoutes.post(
  "/",
  Auth,
  validateZod({ body: createPostSchema }),
  (req, res, next)=>{ try{ console.warn('[DEPRECATION] POST /api/backend/v1/post/ is deprecated; use /api/backend/v1/post/posts'); }catch{}; return PostsController.createPost(req, res); }
);
PostRoutes.post("/:id", Auth, validateZod({ params: objectIdParam("id"), body: updatePostSchema }), PostsController.updatePost);
PostRoutes.delete("/:id", Auth, validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }), PostsController.deletePost);
PostRoutes.get("/", Auth, PostsController.getAllPosts);
PostRoutes.get("/:id", Auth, PostsController.getPostById);
PostRoutes.get("/tagged/:id", Auth, PostsController.getTaggedUsers);

// Basic moderation: report a post (idempotent per (post, reporter))
PostRoutes.post(
  '/:id/report',
  Auth,
  perUserIpLimiter({ windowMs: 60_000, max: 12 }) as any,
  validateZod({ params: objectIdParam("id"), body: z.object({ reason: nonEmptyString.max(500) }).strict() }),
  async (req, res) => {
  try {
    const { id } = req.params;
    const reason = req.body.reason;
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
    const { status, cursor } = req.query as any;
    const filter: any = {};
    if (status && ['open','resolved'].includes(String(status))) filter.status = String(status);
    if (cursor) filter._id = { $lt: cursor };
    const items = await ModerationReport.find(filter).sort({ _id: -1 }).limit(50).lean();
    const nextCursor = items.length ? String(items[items.length - 1]._id) : null;
    return res.json({ items: items.map((it: any) => ({ id: String(it._id), post: String(it.post), reporter: String(it.reporter), reason: it.reason, status: it.status, createdAt: it.createdAt })), nextCursor });
  } catch {
    return res.status(500).json({ error: { message: 'list failed' } });
  }
});

PostRoutes.post(
  '/moderation/reports/:id/resolve',
  OnlyAdmins,
  validateZod({ params: objectIdParam("id"), body: z.object({}).strict() }),
  async (req, res) => {
  try {
    const { id } = req.params;
    // const { action, notes } = (req.body || {}) as any; // reserved for future moderation actions
    await ModerationReport.updateOne({ _id: id as any }, { $set: { status: 'resolved' } });
    // Optional: if action === 'remove', you could hide the post here.
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: { message: 'resolve failed' } });
  }
});

export default PostRoutes;
