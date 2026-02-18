import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, findById, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

const DiscountCodeRoutes: Router = Router();

const createBody = z.object({
  code: z.string().trim().min(3).max(30).toUpperCase(),
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  maxUses: z.number().int().min(1).optional(),
  validUntil: z.string().datetime().optional(),
  planId: z.string().uuid().optional(),
});

// GET /discount-codes — list mentor's codes
DiscountCodeRoutes.get("/", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    const { data: codes } = await db
      .from(Tables.DISCOUNT_CODES)
      .select("*")
      .eq("mentor_id", user.id)
      .order("created_at", { ascending: false });

    return res.json({
      codes: (codes || []).map((c: any) => ({
        id: c.id,
        code: c.code,
        discountPercent: c.discount_percent,
        discountAmount: c.discount_amount,
        maxUses: c.max_uses,
        currentUses: c.current_uses,
        validUntil: c.valid_until,
        planId: c.plan_id,
        isActive: c.is_active,
        createdAt: c.created_at,
      })),
    });
  } catch (err) {
    console.error("[discount-codes] list error:", err);
    return res.status(500).json({ error: "Failed to fetch discount codes" });
  }
});

// POST /discount-codes
DiscountCodeRoutes.post(
  "/",
  Auth as any,
  validateZod({ body: createBody }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const { code, discountPercent, discountAmount, maxUses, validUntil, planId } = req.body;

      const disc = await insertOne(Tables.DISCOUNT_CODES, {
        mentor_id: user.id,
        code: code.toUpperCase(),
        discount_percent: discountPercent || 0,
        discount_amount: discountAmount || 0,
        max_uses: maxUses || null,
        valid_until: validUntil || null,
        plan_id: planId || null,
      });

      if (!disc) return res.status(409).json({ error: "Code already exists" });

      return res.status(201).json({ code: disc });
    } catch (err: any) {
      if (err?.code === "23505") return res.status(409).json({ error: "Discount code already exists" });
      console.error("[discount-codes] create error:", err);
      return res.status(500).json({ error: "Failed to create discount code" });
    }
  }
);

// PUT /discount-codes/:id — toggle active/inactive
DiscountCodeRoutes.put("/:id", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const code = await findById(Tables.DISCOUNT_CODES, req.params.id);
    if (!code || code.mentor_id !== user.id) return res.status(404).json({ error: "Not found" });

    await updateById(Tables.DISCOUNT_CODES, code.id, { is_active: !code.is_active });
    return res.json({ ok: true, isActive: !code.is_active });
  } catch (err) {
    console.error("[discount-codes] toggle error:", err);
    return res.status(500).json({ error: "Failed to update discount code" });
  }
});

// DELETE /discount-codes/:id
DiscountCodeRoutes.delete("/:id", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    const code = await findById(Tables.DISCOUNT_CODES, req.params.id);
    if (!code || code.mentor_id !== user.id) return res.status(404).json({ error: "Not found" });

    await db.from(Tables.DISCOUNT_CODES).delete().eq("id", code.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[discount-codes] delete error:", err);
    return res.status(500).json({ error: "Failed to delete discount code" });
  }
});

// POST /discount-codes/validate — public: validate a code
const validateBody = z.object({
  code: z.string().trim().min(1),
  mentorId: z.string().uuid(),
  planId: z.string().uuid().optional(),
});

DiscountCodeRoutes.post(
  "/validate",
  validateZod({ body: validateBody }),
  async (req: Request, res: Response) => {
    try {
      const { code, mentorId, planId } = req.body;

      let query = db
        .from(Tables.DISCOUNT_CODES)
        .select("*")
        .eq("mentor_id", mentorId)
        .eq("code", code.toUpperCase())
        .eq("is_active", true);

      const { data: disc } = await query.maybeSingle();

      if (!disc) return res.status(404).json({ valid: false, error: "Invalid code" });

      const now = new Date();
      if (disc.valid_until && new Date(disc.valid_until) < now) {
        return res.json({ valid: false, error: "Code has expired" });
      }
      if (disc.max_uses && disc.current_uses >= disc.max_uses) {
        return res.json({ valid: false, error: "Code has reached max uses" });
      }
      if (disc.plan_id && planId && disc.plan_id !== planId) {
        return res.json({ valid: false, error: "Code not valid for this plan" });
      }

      return res.json({
        valid: true,
        discountPercent: disc.discount_percent,
        discountAmount: Number(disc.discount_amount),
      });
    } catch (err) {
      console.error("[discount-codes] validate error:", err);
      return res.status(500).json({ error: "Failed to validate code" });
    }
  }
);

export default DiscountCodeRoutes;
