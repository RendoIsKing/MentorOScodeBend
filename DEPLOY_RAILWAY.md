# Deploying Backend to Railway

This service is Node/Express + TypeScript. It builds to `dist/` and binds to `process.env.PORT` (defaults to 3006 locally). No `.env` files are read in production.

## Environment variables (names only)
- PORT (Railway sets automatically)
- DB_URL
- SESSION_SECRET
- JWT_SECRET (or APP_SECRET)
- CORS_ALLOW_ORIGINS (comma-separated, e.g. `http://localhost:3002,https://your-frontend.vercel.app`)
- STRIPE_SECRET_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_CURRENCY (e.g. `usd`)
- SENTRY_DSN (optional)
- DEV_LOGIN_ENABLED (`false` in prod)

## Build & start
- Build: `npm run build`
- Start: `npm start` → `node dist/index.js`

Railway autodetects Node (Nixpacks). A Dockerfile also exists and is compatible (no `.env` copied).

## CORS & cookies
- CORS reads allowed origins from `CORS_ALLOW_ORIGINS` (comma-separated). Credentials enabled.
- In production the app sets `trust proxy = 1` and cookies use `{ httpOnly: true, sameSite: 'lax', secure: NODE_ENV==='production' }`.

## Healthcheck
- HTTP: `GET /healthz` → `{ ok: true }` (200)

## Stripe webhooks
- Endpoint: `POST /api/v1/handlePaymentStripe`
- In dev: `stripe listen --forward-to http://localhost:3006/api/v1/handlePaymentStripe`

## Graceful shutdown
- Handles SIGINT/SIGTERM and closes DB connections.

## Smoke (local prod)
- `npm ci && npm run build && NODE_ENV=production PORT=3006 node dist/index.js`
- `curl -i http://localhost:3006/healthz` → 200
