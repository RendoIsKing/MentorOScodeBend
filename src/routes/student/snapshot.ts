import { Router } from "express";
import { findOne, Tables } from "../../lib/db";

const r = Router();

r.get("/:userId/snapshot", async (req, res) => {
  try {
    const { userId } = req.params as any;
    const snap = await findOne(Tables.STUDENT_SNAPSHOTS, { user_id: userId });
    if (!snap) return res.status(404).json({ error: "No snapshot" });
    return res.json({ ok: true, snapshot: snap });
  } catch (e) {
    return res.status(500).json({ error: "Snapshot fetch failed" });
  }
});

export default r;
