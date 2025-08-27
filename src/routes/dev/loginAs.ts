import { Router } from "express";
import { User } from "../../app/Models/User";

const r = Router();

r.post("/dev/login-as", async (req: any, res) => {
  try {
    if (process.env.NODE_ENV === "production") return res.status(404).end();
    const { email } = req.body as { email: string };
    if (!email) return res.status(400).json({ error: "email required" });
    const user = await (User as any).findOne({ email });
    if (!user) return res.status(404).json({ error: "user not found" });
    req.session = req.session || {};
    req.session.user = { id: user._id.toString() };
    return res.json({ ok: true, userId: user._id.toString() });
  } catch (e) {
    return res.status(500).json({ error: "login failed" });
  }
});

export default r;


