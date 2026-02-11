if (process.env.NODE_ENV !== 'production') {
  try {
    // Load local env only in non-production; prod platforms inject env vars
    require('dotenv').config();
  } catch {}
}
try { console.log('[BOOT:index] DEV_LOGIN_ENABLED =', process.env.DEV_LOGIN_ENABLED); } catch {}
import { Server } from "./server";
import { connectDatabase } from "./utils/dbConnection";

(async () => {
  try {
    await connectDatabase();
  } catch (err) {
    console.error('Database connection error: ', err);
    process.exit(1);
  }
  // ── Startup migration: ensure Coach.Majen has isMentor=true ──
  try {
    const { User: MigUser } = await import("./app/Models/User");
    // Match both "Coach.Majen" and "coach-majen" variants (case-insensitive)
    const mentorUserNames = ["Coach.Majen", "coach-majen"];
    for (const uname of mentorUserNames) {
      // First, check if the user exists at all
      const existing = await MigUser.findOne(
        { userName: { $regex: `^${uname.replace(/\./g, "\\.")}$`, $options: "i" } }
      ).select("_id userName isMentor").lean();
      if (existing) {
        console.log(`[MIGRATION] Found user "${(existing as any).userName}" (${String(existing._id)}), isMentor=${(existing as any).isMentor}`);
        if (!(existing as any).isMentor) {
          await MigUser.updateOne({ _id: existing._id }, { $set: { isMentor: true } });
          console.log(`[MIGRATION] ✅ Set isMentor=true for "${(existing as any).userName}"`);
        }
      } else {
        console.log(`[MIGRATION] No user found matching "${uname}"`);
      }
    }
  } catch (e) {
    console.error("[MIGRATION] Failed to ensure mentor flags:", e);
  }

  const server = new Server((process.env.PORT || '3006') as String);
  server.start();

  const shutdown = async (signal: string) => {
    try { console.log(`[SHUTDOWN] Received ${signal}`); } catch {}
    try { await import('mongoose').then(m=>m.connection.close()); } catch {}
    try { process.exit(0); } catch {}
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
console.log("Force redeploy: AI auto-reply diagnostic logging v2");