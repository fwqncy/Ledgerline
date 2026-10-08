// modules/risk/router.ts
import { z } from 'zod';
import { protectedProcedure, router } from './trpc';

export const riskRouter = router({
  queue: protectedProcedure
    .input(z.object({ status: z.enum(['open', 'cleared', 'rejected']) }))
    .query(({ ctx, input }) => ctx.risk.queue(input.status)),

  rules: protectedProcedure.query(({ ctx }) => ctx.risk.rules()),

  clear: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.risk.resolve(input.id, 'cleared')),

  reject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ ctx, input }) => ctx.risk.resolve(input.id, 'rejected')),
});

export type RiskRouter = typeof riskRouter;
