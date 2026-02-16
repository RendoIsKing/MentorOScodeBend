import { Router } from "express";
import { db, findById, findOne, findMany, updateById, Tables } from "../../lib/db";
import { supabaseAdmin } from "../../lib/supabase";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";
import { UserInterface } from "../../types/UserInterface";
import { validateZod } from "../../app/Middlewares";
import { z } from "zod";
import { nonEmptyString, objectId } from "../../app/Validation/requestSchemas";

const r = Router();
const emailSchema = z.object({ email: z.string().email() }).strict();
const setUsernameSchema = z.object({ userName: nonEmptyString }).strict();
const migratePostsSchema = z.object({ sourceUserId: objectId }).strict();
const setPasswordSchema = z.object({ password: nonEmptyString.min(8) }).strict();

function isValidId(id: string): boolean {
  return !!id && /^[0-9a-fA-F-]{24,36}$/.test(id);
}

// User-like object for JWT; ensure id is available
function toJwtUser(row: Record<string, any> | null): (UserInterface & { id?: string }) | null {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    id: row.id,
    firstName: row.first_name ?? row.firstName,
    lastName: row.last_name ?? row.lastName,
    email: row.email,
    role: row.role,
    phoneNumber: row.phone_number ?? row.phoneNumber,
    isActive: row.is_active ?? row.isActive ?? true,
    isVerified: row.is_verified ?? row.isVerified ?? false,
    isDeleted: row.is_deleted ?? row.isDeleted ?? false,
  } as UserInterface & { id?: string };
}

r.post("/dev/login-as", validateZod({ body: emailSchema }), async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
    if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "email required" });
    let user = await findOne(Tables.USERS, { email });
    if (!user) return res.status(404).json({ error: "user not found" });
    if (user.is_deleted || !user.is_active || !user.is_verified) {
      await updateById(Tables.USERS, user.id, {
        is_deleted: false,
        is_active: true,
        is_verified: true,
      });
      user = await findById(Tables.USERS, user.id) as any;
    }
    req.session = req.session || {};
    req.session.user = { id: user!.id };
    try {
      const jwtUser = toJwtUser(user);
      if (jwtUser) {
        const token = generateAccessToken(jwtUser as unknown as UserInterface);
        const refresh = generateRefreshToken(jwtUser as unknown as UserInterface);
        res.cookie("auth_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 15, path: "/" });
        res.cookie("refresh_token", refresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7, path: "/" });
      }
    } catch {}
    return res.json({ ok: true, userId: user!.id });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

// GET variant for convenience (dev only)
r.get("/dev/login-as", async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
    if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const email = req.query?.email as string | undefined;
    const userName = req.query?.userName as string | undefined;
    if (!email && !userName) return res.status(400).json({ error: "email or userName query required" });
    let user = email ? await findOne(Tables.USERS, { email }) : null;
    if (!user && userName) user = await findOne(Tables.USERS, { user_name: userName });
    if (!user) return res.status(404).json({ error: "user not found" });
    if (user.is_deleted || !user.is_active || !user.is_verified) {
      await updateById(Tables.USERS, user.id, {
        is_deleted: false,
        is_active: true,
        is_verified: true,
      });
      user = await findById(Tables.USERS, user.id) as any;
    }
    req.session = req.session || {};
    req.session.user = { id: user!.id };
    try {
      const jwtUser = toJwtUser(user);
      if (jwtUser) {
        const token = generateAccessToken(jwtUser as unknown as UserInterface);
        const refresh = generateRefreshToken(jwtUser as unknown as UserInterface);
        res.cookie("auth_token", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 15, path: "/" });
        res.cookie("refresh_token", refresh, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7, path: "/" });
      }
    } catch {}
    return res.json({ ok: true, userId: user!.id });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

export default r;

// Dev-only sanity endpoints
r.get("/me", (req: any, res) => {
  const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
  const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
  if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
  const id = req.session?.user?.id;
  if (id) return res.json({ ok: true, userId: id });
  return res.status(401).json({ ok: false });
});

r.get("/events", async (req: any, res) => {
  const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
  const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
  if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
  const id = req.session?.user?.id;
  if (!id) return res.status(401).json({ ok: false });
  const items = await findMany(Tables.CHANGE_EVENTS, { user_id: id }, { orderBy: "created_at", ascending: false, limit: 10 });
  return res.json({ ok: true, items });
});

// Dev-only: set current user's username
r.post("/dev/set-username", validateZod({ body: setUsernameSchema }), async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
    if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const newUserName = req.body?.userName as string;
    if (!newUserName) return res.status(400).json({ error: "userName required" });
    const current = req.session?.user?.id ? await findById(Tables.USERS, req.session.user.id) : null;
    if (!current) return res.status(401).json({ error: "no session" });
    const taken = await findOne(Tables.USERS, { user_name: newUserName });
    if (taken && String(taken.id) !== String(current.id)) return res.status(400).json({ error: "username taken" });
    await updateById(Tables.USERS, (current as any).id, { user_name: newUserName });
    return res.json({ ok: true, userId: (current as any).id, userName: newUserName });
  } catch (e) {
    return res.status(500).json({ error: "set username failed" });
  }
});

// Dev-only: migrate posts from source userId to current session user
r.post("/dev/migrate-posts", validateZod({ body: migratePostsSchema }), async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
    if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const source = req.body?.sourceUserId as string;
    if (!source || !isValidId(source)) return res.status(400).json({ error: "valid sourceUserId required" });
    const targetId = req.session?.user?.id;
    if (!targetId || !isValidId(targetId)) return res.status(401).json({ error: "no session" });
    const { data, error } = await db.from(Tables.POSTS).update({ user_id: targetId }).eq("user_id", source).select("id");
    const modified = error ? 0 : (data?.length ?? 0);
    return res.json({ ok: true, modified });
  } catch (e) {
    return res.status(500).json({ error: "migrate failed" });
  }
});

// Dev-only: set password for the current session user
r.post("/dev/set-password", validateZod({ body: setPasswordSchema }), async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    const devOn = enabled === "true" || process.env.NODE_ENV !== "production";
    if (!devOn) return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const pwd = req.body?.password as string;
    if (!pwd || pwd.length < 8) return res.status(400).json({ error: "password (>=8 chars) required" });
    const userId = req.session?.user?.id;
    if (!userId || !isValidId(userId)) return res.status(401).json({ error: "no session" });
    const user = await findById(Tables.USERS, userId);
    if (!user || !(user as any).auth_id) {
      return res.status(400).json({ error: "User not migrated to Supabase Auth (no auth_id)" });
    }
    await supabaseAdmin.auth.admin.updateUserById((user as any).auth_id, { password: pwd });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "set password failed" });
  }
});

// GET convenience for password set (dev only)
r.get("/dev/set-password", async (req: any, res) => {
  try {
    const enabled = String(process.env.DEV_LOGIN_ENABLED || "").trim().toLowerCase();
    if (enabled !== "true") return res.status(404).json({ error: "DEV_LOGIN_DISABLED", value: process.env.DEV_LOGIN_ENABLED });
    const pwd = req.query?.password as string | undefined;
    if (!pwd || pwd.length < 8) return res.status(400).json({ error: "password (>=8 chars) required" });
    const userId = req.session?.user?.id;
    if (!userId || !isValidId(userId)) return res.status(401).json({ error: "no session" });
    const user = await findById(Tables.USERS, userId);
    if (!user || !(user as any).auth_id) {
      return res.status(400).json({ error: "User not migrated to Supabase Auth (no auth_id)" });
    }
    await supabaseAdmin.auth.admin.updateUserById((user as any).auth_id, { password: pwd });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "set password failed" });
  }
});
