import { Router } from 'express';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import pkg from '../../package.json' assert { type: 'json' };
const r = Router();
r.get('/health', (_req, res) => res.json({ ok: true, version: (pkg as any).version, uptimeSeconds: Math.floor(process.uptime()) }));
export default r;


