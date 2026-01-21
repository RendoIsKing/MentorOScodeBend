import { Router } from 'express';
import { Auth, validateZod } from '../app/Middlewares';
import { z } from 'zod';
import { acceptTos } from '../app/Controllers/Legal/acceptTos';

const r = Router();

// Dev mailer abstraction
async function sendMail(to: string, subject: string, text: string) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[MAIL] to=${to} subject=${subject} text=${text}`);
    return true;
  }
  // TODO: integrate Postmark/Mailgun
  return true;
}

r.post('/account/request-deletion', Auth as any, validateZod({ body: z.object({}).strict() }), async (req: any, res) => {
  try {
    const me = req.user;
    await sendMail(process.env.SUPPORT_EMAIL || 'support@example.com', 'Account Deletion Request', `User ${me?.email || me?._id} requested deletion.`);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: { message: 'request failed' } });
  }
});

r.post('/account/request-export', Auth as any, validateZod({ body: z.object({}).strict() }), async (req: any, res) => {
  try {
    const me = req.user;
    await sendMail(process.env.SUPPORT_EMAIL || 'support@example.com', 'Data Export Request', `User ${me?.email || me?._id} requested export.`);
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: { message: 'request failed' } });
  }
});

export default r;

// Legal acceptance
r.post('/legal/accept', Auth as any, validateZod({ body: z.object({}).strict() }), acceptTos as any);


