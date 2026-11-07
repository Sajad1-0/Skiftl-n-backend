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

## Setup

```bash
pnpm install
cp .env.example .env
# Edit .env — especially DATABASE_URL and JWT_SECRET
```

### Environment

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | API port (default `3001`) |
| `DATABASE_URL` | Postgres connection string |
| `JWT_SECRET` | Long random secret (≥ 32 chars) |
| `JWT_EXPIRES_IN_SECONDS` | Token TTL (default 7 days) |
| `FRONTEND_URL` | CORS / Stripe redirect base (`http://localhost:3000`) |
| `STRIPE_SECRET_KEY` | Stripe secret (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (`whsec_…`) |
| `STRIPE_PRICE_ID` | Premium monthly Price ID (`price_…`) |
| `PREMIUM_BYPASS_EMAILS` | Optional comma-separated emails treated as Premium (dev only) |

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
