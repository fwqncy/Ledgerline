// modules/payouts/router.ts
import { z } from "zod";
import { PayoutStatus } from "./schema";
import { protectedProcedure, router, withRiskCheck } from "./trpc";

export const payoutsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: PayoutStatus }))
    .query(({ ctx, input }) =>
      ctx.db.payout.findMany({
        where: { status: input.status },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ),

  approve: withRiskCheck(protectedProcedure)
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.audit("payout.approve", input.id);
      return ctx.payouts.approve(input.id);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.payouts.get(input.id)),

  summary: protectedProcedure.query(({ ctx }) => ctx.payouts.summary()),
});

export type PayoutsRouter = typeof payoutsRouter;
