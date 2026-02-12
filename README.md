# MentorOS — Backend

Express.js + TypeScript backend for the MentorOS coaching platform. Provides REST APIs for chat, AI mentoring, payments, feed, and user management.

## Prerequisites

- **Node.js** 20+
- **npm** 9+
- **MongoDB** 6+ (local or Atlas)
- **Stripe CLI** (optional, for webhook testing)

## Quick Start

```bash
# 1. Install dependencies
npm ci

# 2. Copy env and fill in values
cp .env.example .env

# 3. Start dev server (port 3006)
npm run dev
```

The server will be available at [http://localhost:3006](http://localhost:3006).
Health check: `GET /api/backend/health`

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (ts-node-dev) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Start production server from `dist/` |
| `npm test` | Run Jest unit tests |
| `npm run smoke` | Run smoke tests (requires running server) |
| `npm run burst` | Run rate-limit burst tests |
| `npm run webhook:simulate` | Run Stripe webhook simulator |
| `npm run dev:seed` | Seed demo data (Coach Majen) |

## Project Structure

```
src/
  app/
    Controllers/        # Route handlers (Payments, Posts, Interaction, etc.)
    Middlewares/         # Auth, rate limiting, validation, file upload
    Models/             # Mongoose models (User, Subscription, etc.)
    Validation/         # Zod schemas and request validators
  models/               # Mongoose models (chat, moderation, etc.)
  routes/               # Express route definitions
  services/             # Business logic (AI, RAG, events, plans, safety)
  observability/        # Sentry integration
  utils/                # Stripe helpers, webhooks, indexes
scripts/
  smoke.js              # Smoke tests
  burst.js              # Rate-limit burst tests
  seed.ts               # Database seeder
  stripe-webhook-sim.js # Stripe webhook simulator
```

## Environment Variables

See [`.env.example`](.env.example) for all available variables.

| Variable | Required | Description |
|---|---|---|
| `DB_URL` / `MONGO_URI` | Yes | MongoDB connection string |
| `PORT` | No | Server port (default 3006) |
| `SESSION_SECRET` | Yes | Express session secret |
| `JWT_SECRET` | Yes | JWT signing secret |
| `FRONTEND_ORIGIN` | Yes | Frontend URL for CORS |
| `SENTRY_DSN` | No | Sentry error tracking |
| `STRIPE_SECRET_KEY` | No | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `OPENAI_API_KEY` | No | OpenAI API key for AI features |

## Stripe Webhook Testing

To test Stripe webhooks locally:

```bash
# Option 1: Use Stripe CLI (recommended for real events)
stripe listen --forward-to http://localhost:3006/api/v1/handlePaymentStripe

# Option 2: Use the built-in simulator (signed test events)
STRIPE_WEBHOOK_SECRET=whsec_xxx npm run webhook:simulate
```

The webhook endpoint is `POST /api/v1/handlePaymentStripe` and handles:
- `customer.subscription.created/updated/paused/resumed`
- `payment_intent.created/succeeded/failed`
- `invoice.payment_failed`

## API Testing

Install the [REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) VS Code extension, then open `api.http` to test endpoints interactively.

## CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml`:
- **test** job — Install, build, run Jest with MongoDB service
- **smoke** job — Start server, run smoke + burst tests
