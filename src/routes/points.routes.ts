import { Router, Response } from "express";
import { Auth as ensureAuth } from "../app/Middlewares";
import { db, Tables, findMany, insertOne, upsert } from "../lib/db";

const r = Router();

// ── Point categories and their point values ─────────────────────────────────
const POINT_VALUES: Record<string, number> = {
  logged_workout: 10,
  logged_meal: 5,
  logged_weight: 5,
  hit_protein_target: 15,
  hit_calorie_target: 10,
  completed_session: 20,
  "3_day_streak": 25,
  "7_day_streak": 75,
  "14_day_streak": 150,
  "30_day_streak": 500,
  weight_milestone: 50,
  strength_pr: 30,
  first_photo: 10,
  weekly_checkin: 15,
  improvement_1pct: 20,
  improvement_5pct: 100,
  improvement_10pct: 250,
};

const REASON_TO_CATEGORY: Record<string, string> = {
  logged_workout: "discipline",
  logged_meal: "nutrition",
  logged_weight: "discipline",
  hit_protein_target: "nutrition",
  hit_calorie_target: "nutrition",
  completed_session: "strength",
  "3_day_streak": "consistency",
  "7_day_streak": "consistency",
  "14_day_streak": "consistency",
  "30_day_streak": "consistency",
  weight_milestone: "improvement",
  strength_pr: "strength",
  first_photo: "discipline",
  weekly_checkin: "discipline",
  improvement_1pct: "improvement",
  improvement_5pct: "improvement",
  improvement_10pct: "improvement",
};

/**
 * POST /points/award
 * Award points to a user. Called internally by the agent or by other services.
 * Body: { reason: string, metadata?: object }
 */
r.post("/award", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { reason, metadata } = req.body || {};

    if (!reason || !POINT_VALUES[reason]) {
      return res.status(400).json({ error: "invalid_reason", valid: Object.keys(POINT_VALUES) });
    }

    const points = POINT_VALUES[reason];
    const category = REASON_TO_CATEGORY[reason] || "discipline";

    // Insert point entry
    const entry = await insertOne(Tables.USER_POINTS, {
      user_id: userId,
      category,
      points,
      reason,
      metadata: metadata || {},
    });

    // Update summary
    await updatePointsSummary(userId);

    return res.json({ data: entry, points_awarded: points, category });
  } catch (err: any) {
    console.error("[Points] Award error:", err?.message);
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * GET /points/summary
 * Get the current user's point summary.
 */
r.get("/summary", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const { data: summary } = await db
      .from(Tables.USER_POINTS_SUMMARY)
      .select("*")
      .eq("user_id", userId)
      .single();

    if (!summary) {
      return res.json({
        data: {
          total_points: 0,
          strength: 0,
          endurance: 0,
          discipline: 0,
          nutrition: 0,
          improvement: 0,
          consistency: 0,
          current_streak: 0,
          best_streak: 0,
          improvement_pct: 0,
        },
      });
    }

    return res.json({ data: summary });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * GET /points/history
 * Get recent point awards.
 */
r.get("/history", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);

    const rows = await findMany(Tables.USER_POINTS, { user_id: userId }, {
      orderBy: "created_at",
      ascending: false,
      limit,
    });

    return res.json({ data: rows });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * GET /points/leaderboard
 * Global leaderboard or competition leaderboard.
 */
r.get("/leaderboard", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const competitionId = req.query.competition;
    const limit = Math.min(parseInt(String(req.query.limit)) || 20, 50);

    if (competitionId) {
      // Competition-specific leaderboard
      const { data } = await db
        .from(Tables.COMPETITION_PARTICIPANTS)
        .select("user_id, points, rank, users(name, profile_picture)")
        .eq("competition_id", competitionId)
        .eq("share_stats", true)
        .order("points", { ascending: false })
        .limit(limit);

      return res.json({ data: data || [] });
    }

    // Global leaderboard
    const { data } = await db
      .from(Tables.USER_POINTS_SUMMARY)
      .select("user_id, total_points, strength, endurance, discipline, nutrition, improvement, consistency, current_streak, improvement_pct, users(name, profile_picture)")
      .order("total_points", { ascending: false })
      .limit(limit);

    return res.json({ data: data || [] });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── COMPETITIONS ────────────────────────────────────────────────────────────

/**
 * GET /points/competitions
 * List active competitions.
 */
r.get("/competitions", ensureAuth as any, async (_req: any, res: Response) => {
  try {
    const { data } = await db
      .from(Tables.COMPETITIONS)
      .select("*, competition_participants(count)")
      .eq("is_active", true)
      .order("start_date", { ascending: false });

    return res.json({ data: data || [] });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * POST /points/competitions/:id/join
 * Join a competition.
 */
r.post("/competitions/:id/join", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { share_stats } = req.body || {};

    const entry = await upsert(
      Tables.COMPETITION_PARTICIPANTS,
      {
        competition_id: id,
        user_id: userId,
        share_stats: share_stats !== false,
        points: 0,
      },
      "competition_id,user_id",
    );

    return res.json({ data: entry });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * DELETE /points/competitions/:id/leave
 * Leave a competition.
 */
r.delete("/competitions/:id/leave", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const { id } = req.params;

    await db
      .from(Tables.COMPETITION_PARTICIPANTS)
      .delete()
      .eq("competition_id", id)
      .eq("user_id", userId);

    return res.json({ left: true });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── FREE TRIAL ──────────────────────────────────────────────────────────────

/**
 * GET /points/trial-status
 * Check how many free messages the user has left.
 */
r.get("/trial-status", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const { data: user } = await db
      .from(Tables.USERS)
      .select("free_messages_used, free_messages_limit, trial_started_at")
      .eq("id", userId)
      .single();

    const used = user?.free_messages_used || 0;
    const limit = user?.free_messages_limit || 20;

    return res.json({
      used,
      limit,
      remaining: Math.max(0, limit - used),
      exhausted: used >= limit,
      trial_started_at: user?.trial_started_at || null,
    });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * POST /points/trial-increment
 * Increment the free message counter. Called after each AI response for non-paying users.
 */
r.post("/trial-increment", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const { data: user } = await db
      .from(Tables.USERS)
      .select("free_messages_used, free_messages_limit, trial_started_at")
      .eq("id", userId)
      .single();

    const used = (user?.free_messages_used || 0) + 1;
    const limit = user?.free_messages_limit || 20;

    const updates: Record<string, any> = { free_messages_used: used };
    if (!user?.trial_started_at) {
      updates.trial_started_at = new Date().toISOString();
    }

    await db.from(Tables.USERS).update(updates).eq("id", userId);

    return res.json({
      used,
      remaining: Math.max(0, limit - used),
      exhausted: used >= limit,
    });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── Helper: recalculate point summary ───────────────────────────────────────
async function updatePointsSummary(userId: string) {
  try {
    const { data: rows } = await db
      .from(Tables.USER_POINTS)
      .select("category, points")
      .eq("user_id", userId);

    if (!rows) return;

    const cats: Record<string, number> = {
      strength: 0, endurance: 0, discipline: 0,
      nutrition: 0, improvement: 0, consistency: 0,
    };
    let total = 0;

    for (const row of rows) {
      total += row.points;
      if (cats[row.category] !== undefined) {
        cats[row.category] += row.points;
      }
    }

    await upsert(
      Tables.USER_POINTS_SUMMARY,
      {
        user_id: userId,
        total_points: total,
        ...cats,
        updated_at: new Date().toISOString(),
      },
      "user_id",
    );
  } catch (err: any) {
    console.error("[Points] Summary update error:", err?.message);
  }
}

export default r;
