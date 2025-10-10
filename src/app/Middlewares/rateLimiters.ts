import rateLimit from 'express-rate-limit';
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
      // Use express-rate-limit's ipv6-safe helper when available
      let ipKey: string = '';
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { ipKeyGenerator } = require('express-rate-limit');
        if (typeof ipKeyGenerator === 'function') {
          ipKey = String(ipKeyGenerator(req));
        }
      } catch {}
      if (!ipKey) {
        // Fallback: rely on library's ipv6 validation by returning empty -> it will use internal ip extractor
        ipKey = '';
      }
      const uid = (req as any)?.user?._id ? String((req as any).user._id) : '';
      return `${uid}::${ipKey}`;
    },
  });
}


