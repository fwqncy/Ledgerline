# The Ledgerline

A modular payments console, set like a newspaper. The console is split into modules that can each be deployed on its own, so the risk, payouts and support teams ship on their own schedule without redeploying the whole console.

Built with **Next.js**, **TypeScript** and **tRPC**, with **GSAP** for motion and **three.js** for the globe.

## Run it

You need **Node.js 20.9 or newer** (there's an `.nvmrc`, so `nvm use` works).

```bash
npm install
npm run dev        # http://localhost:3000
```

For a production build, run `npm run build && npm start`. To typecheck, run `npm run typecheck`.

Data lives in an in-memory store, seeded on start with a year of trading history, so every restart begins from the same state.

## Sections

| Section | What it's for |
| --- | --- |
| **Front Page** | The day's edition. The lead headline is written from live numbers. It also has **The Ticker** (a candlestick chart of the treasury float over a year), **The Wire** (live activity), a three.js halftone globe of where money went, and a print edition. |
| **Payouts** | Search, sort, filter & page through the payout book; approve one or many (with a 5-second undo); create payouts; export CSV. Rubber stamps land when a status changes. |
| **Risk** | The review queue. Clear releases a payout to Payouts; reject needs a second click to confirm. |
| **Support** | Merchant tickets with SLA timers, Assign to Me, canned replies (macros) & optimistic replies, each pinned next to the payout it's about. |
| **Ledger** | The audit log (searchable, exportable) & lifetime accounts per beneficiary. |
| **Settings** | Colour schemes: **Broadsheet** (cream & black, default), **Burgundy & Navy**, or **your own** from a colour wheel. Motion, density & the wire ticker. |

## Things to try

- Press **⌘K** (Ctrl K) and type `orchard`, `po_8f21` or `theme`.
- Press **?** for every shortcut. **G** then **P** jumps to Payouts.
- On the Front Page, press **▶ Replay** on The Ticker, or focus the chart and use **← →** to read each day.
- **Approve** *Northwind Ltd*, then watch the PAID stamp land. Approve *Orchard Labs* (£24,600) and Risk holds it; clear it in Risk and approve again.
- Settings → **Your Own Colours** → drag around the wheel. The paper, ink & banners follow your colour, and the contrast readout tells you whether it's readable.

## Layout

```
apps/console/           Next.js shell: masthead, sections, palette, shortcuts, settings, API routes
  modules.ts            export const modules = [risk, payouts, support]
packages/core/          Shared: tRPC factory, protectedProcedure, withRiskCheck, audit,
                        Prisma-style store, themes, toasts & the design system
modules/frontpage/      The Ticker chart, the globe & the lead story
modules/payouts/        router.ts · service.ts · trpc.ts · client.ts · ui/
modules/risk/           same shape
modules/support/        same shape
modules/ledger/         same shape
```

Each module owns its:

- **router and context.** `createModuleTRPC<Ctx>()` gives each module its own tRPC instance.
- **API endpoint** at `/api/m/<module>`.
- **client and query cache**, from `createModuleClient`. Modules tell each other about changes with a browser event, never by importing each other.
- **search results & palette commands**, contributed through the module contract.
- **version and error boundary.** A module that throws shows an error screen and the others keep working.

## Deploying modules separately

| Variable | Purpose |
| --- | --- |
| `LEDGERLINE_MODULES=payouts` | Mount only these modules (comma-separated). |
| `NEXT_PUBLIC_PAYOUTS_API_URL` (likewise `RISK`, `SUPPORT`, `FRONTPAGE`, `LEDGER`) | Point a module's UI at another deployment's endpoint. |
| `LEDGERLINE_CORS_ORIGIN` | Set on a module deployment so a console on another origin can call it. |
| `LEDGERLINE_DEPLOYED_AT` | ISO timestamp shown as "deployed … ago" (defaults to server start). |

## Notes

- `packages/core/src/db.ts` exposes the Prisma client subset the modules use (`findMany` with `where`/`OR`/`contains`/`gte`, `orderBy`, `skip`, `take`; `findUnique`, `findFirst`, `count`, `create`, `update`). Swap in a real `PrismaClient` with the same model names and the module code stays as it is.
- The demo signs every request in as one operator. `createBaseContext` in `packages/core/src/server.ts` is where a real session would be resolved.
- The theme is stored in a cookie, so the first paint is already in the reader's colours.

## Partner API

A separate service that lets external partners, such as a marketplace paying its sellers, read their ledger and create payouts. It lives in `partner-api/`: **Express**, **Apollo Server** at `/graphql`, **Prisma** over **Postgres**. It sits beside the console and changes nothing in it.

### Two APIs, two jobs

| | tRPC (`/api/m/<module>`) | Partner API (`/graphql`) |
| --- | --- | --- |
| Who calls it | The console's own UI | External partners' servers |
| Contract | TypeScript types shared with the UI; changes ship with the module | A published GraphQL schema (`/schema.graphql`) that only changes additively |
| Auth | The console's operator session | API key → 15-minute JWT with scopes (`ledger:read`, `payouts:write`) |
| Writes | Optimistic UI, undo | `Idempotency-Key` on every mutation, so a retry never pays twice |
| Status updates | Browser events between modules | Signed webhooks, plus a queryable delivery log |
| Data | The in-memory store | Its own Postgres tables, through Prisma |

tRPC stays the internal API: it is fastest to change because the UI and the server ship together. The Partner API is the external contract, so it is versioned by schema, rate-limited and idempotent. Prisma is used only inside `partner-api/`; the console keeps its in-memory store.

**Data.** The Partner API keeps its own copy of the ledger, seeded from the same deterministic `seed()` in `@ledgerline/core`, so the numbers match on day one. The two then drift: payouts created through the Partner API don't appear in the console, and the reverse is also true. Making `packages/core/src/db.ts` a real `PrismaClient` (see Notes) would let both read one database.

### Run it

With Docker (Postgres and the API on http://localhost:4000; migrations and seed run on start):

```bash
docker compose up -d --build postgres partner-api
npm run dev                # the console, with the portal at http://localhost:3000/developers
```

Or run the API on your machine against the compose Postgres:

```bash
docker compose up -d postgres
cp partner-api/.env.example partner-api/.env
npm run partner:setup      # migrate & seed (prints the demo API key)
npm run partner:dev        # http://localhost:4000/graphql
```

The seed creates partner `prt_demo` (*Demo Marketplace*) with a treasury account, 25 beneficiary accounts, a year of ledger entries, and a local-only demo key, `llk_test_demo0001_LocalDevOnlyDoNotUseInProd000000`. The demo key is never seeded when `NODE_ENV=production`.

### Try it with curl

The examples use [`jq`](https://jqlang.org) to pull fields out of responses.

```bash
API=http://localhost:4000
KEY=llk_test_demo0001_LocalDevOnlyDoNotUseInProd000000

# 1. Swap the API key for a short-lived access token.
TOKEN=$(curl -s -X POST $API/auth/token -H "Authorization: Bearer $KEY" | jq -r .access_token)

# Ask for fewer scopes than the key has (e.g. a read-only token for reporting):
curl -s -X POST $API/auth/token -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"scope":"ledger:read"}' | jq '{scope, expires_in}'

# 2. Balances: available = ledger − outstanding payouts.
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ balances { account { id name kind } ledger pending available } }"}' | jq '.data.balances[:3]'

# 3. Ledger entries for October, 5 per page; pass endCursor back as `after` for the next page.
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{
  "query": "query ($from: DateTime, $to: DateTime, $after: String) { ledgerEntries(from: $from, to: $to, first: 5, after: $after) { totalCount pageInfo { hasNextPage endCursor } edges { node { id direction amount description occurredAt account { name } } } } }",
  "variables": { "from": "2026-10-01T00:00:00Z", "to": "2026-11-01T00:00:00Z" }
}' | jq .data.ledgerEntries

# 4. Recent payouts, filtered by status.
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ payouts(status: PAID, first: 3) { totalCount edges { node { id amount reference paidAt account { name } } } } }"}' | jq .data.payouts

# 5. Pay a seller. Mutations need an Idempotency-Key; amounts are in pence.
IDEM=$(uuidgen)
PAY='{"query":"mutation ($input: CreatePayoutInput!) { createPayout(input: $input) { id status amount method } }","variables":{"input":{"accountId":"acc_kite_co","amount":12500,"reference":"SELLER-PAYOUT-001"}}}'
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" -d "$PAY" | jq .data.createPayout

# Retry with the same key: the same payout comes back, with Idempotent-Replayed: true, and nothing is paid twice.
curl -si $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" -d "$PAY" | grep -iE "idempotent-replayed|createPayout"

# 6. Cancel it (only PENDING or REVIEW payouts can be cancelled).
PAYOUT_ID=$(curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEM" -d "$PAY" | jq -r .data.createPayout.id)
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -H "Idempotency-Key: $(uuidgen)" \
  -d "{\"query\":\"mutation { cancelPayout(id: \\\"$PAYOUT_ID\\\") { id status cancelledAt } }\"}" | jq .data.cancelPayout

# 7. The webhook delivery log: every payout status change and whether it reached you.
curl -s $API/graphql -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"{ webhookDeliveries(first: 5) { edges { node { event status attempts payout { id status } createdAt } } } }"}' | jq .data.webhookDeliveries

# The schema itself (public, for codegen):
curl -s $API/schema.graphql | head -20
```

Errors carry a stable `extensions.code`: `UNAUTHENTICATED`, `FORBIDDEN` (with `requiredScope`), `BAD_USER_INPUT`, `NOT_FOUND`, `INSUFFICIENT_FUNDS`, `PAYOUT_NOT_CANCELLABLE`, `IDEMPOTENCY_KEY_REUSED` (409) and `IDEMPOTENCY_IN_PROGRESS` (409). A missing or expired token gets HTTP 401, and going over the rate limit gets HTTP 429 with standard `RateLimit` headers.

### How it behaves

- **API keys** look like `llk_test_<8 chars>_<32 chars>`. Only the prefix and an HMAC-SHA256 of the whole key (peppered with `API_KEY_PEPPER`) are stored. A key is shown once, when it's created.
- **Tokens** are HS256 JWTs: 15 minutes by default, `sub` = partner, `jti` = key, `scope` = space-separated scopes. Revoking a key stops its tokens at once, because every request checks the key is still active.
- **Scopes** are checked at the top of every resolver: queries need `ledger:read`, mutations need `payouts:write`. Every query is also filtered by the caller's partner, so one partner can never see another's data.
- **Rate limits:** 120 requests a minute per partner on `/graphql`, and 10 a minute per IP on `/auth/token`. The store is in memory, which suits one instance; use a shared store (e.g. Redis) to run several.
- **Idempotency:** the key is recorded in the same transaction as the write.
  - A retry with the same key and the same request replays the original response.
  - Six identical requests sent at once create one payout.
  - The same key with a different request is a 409.
  - A failed request doesn't use up the key.
  - Keys are kept for 24 hours, separately for each partner.
- **Payouts** above £20,000 start in `REVIEW`, the same limit as the console's operator approval limit. A payout can't spend more than the treasury has available.
- **Settlement is simulated:** a worker marks `PENDING` payouts `PAID` after `SETTLE_AFTER_MS` and books the double entry (debit the treasury, credit the beneficiary). `REVIEW` payouts wait for `POST /admin/payouts/:id/review` with `{"decision":"approve"|"reject"}`.
- **Webhooks:**
  - Every status change (`payout.created`, `.paid`, `.cancelled`, `.rejected`) writes a row to `webhook_deliveries` in the same transaction.
  - A dispatcher POSTs each row to the partner's URL with `Ledgerline-Signature: t=<unix>,v1=<HMAC-SHA256 of "t.body">`, retries with exponential backoff, and marks it `FAILED` after 8 attempts.
  - Only the admin API can set the URL (`PATCH /admin/partners/:id`), and redirects aren't followed.

### Developer portal

`/developers` in the console (linked from the footer) lets an operator:

- create and revoke API keys;
- see the scopes;
- read schema docs built from the live `/schema.graphql`, plus how to verify webhooks;
- run queries in a playground.

The portal talks to the Partner API from the server, so the admin token never reaches the browser.

Tailwind applies only to the portal:

- The PostCSS config is in `app/(console)/developers/`. Turbopack falls back to it because the console has no root config, so the console's own CSS still goes through Next's default pipeline.
- Preflight is left out.
- Every utility is prefixed `tw:` (e.g. `tw:grid`), and only that folder is scanned.

The portal reuses the console's `ll-*` components and colour tokens, so it follows the reader's theme.

### Configuration

| Variable | Service | Default (development) | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | partner-api | (required) | Postgres connection string |
| `PORT` | partner-api | `4000` | |
| `JWT_SECRET` | partner-api | dev value | Signs access tokens (32+ characters) |
| `API_KEY_PEPPER` | partner-api | dev value | Peppers key hashes; changing it invalidates every key |
| `PARTNER_ADMIN_TOKEN` | both | `dev-admin-token` | Lets the console's server manage keys; no default in production |
| `TOKEN_TTL_SECONDS` | partner-api | `900` | Access token lifetime |
| `RATE_LIMIT_PER_MINUTE` / `TOKEN_RATE_LIMIT_PER_MINUTE` | partner-api | `120` / `10` | |
| `SETTLE_AFTER_MS` | partner-api | `15000` | Simulated settlement delay; `0` turns it off |
| `PARTNER_API_URL` | console | `http://localhost:4000` | Where the portal's server reaches the API |
| `PARTNER_API_PUBLIC_URL` | console | `PARTNER_API_URL` | The URL shown to partners in docs |

With `NODE_ENV=production`, the API refuses to start while any secret is still at its development default.

### Test it

```bash
npm run test:partner       # unit tests: resolvers, scopes, auth, tokens, keys, idempotency hashing, webhooks (no database)
npm run test:integration   # against real Postgres in Docker: migrations, seed, auth, GraphQL, idempotency replay, webhooks
```

The integration tests start a throwaway Postgres with [Testcontainers](https://testcontainers.com). Each run creates its own database, applies the real migrations with `prisma migrate deploy`, and drops the database afterwards. To use the compose test server instead of Testcontainers:

```bash
docker compose up -d postgres-test
TEST_DATABASE_URL=postgresql://ledgerline:ledgerline@localhost:5434/postgres npm run test:integration
```

On Colima, point Testcontainers at its socket:

```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

`npm run typecheck` and `npm run build` still check the console as before.

### Layout

```
partner-api/
  prisma/schema.prisma  Partners, API keys, scopes, accounts, ledger entries, payouts,
                        webhook deliveries, idempotency keys
  prisma/seed.ts        Seeds from @ledgerline/core's seed()
  src/app.ts            Express + Apollo at /graphql, /auth/token, /admin, /schema.graphql
  src/auth/             Key hashing, JWTs, requireScope()
  src/graphql/          Schema & resolvers, scalars, cursor pagination, DataLoaders
  src/services/         Payouts, balances, idempotency, webhooks
  src/workers.ts        Simulated settlement & webhook dispatch
  test/unit/            No database needed
  test/integration/     Real Postgres
apps/console/app/(console)/developers/
                        The developer portal (Tailwind, scoped to this folder)
```
