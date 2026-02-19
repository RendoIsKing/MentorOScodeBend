import { Router, Request, Response } from "express";
import { z } from "zod";
import { Auth, validateZod } from "../app/Middlewares";
import { db, Tables, insertOne, updateById } from "../lib/db";
import { UserInterface } from "../types/UserInterface";
import stripeInstance from "../utils/stripe";

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
      .select("payout_bank_name, payout_account_number, payout_routing_number, stripe_connect_id, platform_fee_percent")
      .eq("id", user.id)
      .maybeSingle();

    // Checklist
    const { data: checklist } = await db
      .from(Tables.MENTOR_CHECKLIST)
      .select("step_key, completed, completed_at")
      .eq("mentor_id", user.id);

    let connectStatus: "not_connected" | "pending" | "connected" = "not_connected";
    if (userRow?.stripe_connect_id) {
      try {
        const acct = await stripeInstance.accounts.retrieve(userRow.stripe_connect_id);
        connectStatus = acct.charges_enabled && acct.payouts_enabled ? "connected" : "pending";
      } catch {
        connectStatus = "pending";
      }
    }

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
      connectStatus,
      platformFeePercent: userRow?.platform_fee_percent ?? 20,
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

// POST /mentor-settings/connect-onboard — create/reuse Stripe Express account and return onboarding URL
MentorSettingsRoutes.post(
  "/connect-onboard",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });
      if (!user.id) return res.status(401).json({ error: "Unauthorized" });

      const { data: userRow } = await db
        .from(Tables.USERS)
        .select("stripe_connect_id, email")
        .eq("id", user.id)
        .maybeSingle();

      let accountId = userRow?.stripe_connect_id;

      if (!accountId) {
        const account = await stripeInstance.accounts.create({
          type: "express",
          email: userRow?.email || undefined,
          metadata: { mentorId: user.id },
        });
        accountId = account.id;
        await updateById(Tables.USERS, user.id, { stripe_connect_id: accountId });
      }

      const returnUrl = req.body.returnUrl || `${req.headers.origin || req.headers.referer || "http://localhost:3000"}/mentor/settings?stripe=complete`;
      const refreshUrl = req.body.refreshUrl || `${req.headers.origin || req.headers.referer || "http://localhost:3000"}/mentor/settings?stripe=refresh`;

      const accountLink = await stripeInstance.accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });

      return res.json({ url: accountLink.url, accountId });
    } catch (err) {
      console.error("[mentor-settings] connect-onboard error:", err);
      return res.status(500).json({ error: "Failed to create Stripe onboarding link" });
    }
  }
);

// GET /mentor-settings/connect-status — check Stripe Connect account status
MentorSettingsRoutes.get(
  "/connect-status",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });
      if (!user.id) return res.status(401).json({ error: "Unauthorized" });

      const { data: userRow } = await db
        .from(Tables.USERS)
        .select("stripe_connect_id, platform_fee_percent")
        .eq("id", user.id)
        .maybeSingle();

      if (!userRow?.stripe_connect_id) {
        return res.json({ status: "not_connected", chargesEnabled: false, payoutsEnabled: false, platformFeePercent: userRow?.platform_fee_percent ?? 20 });
      }

      const account = await stripeInstance.accounts.retrieve(userRow.stripe_connect_id);

      const status = account.charges_enabled && account.payouts_enabled ? "connected" : "pending";

      return res.json({
        status,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        platformFeePercent: userRow.platform_fee_percent ?? 20,
      });
    } catch (err) {
      console.error("[mentor-settings] connect-status error:", err);
      return res.status(500).json({ error: "Failed to check Stripe status" });
    }
  }
);

// GET /mentor-settings/payouts — paginated payout history for logged-in mentor
MentorSettingsRoutes.get(
  "/payouts",
  Auth as any,
  async (req: Request, res: Response) => {
    try {
      const user = req.user as UserInterface;
      if (!user?.isMentor) return res.status(403).json({ error: "Mentor access required" });
      if (!user.id) return res.status(401).json({ error: "Unauthorized" });

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const perPage = Math.min(50, parseInt(req.query.perPage as string) || 20);
      const offset = (page - 1) * perPage;

      const { data: payouts, count } = await db
        .from(Tables.PAYOUTS)
        .select("id, amount, currency, platform_fee, stripe_transfer_id, status, created_at", { count: "exact" })
        .eq("mentor_id", user.id)
        .order("created_at", { ascending: false })
        .range(offset, offset + perPage - 1);

      return res.json({
        payouts: (payouts || []).map((p: any) => ({
          id: p.id,
          amount: Number(p.amount),
          currency: p.currency,
          platformFee: Number(p.platform_fee),
          stripeTransferId: p.stripe_transfer_id,
          status: p.status,
          createdAt: p.created_at,
        })),
        total: count || 0,
        page,
        perPage,
      });
    } catch (err) {
      console.error("[mentor-settings] payouts error:", err);
      return res.status(500).json({ error: "Failed to fetch payouts" });
    }
  }
);

// GET /mentor-settings/branding/:mentorId — public: fetch branding for a mentor
MentorSettingsRoutes.get("/branding/:mentorId", async (req: Request, res: Response) => {
  try {
    const { data: branding } = await db
      .from(Tables.MENTOR_BRANDING)
      .select("primary_color, secondary_color, accent_color")
      .eq("mentor_id", req.params.mentorId)
      .maybeSingle();

    return res.json({
      primaryColor: branding?.primary_color || "#0078D7",
      secondaryColor: branding?.secondary_color || "#00AEEF",
      accentColor: branding?.accent_color || "#10B981",
    });
  } catch (err) {
    console.error("[mentor-settings] public branding error:", err);
    return res.json({ primaryColor: "#0078D7", secondaryColor: "#00AEEF", accentColor: "#10B981" });
  }
});

export default MentorSettingsRoutes;
