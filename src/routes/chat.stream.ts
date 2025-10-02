import { Router } from 'express';
import { sseHub } from '../lib/sseHub';
import { Auth as ensureAuth } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';

const r = Router();

r.get('/events/stream', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_SSE_PER_MIN || 30) }), (req: any, res) => {
  const me = String(req?.user?._id || '');
  if (!me) return res.status(401).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // @ts-ignore
  res.flushHeaders?.();

  const send = (event: string, data: any) => {
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  const unsub = sseHub.subscribe(me, (evt) => send(evt.type, evt.payload));
  send('chat:hello', { me, t: Date.now() });
  const hb = setInterval(() => send('chat:hb', { t: Date.now() }), 15000);

  req.on('close', () => { clearInterval(hb); unsub(); try { res.end(); } catch {} });
});

export default r;


