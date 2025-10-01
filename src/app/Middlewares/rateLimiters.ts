import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

export function perUserIpLimiter(options?: { windowMs?: number; max?: number; standardHeaders?: boolean; legacyHeaders?: boolean; }): any {
  const windowMs = options?.windowMs ?? 60_000;
  const max = options?.max ?? 60;
  return rateLimit({
    windowMs,
    max,
    standardHeaders: options?.standardHeaders ?? true,
    legacyHeaders: options?.legacyHeaders ?? false,
    keyGenerator: (req: Request) => {
      const uid = (req as any)?.user?._id ? String((req as any).user._id) : '';
      const ipKey = ipKeyGenerator(req);
      return `${uid}::${ipKey}`;
    },
  });
}


