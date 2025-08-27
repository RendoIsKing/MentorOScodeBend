import cron from "node-cron";
import StudentState from "../models/StudentState";
import { rebuildSnapshot } from "../services/snapshot/rebuildSnapshot";

export function startSnapshotReconciler() {
  // 02:30 every night
  cron.schedule("30 2 * * *", async () => {
    const since = new Date(Date.now() - 24*3600*1000);
    const dirty = await StudentState.find({ lastEventAt: { $gte: since } }, { user: 1 });
    for (const s of dirty) {
      try { await rebuildSnapshot((s as any).user); } catch (e) { console.error("Reconcile failed", (s as any).user, e); }
    }
  });
}


