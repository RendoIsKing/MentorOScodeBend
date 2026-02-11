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
      const result = await MigUser.updateMany(
        { userName: { $regex: `^${uname.replace(/\./g, "\\.")}$`, $options: "i" }, isMentor: { $ne: true } },
        { $set: { isMentor: true } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[MIGRATION] Set isMentor=true for ${result.modifiedCount} user(s) matching "${uname}"`);
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
console.log("Force redeploy: Hybrid RAG fix active");