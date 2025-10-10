import * as Sentry from '@sentry/node';
// Optional import; type-only usage guarded at runtime to avoid hard dep failures
let SentryExpress: any;
try { SentryExpress = require('@sentry/express'); } catch { SentryExpress = null; }

export function initSentry(app: import('express').Application) {
  try {
    if (!process.env.SENTRY_DSN) return;
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
    // request/tracing handlers
    if (SentryExpress) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).use(SentryExpress.requestHandler());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).use((SentryExpress as any).tracingHandler?.());
    } else {
      // Fallback minimal breadcrumb for visibility without @sentry/express
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (app as any).use((req: any, _res: any, next: any) => { try { Sentry.addBreadcrumb({ category: 'http', message: `${req.method} ${req.url}` }); } catch {}; next(); });
    }
    // error handler at the end of middleware chain will be added in server.ts or here if needed
  } catch {}
}

export function sentryErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (SentryExpress as any)?.errorHandler?.();
}


