# Shiftkit API

Backend for **Shiftkit** — a Swedish shift-pay toolkit: log shifts, OB, tax estimates, monthly summaries, and Premium features (Stripe).

Companion frontend: [Skiftl-n-frontend](https://github.com/Sajad1-0/Skiftl-n-frontend).

## Stack

- Node.js + **Express 5** + **TypeScript**
- **PostgreSQL** + **Drizzle ORM**
- **JWT** auth (bcrypt passwords)
- **Zod** request validation
- **Stripe** subscriptions (Checkout + webhooks)
- **pdf-lib** for monthly PDF reports

## Requirements

- Node.js 22+
- pnpm 11+
- PostgreSQL database

## Setup (local)

```bash
pnpm install
cp .env.example .env
# Edit .env — especially DATABASE_URL and JWT_SECRET
```

### Environment

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default `3001`; Railway sets this) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Long random secret (≥ 32 chars) |
| `JWT_EXPIRES_IN_SECONDS` | Token TTL (default 7 days) |
| `FRONTEND_URL` | Stripe success/cancel/portal base URL |
| `STRIPE_SECRET_KEY` | Stripe secret (`sk_test_…` or `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook **signing** secret (`whsec_…` — not endpoint id `we_…`) |
| `STRIPE_PRICE_ID` | Premium monthly Price ID (`price_…`) |
| `PREMIUM_BYPASS_EMAILS` | Optional comma-separated emails treated as Premium (prefer empty in production) |
| `PREMIUM_BETA_ENDS_AT` | Optional ISO-8601 end of Premium beta (e.g. `2026-12-15T23:59:59+01:00`). Empty = off. While active, all users get Premium server-side. |

### Database

```bash
pnpm db:migrate          # apply Drizzle migrations
pnpm db:seed:agreements  # collective agreements + OB rules
pnpm db:seed:holidays    # Swedish holidays (OB)
pnpm db:seed:tax-tables  # Skatteverket monthly tax brackets
```

Useful:

```bash
pnpm db:generate   # new migration from schema
pnpm db:studio     # Drizzle Studio
pnpm db:push       # push schema (dev shortcut)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Watch mode (`tsx`) on `PORT` |
| `pnpm build` | Compile to `dist/` |
| `pnpm start` | Run compiled server |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Unit tests (`tsx --test`) |

## API overview

Base URL locally: `http://localhost:3001`

| Prefix | Purpose |
|--------|---------|
| `GET /health` | Health + DB check |
| `/auth` | Register, login, current user |
| `/job-profiles` | Job profiles (CRUD, archive) |
| `/shifts` | Shifts (CRUD, bulk) |
| `/summaries` | Monthly summary (+ PDF) |
| `/tax-settings` | Skatteverket table settings |
| `/sick-leave` | Sick leave periods (Premium) |
| `/salary-goal` | Monthly net goal (Premium) |
| `/billing` | Stripe Checkout / portal / webhook |
| `/collective-agreements` | Agreements + OB metadata |

Most routes require `Authorization: Bearer <token>`.

Stripe webhook: `POST /billing/webhook` (raw body — registered before JSON parser).

Local webhook forwarding:

```bash
stripe listen --forward-to localhost:3001/billing/webhook
```

## Deployment (Railway)

Production layout:

| Piece | Host |
|-------|------|
| API | **Railway** (this repo) |
| Postgres | **Railway** Postgres plugin |
| Frontend | **Vercel** ([Skiftl-n-frontend](https://github.com/Sajad1-0/Skiftl-n-frontend)) |

### Railway service variables

On the **API** service, set at least:

- `DATABASE_URL` → prefer a **Variable Reference** to Postgres: `${{Postgres.DATABASE_URL}}` (private `*.railway.internal` URL)
- `JWT_SECRET`
- `NODE_ENV=production`
- `FRONTEND_URL` → your Vercel URL (e.g. `https://your-app.vercel.app`), **not** `localhost`
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` (`whsec_…`)

Public domain: Railway → API service → Networking / Domains  
(e.g. `https://….up.railway.app`). Health check: `GET /health`.

### Migrations & seeds against Railway Postgres

`postgres.railway.internal` only resolves **inside** Railway. From your laptop:

```bash
# one-time CLI setup
curl -fsSL agents.railway.com | sh
source "$HOME/.railway/env"
railway login
railway link   # select project + this API (or Postgres) service
```

**Option A — SSH tunnel (recommended, no public DB):**

```bash
# terminal 1 — keep open
railway connect Postgres --tunnel-only

# terminal 2 — use the printed URL (127.0.0.1:port)
DATABASE_URL='postgresql://…@127.0.0.1:PORT/railway' pnpm db:migrate
DATABASE_URL='…' pnpm db:seed:agreements
DATABASE_URL='…' pnpm db:seed:holidays
DATABASE_URL='…' pnpm db:seed:tax-tables
```

**Option B — Public TCP proxy:** Postgres → Connect → Public Network → Add Public Access → use `DATABASE_PUBLIC_URL` as `DATABASE_URL` for the commands above. Remove public access when done if you prefer.

Do **not** paste production passwords into chat or commit them.

### Stripe in production

1. Webhook endpoint: `https://<api-domain>/billing/webhook`
2. Events: at least `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
3. Signing secret → `STRIPE_WEBHOOK_SECRET` (`whsec_…`)
4. Checkout disables Stripe **Managed Payments** in code (`managed_payments.enabled=false`) so product tax codes are not required for this SaaS subscription flow

### Password rotation

1. Tunnel in and `ALTER USER postgres WITH PASSWORD '…'`
2. Update Postgres `POSTGRES_PASSWORD` / `PGPASSWORD` / `DATABASE_URL`
3. Keep API `DATABASE_URL` as a reference to Postgres so it stays in sync
4. Redeploy the API and verify `/health` → `database: connected`

## Free vs Premium (enforced server-side)

| Feature | Free | Premium |
|---------|------|---------|
| History | Current calendar month | Last 6 months + compare |
| Job profiles | Max 1 | Soft cap 5 (+ archive on downgrade) |
| Bulk log | — | Max 10 rows / same profile |
| Breaks | Minutes only | Exact intervals inside shift |
| Tax | Manual % on profile | Skatteverket table + est. net |
| Sick leave | — | Karensdag + 80% pay |
| PDF / salary goal | — | Yes |
| OB rules | Included | Included |

## Project layout

```
src/
  modules/     # Feature routes, controllers, services, Zod schemas
  db/          # Drizzle schema, migrations helpers, seeds
  lib/         # Tax, OB, breaks, premium guards, PDF
  middleware/  # Auth, errors
  app.ts       # Express app
  index.ts     # Server entry
```

## License

Private / ISC (see `package.json`).
