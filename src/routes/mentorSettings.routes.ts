import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";

const MentorSettingsRoutes: Router = Router();

// GET /mentor-settings — get mentor settings (branding + payment info)
MentorSettingsRoutes.get("/", Auth as any, async (req: Request, res: Response) => {
  try {
    const user = req.user as UserInterface;
    if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

    // Branding
    const { data: branding } = await db
      .from(Tables.MENTOR_BRANDING)
      .select("*")
      .eq("mentor_id", user.id)
      .maybeSingle();

    // Payment info (from users table)
    const { data: userRow } = await db
      .from(Tables.USERS)
      .select("payout_bank_name, payout_account_number, payout_routing_number, stripe_connect_id")
      .eq("id", user.id)
      .maybeSingle();

    // Checklist
    const { data: checklist } = await db
      .from(Tables.MENTOR_CHECKLIST)
      .select("step_key, completed, completed_at")
      .eq("mentor_id", user.id);

    return res.json({
      branding: branding
        ? {
            primaryColor: branding.primary_color,
            secondaryColor: branding.secondary_color,
            accentColor: branding.accent_color,
          }
        : { primaryColor: "#0078D7", secondaryColor: "#00AEEF", accentColor: "#10B981" },
      payment: {
        bankName: userRow?.payout_bank_name || null,
        accountNumber: userRow?.payout_account_number ? "****" + userRow.payout_account_number.slice(-4) : null,
        routingNumber: userRow?.payout_routing_number || null,
        stripeConnectId: userRow?.stripe_connect_id || null,
        hasPayoutMethod: !!(userRow?.payout_bank_name || userRow?.stripe_connect_id),
      },
      checklist: (checklist || []).map((c: any) => ({
        stepKey: c.step_key,
        completed: c.completed,
        completedAt: c.completed_at,
      })),
    });
  } catch (err) {
    console.error("[mentor-settings] get error:", err);
    return res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// PUT /mentor-settings/branding
const brandingSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  secondaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
});

MentorSettingsRoutes.put(
  "/branding",
  Auth as any,
  validateZod({ body: brandingSchema }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const { primaryColor, secondaryColor, accentColor } = req.body;

      const { data: existing } = await db
        .from(Tables.MENTOR_BRANDING)
        .select("id")
        .eq("mentor_id", user.id)
        .maybeSingle();

      const updates: any = {};
      if (primaryColor) updates.primary_color = primaryColor;
      if (secondaryColor) updates.secondary_color = secondaryColor;
      if (accentColor) updates.accent_color = accentColor;

      if (existing) {
        await updateById(Tables.MENTOR_BRANDING, existing.id, updates);
      } else {
        await insertOne(Tables.MENTOR_BRANDING, { mentor_id: user.id, ...updates });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("[mentor-settings] branding error:", err);
      return res.status(500).json({ error: "Failed to update branding" });
    }
  }
);

// PUT /mentor-settings/payment
const paymentSchema = z.object({
  bankName: z.string().max(200).optional(),
  accountNumber: z.string().max(50).optional(),
  routingNumber: z.string().max(50).optional(),
});

MentorSettingsRoutes.put(
  "/payment",
  Auth as any,
  validateZod({ body: paymentSchema }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      const { bankName, accountNumber, routingNumber } = req.body;
      if (!user.id) return res.status(401).json({ error: "Unauthorized" });

      const updates: any = {};
      if (bankName !== undefined) updates.payout_bank_name = bankName;
      if (accountNumber !== undefined) updates.payout_account_number = accountNumber;
      if (routingNumber !== undefined) updates.payout_routing_number = routingNumber;

      await updateById(Tables.USERS, user.id, updates);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[mentor-settings] payment error:", err);
      return res.status(500).json({ error: "Failed to update payment info" });
    }
  }
);

// POST /mentor-settings/checklist/:stepKey/complete
MentorSettingsRoutes.post(
  "/checklist/:stepKey/complete",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });

      await db
        .from(Tables.MENTOR_CHECKLIST)
        .upsert(
          {
            mentor_id: user.id,
            step_key: req.params.stepKey,
            completed: true,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "mentor_id,step_key" }
        );

      return res.json({ ok: true });
    } catch (err) {
      console.error("[mentor-settings] checklist error:", err);
      return res.status(500).json({ error: "Failed to update checklist" });
    }
  }
);

export default MentorSettingsRoutes;
