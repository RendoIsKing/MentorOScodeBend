import * as Sentry from '@sentry/node';
export function initSentry(app: import('express').Express) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1, environment: process.env.NODE_ENV });
  app.use(Sentry.Handlers.requestHandler() as any);
  app.use(Sentry.Handlers.tracingHandler() as any);
  app.use(Sentry.Handlers.errorHandler() as any);
}


