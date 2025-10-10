import { Router } from 'express';
import * as Sentry from '@sentry/node';
import { sseHub } from '../lib/sseHub';
import { Auth as ensureAuth } from '../app/Middlewares';
import { perUserIpLimiter } from '../app/Middlewares/rateLimiters';

const r = Router();

r.get('/events/stream', ensureAuth as any, perUserIpLimiter({ windowMs: 60_000, max: Number(process.env.RATE_LIMIT_SSE_PER_MIN || 30) }), (req: any, res) => {
  const me = String(req?.user?._id || '');
  if (!me) return res.status(401).end();
  try { Sentry.addBreadcrumb({ category: 'sse', message: 'connect', level: 'info' }); } catch {}

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
  const hb = setInterval(() => { try { Sentry.addBreadcrumb({ category: 'sse', message: 'heartbeat', level: 'debug' }); } catch {}; send('chat:hb', { t: Date.now() }); }, 15000);

  req.on('close', () => { try { Sentry.addBreadcrumb({ category: 'sse', message: 'close', level: 'info' }); } catch {}; clearInterval(hb); unsub(); try { res.end(); } catch {} });
  return; // ensure TS sees a return path
});

export default r;


