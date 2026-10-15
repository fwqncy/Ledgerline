// modules/ledger/router.ts
import { z } from 'zod';
import { DESKS } from './desks';
import { protectedProcedure, router } from './trpc';

const Filters = z.object({
  q: z.string().trim().max(80).optional(),
  desk: z.enum(DESKS).optional(),
});

export const ledgerRouter = router({
  events: protectedProcedure
    .input(Filters.extend({ cursor: z.number().int().min(0).nullish(), limit: z.number().int().min(1).max(100).default(40) }))
    .query(({ ctx, input }) => ctx.ledger.events(input)),

  exportCsv: protectedProcedure.input(Filters).query(({ ctx, input }) => ctx.ledger.exportCsv(input)),

  accounts: protectedProcedure.query(({ ctx }) => ctx.ledger.accounts()),
});

export type LedgerRouter = typeof ledgerRouter;
