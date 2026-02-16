import { Router, Request, Response } from "express";
import { Auth as ensureAuth } from "../app/Middlewares";
import { createMulterInstance, uploadToSupabase } from "../app/Middlewares/fileUpload";
import { db, Tables, findMany, insertOne, deleteById } from "../lib/db";

const upload = createMulterInstance("uploads/avatars");

const r = Router();

const DID_API_KEY = (process.env.DID_API_KEY || "").trim();
const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
const ELEVENLABS_VOICE_ID = (process.env.ELEVENLABS_VOICE_ID || "").trim();

const DID_BASE = "https://api.d-id.com";

function getDidAuth(): string {
  return `Basic ${Buffer.from(DID_API_KEY).toString("base64")}`;
}

// ── Helper: pick a random active avatar URL for a mentor ──────────────────────
async function getRandomAvatarUrl(mentorId: string): Promise<string | null> {
  const avatars = await findMany(Tables.AGENT_AVATARS, { mentor_id: mentorId, is_active: true }, {
    select: "url",
    orderBy: "sort_order",
    ascending: true,
  });
  if (!avatars.length) return null;
  const idx = Math.floor(Math.random() * avatars.length);
  return (avatars[idx] as any).url;
}

// ── AVATAR IMAGE MANAGEMENT (mentor uploads) ─────────────────────────────────

/**
 * GET /avatar/images
 * List all avatar images for the current mentor.
 */
r.get("/images", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const mentorId = req.user?.id || req.user?._id;
    const rows = await findMany(Tables.AGENT_AVATARS, { mentor_id: mentorId }, {
      orderBy: "sort_order",
      ascending: true,
    });
    return res.json({ data: rows });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * POST /avatar/images
 * Add a new avatar image URL.
 * Body: { url: string, label?: string }
 */
r.post("/images", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const mentorId = req.user?.id || req.user?._id;
    const { url, label } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "url_required" });
    }

    const row = await insertOne(Tables.AGENT_AVATARS, {
      mentor_id: mentorId,
      url: url.trim(),
      label: (label || "").trim(),
      is_active: true,
    });

    return res.json({ data: row });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * POST /avatar/images/upload
 * Upload an image file to Supabase Storage, then save the public URL.
 * Expects multipart/form-data with field "file".
 */
r.post(
  "/images/upload",
  ensureAuth as any,
  upload.single("file"),
  uploadToSupabase("avatars"),
  async (req: any, res: Response) => {
    try {
      const mentorId = req.user?.id || req.user?._id;
      const file = req.file;

      if (!file || !file.path) {
        return res.status(400).json({ error: "no_file", message: "Upload a file with field name 'file'" });
      }

      const publicUrl = (file as any).publicUrl || file.path;

      const row = await insertOne(Tables.AGENT_AVATARS, {
        mentor_id: mentorId,
        url: publicUrl,
        label: (req.body?.label || "").trim(),
        is_active: true,
      });

      return res.json({ data: row });
    } catch (err: any) {
      console.error("[Avatar] Upload error:", err?.message);
      return res.status(500).json({ error: "internal" });
    }
  }
);

/**
 * PATCH /avatar/images/:id
 * Update an avatar image (toggle active, change label, reorder).
 */
r.patch("/images/:id", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const mentorId = req.user?.id || req.user?._id;
    const { id } = req.params;
    const { is_active, label, sort_order } = req.body || {};

    const updates: Record<string, any> = {};
    if (typeof is_active === "boolean") updates.is_active = is_active;
    if (typeof label === "string") updates.label = label.trim();
    if (typeof sort_order === "number") updates.sort_order = sort_order;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: "no_updates" });
    }

    const { data, error } = await db
      .from(Tables.AGENT_AVATARS)
      .update(updates)
      .eq("id", id)
      .eq("mentor_id", mentorId)
      .select()
      .single();

    if (error) return res.status(404).json({ error: "not_found" });
    return res.json({ data });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * DELETE /avatar/images/:id
 * Remove an avatar image.
 */
r.delete("/images/:id", ensureAuth as any, async (req: any, res: Response) => {
  try {
    const mentorId = req.user?.id || req.user?._id;

    // Verify ownership first
    const { data: existing } = await db
      .from(Tables.AGENT_AVATARS)
      .select("id")
      .eq("id", req.params.id)
      .eq("mentor_id", mentorId)
      .single();

    if (!existing) return res.status(404).json({ error: "not_found" });

    await deleteById(Tables.AGENT_AVATARS, req.params.id);
    return res.json({ deleted: true });
  } catch {
    return res.status(500).json({ error: "internal" });
  }
});

// ── VIDEO GENERATION (D-ID Talks API) ────────────────────────────────────────

/**
 * POST /avatar/generate
 * Body: { text: string, mentorId?: string }
 * Generates a lip-synced video using a random avatar image.
 */
r.post("/generate", ensureAuth as any, async (req: Request, res: Response): Promise<any> => {
  try {
    const { text, mentorId } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text_required" });
    }

    if (!DID_API_KEY) {
      return res.status(503).json({ error: "did_not_configured", message: "D-ID API key not set" });
    }

    // Get avatar URL from database (random rotation)
    const targetMentorId = mentorId || (req as any).user?.id || (req as any).user?._id;
    const avatarUrl = await getRandomAvatarUrl(targetMentorId);

    if (!avatarUrl) {
      return res.status(404).json({
        error: "no_avatar",
        message: "Ingen avatar-bilder lastet opp. Gå til Mentor Settings for å laste opp bilder.",
      });
    }

    const trimmedText = text.trim().slice(0, 2000);
    console.log(`[Avatar] Generating video for ${trimmedText.length} chars, avatar from DB`);

    // Step 1: Generate audio via ElevenLabs (Majen's cloned voice)
    let audioUrl: string | undefined;

    if (ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID) {
      try {
        const audioRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: trimmedText,
              model_id: "eleven_v3",
              language_code: "nb",
              voice_settings: {
                stability: 0.45,
                similarity_boost: 0.80,
                style: 0.15,
                use_speaker_boost: true,
              },
            }),
          }
        );

        if (audioRes.ok) {
          const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
          audioUrl = `data:audio/mpeg;base64,${audioBuffer.toString("base64")}`;
          console.log(`[Avatar] ElevenLabs audio: ${audioBuffer.length} bytes`);
        } else {
          console.warn("[Avatar] ElevenLabs failed, falling back to D-ID TTS:", audioRes.status);
        }
      } catch (err: any) {
        console.warn("[Avatar] ElevenLabs error:", err?.message);
      }
    }

    // Step 2: Create D-ID talk
    const didBody: any = {
      source_url: avatarUrl,
      config: { stitch: true, result_format: "mp4" },
    };

    if (audioUrl) {
      didBody.script = { type: "audio", audio_url: audioUrl };
    } else {
      didBody.script = {
        type: "text",
        input: trimmedText,
        provider: { type: "microsoft", voice_id: "nb-NO-PernilleNeural" },
      };
    }

    const didRes = await fetch(`${DID_BASE}/talks`, {
      method: "POST",
      headers: {
        Authorization: getDidAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(didBody),
    });

    if (!didRes.ok) {
      const errText = await didRes.text().catch(() => "");
      console.error("[Avatar] D-ID error:", didRes.status, errText);
      return res.status(didRes.status).json({
        error: "did_failed",
        message: `D-ID returned ${didRes.status}`,
        detail: errText.slice(0, 200),
      });
    }

    const didData: any = await didRes.json();
    console.log(`[Avatar] D-ID talk created: id=${didData.id}`);

    return res.json({ id: didData.id, status: didData.status || "created" });
  } catch (err: any) {
    console.error("[Avatar] Error:", err?.message || err);
    if (!res.headersSent) return res.status(500).json({ error: "internal" });
  }
});

/**
 * GET /avatar/status/:id
 * Poll for video generation status.
 */
r.get("/status/:id", ensureAuth as any, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !DID_API_KEY) return res.status(400).json({ error: "invalid_request" });

    const didRes = await fetch(`${DID_BASE}/talks/${id}`, {
      headers: { Authorization: getDidAuth() },
    });

    if (!didRes.ok) return res.status(didRes.status).json({ error: "did_poll_failed" });

    const data: any = await didRes.json();
    return res.json({
      status: data.status || "unknown",
      result_url: data.result_url || null,
      duration: data.duration || null,
    });
  } catch (err: any) {
    console.error("[Avatar] Poll error:", err?.message);
    return res.status(500).json({ error: "internal" });
  }
});

/**
 * GET /avatar/config
 * Whether avatar generation is available for the current user.
 */
r.get("/config", ensureAuth as any, async (req: any, res: Response) => {
  const mentorId = req.user?.id || req.user?._id;
  let hasAvatars = false;
  try {
    const { count } = await db
      .from(Tables.AGENT_AVATARS)
      .select("id", { count: "exact", head: true })
      .eq("mentor_id", mentorId)
      .eq("is_active", true);
    hasAvatars = (count || 0) > 0;
  } catch {}

  res.json({
    available: Boolean(DID_API_KEY) && hasAvatars,
    hasVoice: Boolean(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
    hasAvatars,
  });
});

export default r;
