# Ledgerline

A modular payments console. The console is split into modules that can each be deployed on its own, so the risk, payouts and support teams ship on their own schedule without redeploying the whole console.

Built with **Next.js**, **TypeScript** and **tRPC**.

## Run it

You need **Node.js 20.9 or newer** (there's an `.nvmrc`, so `nvm use` works).

```bash
npm install
npm run dev        # http://localhost:3000
```

For a production build, run `npm run build && npm start`. To typecheck, run `npm run typecheck`.

Data lives in an in-memory store, seeded on start, so every restart begins from the same state.

## Things to try

- **Payouts → Approve** on *Northwind Ltd*. It passes the risk check and is paid.
- **Approve** *Orchard Labs* (£24,600). It is over the £20,000 operator limit, so `withRiskCheck` stops the approval and sends the payout to Risk.
- **Risk → Clear** that flag. The payout goes back to *pending* in Payouts, and approving it now succeeds.
- **Support → T-1042** shows the linked payout and why Risk is holding it. Reply or resolve from there.

Every action is written to the audit log and shown under *Activity* on the payout.

## Layout

```
apps/console/           Next.js shell: nav, module frame, API route
  modules.ts            export const modules = [risk, payouts, support]
packages/core/          Shared: tRPC factory, protectedProcedure, withRiskCheck,
                        audit, Prisma-style data store, design system
modules/payouts/        router.ts · service.ts · trpc.ts · client.ts · ui/
modules/risk/           same shape
modules/support/        same shape
```

Each module owns its:

- **router and context.** `createModuleTRPC<Ctx>()` gives each module its own tRPC instance, so `ctx.payouts` exists only inside Payouts.
- **API endpoint** at `/api/m/<module>`. Every endpoint is a separate tRPC server; the console's route just dispatches to it.
- **client and query cache**, created by `createModuleClient`. A module's UI never shares state with another module.
- **version and error boundary.** The footer shows `payouts@v3.12 · deployed 14 min ago`. A module that throws shows an error screen and the others keep working.

## Deploying modules separately

The same app can be deployed several times with a different set of modules mounted:

| Variable | Purpose |
| --- | --- |
| `LEDGERLINE_MODULES=payouts` | Mount only these modules (comma-separated). Unmounted modules leave the nav and their API returns 404. |
| `NEXT_PUBLIC_PAYOUTS_API_URL` (likewise `RISK`, `SUPPORT`) | Point a module's UI at another deployment's endpoint, e.g. `https://payouts.example.com/api/m/payouts`. |
| `LEDGERLINE_CORS_ORIGIN` | Set on a module deployment so a console on another origin can call it. |
| `LEDGERLINE_DEPLOYED_AT` | ISO timestamp shown as "deployed … ago" (defaults to server start). |

For example, the payouts team ships `payouts@v3.13` by deploying with `LEDGERLINE_MODULES=payouts`. The console keeps calling that endpoint, and nothing else is rebuilt.

## Swapping in a real database

`packages/core/src/db.ts` exposes the Prisma client subset the modules use (`findMany`, `findUnique`, `findFirst`, `count`, `create`, `update`). To use a real database, replace `db` with a `PrismaClient` and keep the same model names (`payout`, `riskFlag`, `ticket`, `auditEvent`); the module code stays as it is.

The demo signs every request in as one operator. `createBaseContext` in `packages/core/src/server.ts` is where a real session would be resolved.
