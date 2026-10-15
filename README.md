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
