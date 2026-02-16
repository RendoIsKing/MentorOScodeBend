import { Router, Request, Response } from "express";
import { Auth as ensureAuth } from "../app/Middlewares";

const r = Router();

const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
const ELEVENLABS_VOICE_ID = (process.env.ELEVENLABS_VOICE_ID || "").trim();

// Eleven v3 — most expressive model, supports 70+ languages and audio tags
// Supports: [laughs], [sighs], [happily], [sadly], [whispers], [shouts], [clears throat]
const ELEVENLABS_MODEL = "eleven_v3";
const ELEVENLABS_LANGUAGE = "nb"; // Norwegian Bokmål

/**
 * Strip ElevenLabs audio tags from text for logging/display purposes.
 */
function stripAudioTags(text: string): string {
  return text.replace(/\[(laughs|sighs|happily|sadly|whispers|shouts|clears throat|angry|excited)\]/gi, "").trim();
}

/**
 * POST /tts/speak
 * Body: { text: string }
 * Returns: audio/mpeg stream
 *
 * Converts text to speech using ElevenLabs Eleven v3 with the mentor's cloned voice.
 * The text may contain audio tags like [laughs], [happily], etc. for expressiveness.
 */
r.post("/speak", ensureAuth as any, async (req: Request, res: Response): Promise<any> => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "text_required" });
    }

    if (!ELEVENLABS_API_KEY || !ELEVENLABS_VOICE_ID) {
      return res.status(503).json({
        error: "tts_not_configured",
        message: "ElevenLabs API key or voice ID not configured",
      });
    }

    // Truncate very long text to avoid excessive API costs
    const trimmedText = text.trim().slice(0, 5000);

    console.log(`[TTS] Generating speech (${trimmedText.length} chars, model=${ELEVENLABS_MODEL}, lang=${ELEVENLABS_LANGUAGE})`);

    const elevenLabsRes = await fetch(
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
          model_id: ELEVENLABS_MODEL,
          language_code: ELEVENLABS_LANGUAGE,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.80,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!elevenLabsRes.ok) {
      const errText = await elevenLabsRes.text().catch(() => "");
      console.error("[TTS] ElevenLabs error:", elevenLabsRes.status, errText);

      // If v3 fails, try fallback to multilingual_v2
      if (elevenLabsRes.status === 400 || elevenLabsRes.status === 422) {
        console.warn("[TTS] Retrying with eleven_multilingual_v2 fallback...");
        const fallbackRes = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              Accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: stripAudioTags(trimmedText),
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
              },
            }),
          }
        );
        if (fallbackRes.ok) {
          console.log("[TTS] Fallback to multilingual_v2 succeeded");
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Cache-Control", "no-cache");
          const buffer = Buffer.from(await fallbackRes.arrayBuffer());
          return res.send(buffer);
        }
      }

      return res.status(elevenLabsRes.status).json({
        error: "tts_failed",
        message: `ElevenLabs returned ${elevenLabsRes.status}`,
      });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-cache");

    // Stream the audio response to the client
    const reader = elevenLabsRes.body as any;
    if (reader && typeof reader.pipe === "function") {
      reader.pipe(res);
    } else if (reader && typeof reader.getReader === "function") {
      // Web ReadableStream (Node 18+ fetch)
      const webReader = reader.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await webReader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      pump().catch((err) => {
        console.error("[TTS] Stream error:", err);
        if (!res.headersSent) res.status(500).json({ error: "stream_failed" });
        else res.end();
      });
    } else {
      // Fallback: read as buffer
      const buffer = Buffer.from(await elevenLabsRes.arrayBuffer());
      res.send(buffer);
    }
  } catch (err: any) {
    console.error("[TTS] Error:", err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "internal" });
    }
  }
});

/**
 * GET /tts/status
 * Returns whether TTS is configured and available.
 */
r.get("/status", ensureAuth as any, (_req: Request, res: Response) => {
  res.json({
    available: Boolean(ELEVENLABS_API_KEY && ELEVENLABS_VOICE_ID),
    voiceId: ELEVENLABS_VOICE_ID ? "configured" : "missing",
    model: ELEVENLABS_MODEL,
  });
});

export default r;
