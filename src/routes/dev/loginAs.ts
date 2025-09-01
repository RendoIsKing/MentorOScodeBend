import { Router } from "express";
import { User } from "../../app/Models/User";
import { Post } from "../../app/Models/Post";
import { Types } from "mongoose";
import { genSaltSync, hashSync } from 'bcryptjs';

const r = Router();

r.post("/dev/login-as", async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "email required" });
    const user = await (User as any).findOne({ email });
    if (!user) return res.status(404).json({ error: "user not found" });
    req.session = req.session || {};
    req.session.user = { id: user._id.toString() };
    return res.json({ ok: true, userId: user._id.toString() });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

// GET variant for convenience (dev only)
r.get("/dev/login-as", async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const email = (req.query?.email as string | undefined);
    const userName = (req.query?.userName as string | undefined);
    if (!email && !userName) return res.status(400).json({ error: "email or userName query required" });
    let user = email ? await (User as any).findOne({ email }) : null;
    if (!user && userName) user = await (User as any).findOne({ userName });
    if (!user) return res.status(404).json({ error: "user not found" });
    req.session = req.session || {};
    req.session.user = { id: user._id.toString() };
    return res.json({ ok: true, userId: user._id.toString() });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

export default r;

// Dev-only: set current user's username
r.post('/dev/set-username', async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const newUserName = req.body?.userName as string;
    if (!newUserName) return res.status(400).json({ error: 'userName required' });
    const current = req.session?.user?.id ? await (User as any).findById(req.session.user.id) : null;
    if (!current) return res.status(401).json({ error: 'no session' });
    const taken = await (User as any).findOne({ userName: newUserName });
    if (taken && String(taken._id) !== String(current._id)) return res.status(400).json({ error: 'username taken' });
    current.userName = newUserName;
    await current.save();
    return res.json({ ok: true, userId: current._id.toString(), userName: current.userName });
  } catch (e) {
    return res.status(500).json({ error: 'set username failed' });
  }
});

// Dev-only: migrate posts from source userId to current session user
r.post('/dev/migrate-posts', async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const source = req.body?.sourceUserId as string;
    if (!source || !Types.ObjectId.isValid(source)) return res.status(400).json({ error: 'valid sourceUserId required' });
    const targetId = req.session?.user?.id;
    if (!targetId || !Types.ObjectId.isValid(targetId)) return res.status(401).json({ error: 'no session' });
    const result = await Post.updateMany({ user: new Types.ObjectId(source) }, { $set: { user: new Types.ObjectId(targetId) } });
    return res.json({ ok: true, modified: result.modifiedCount ?? (result as any).nModified });
  } catch (e) {
    return res.status(500).json({ error: 'migrate failed' });
  }
});

// Dev-only: set password for the current session user
r.post('/dev/set-password', async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const pwd = req.body?.password as string;
    if (!pwd || pwd.length < 6) return res.status(400).json({ error: 'password (>=6 chars) required' });
    const userId = req.session?.user?.id;
    if (!userId || !Types.ObjectId.isValid(userId)) return res.status(401).json({ error: 'no session' });
    const salt = genSaltSync(10);
    const hashed = hashSync(pwd, salt);
    await (User as any).updateOne({ _id: new Types.ObjectId(userId) }, { $set: { password: hashed } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'set password failed' });
  }
});

// GET convenience for password set (dev only)
r.get('/dev/set-password', async (req: any, res) => {
  try {
    if (process.env.DEV_LOGIN_ENABLED !== "true") return res.status(404).end();
    const pwd = req.query?.password as string | undefined;
    if (!pwd || pwd.length < 6) return res.status(400).json({ error: 'password (>=6 chars) required' });
    const userId = req.session?.user?.id;
    if (!userId || !Types.ObjectId.isValid(userId)) return res.status(401).json({ error: 'no session' });
    const salt = genSaltSync(10);
    const hashed = hashSync(pwd, salt);
    await (User as any).updateOne({ _id: new Types.ObjectId(userId) }, { $set: { password: hashed } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'set password failed' });
  }
});
