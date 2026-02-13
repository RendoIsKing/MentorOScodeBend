import { db, Tables } from "../lib/db";

export function startSnapshotReconciler() {
  const cron = require("node-cron").default || require("node-cron");
  cron.schedule("30 2 * * *", async () => {
    const since = new Date(Date.now() - 24*3600*1000).toISOString();
    const { data: dirty } = await db
      .from(Tables.STUDENT_STATES)
      .select("user_id")
      .gte("last_event_at", since);
    for (const s of (dirty || [])) {
      try {
        const { rebuildSnapshot } = await import("../services/snapshot/rebuildSnapshot");
        await rebuildSnapshot(s.user_id);
      } catch (e) {
        console.error("Reconcile failed", s.user_id, e);
      }
    }
  });
}
