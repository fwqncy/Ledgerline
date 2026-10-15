// modules/payouts/router.ts
import { z } from "zod";
import { BrowseInput, CreatePayoutInput, PayoutStatus } from "./schema";
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

  browse: protectedProcedure.input(BrowseInput).query(({ ctx, input }) => ctx.payouts.browse(input)),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.payouts.get(input.id)),

  summary: protectedProcedure.query(({ ctx }) => ctx.payouts.summary()),

  bulkApprove: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(50) }))
    .mutation(({ ctx, input }) => ctx.payouts.bulkApprove(input.ids, ctx)),

  create: protectedProcedure.input(CreatePayoutInput).mutation(async ({ ctx, input }) => {
    const payout = await ctx.payouts.create(input);
    await ctx.audit("payout.create", payout.id, `${payout.beneficiary} · ${payout.reference}`);
    return payout;
  }),

  beneficiaries: protectedProcedure.query(({ ctx }) => ctx.payouts.beneficiaries()),

  exportCsv: protectedProcedure
    .input(z.object({ status: PayoutStatus, q: z.string().trim().max(80).optional() }))
    .query(({ ctx, input }) => ctx.payouts.exportCsv(input)),
});

export type PayoutsRouter = typeof payoutsRouter;
