import { Router } from "express";
import StudentSnapshot from "../../models/StudentSnapshot";

const r = Router();

r.get("/:userId/snapshot", async (req, res) => {
  try {
    const { userId } = req.params as any;
    const snap = await StudentSnapshot.findOne({ user: userId });
    if (!snap) return res.status(404).json({ error: "No snapshot" });
    res.json({ ok: true, snapshot: snap });
  } catch (e) {
    return res.status(500).json({ error: "Snapshot fetch failed" });
  }
});

export default r;


