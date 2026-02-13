if (process.env.NODE_ENV !== 'production') {
  try {
    // Load local env only in non-production; prod platforms inject env vars
    require('dotenv').config();
  } catch {}
}

import { Server } from "./server";
import { supabaseAdmin } from "./lib/supabase";

(async () => {
  try {
    // Verify Supabase connection
    const { error } = await supabaseAdmin.from('users').select('id').limit(1);
    if (error) {
      console.error('[BOOT] Supabase connection test failed:', error.message);
      // Non-fatal: the table might not exist yet if migrations haven't run
    } else {
      console.log('[BOOT] Supabase connection verified');
    }
  } catch (err) {
    console.error('[BOOT] Supabase connection error:', err);
  }

  // ── Startup migration: ensure Coach.Majen has isMentor=true ──
  try {
    const mentorUserNames = ["Coach.Majen", "coach-majen"];
    for (const uname of mentorUserNames) {
      const { data: existing } = await supabaseAdmin
        .from("users")
        .select("id, user_name, is_mentor")
        .ilike("user_name", uname)
        .limit(1)
        .maybeSingle();

      if (existing) {
        console.log(`[MIGRATION] Found user "${existing.user_name}" (${existing.id}), is_mentor=${existing.is_mentor}`);
        if (!existing.is_mentor) {
          await supabaseAdmin
            .from("users")
            .update({ is_mentor: true })
            .eq("id", existing.id);
          console.log(`[MIGRATION] ✅ Set is_mentor=true for "${existing.user_name}"`);
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
    try { process.exit(0); } catch {}
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
})();
