import * as Sentry from '@sentry/node';
import * as SentryExpress from '@sentry/express';

export function initSentry(app: import('express').Application) {
  try {
    if (!process.env.SENTRY_DSN) return;
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
    // request/tracing handlers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).use(SentryExpress.requestHandler());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (app as any).use((SentryExpress as any).tracingHandler?.());
    // error handler at the end of middleware chain will be added in server.ts or here if needed
  } catch {}
}

export function sentryErrorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (SentryExpress as any).errorHandler?.();
}


