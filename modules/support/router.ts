// modules/support/router.ts
import { z } from 'zod';
import { protectedProcedure, router } from './trpc';

const TicketStatus = z.enum(['open', 'waiting', 'resolved']).optional();

export const supportRouter = router({
  list: protectedProcedure
    .input(z.object({ status: TicketStatus }))
    .query(({ ctx, input }) =>
      ctx.db.ticket.findMany({
        where: { status: input.status },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => ctx.support.get(input.id)),

  reply: protectedProcedure
    .input(z.object({ id: z.string(), body: z.string().trim().min(1, 'Write a reply first').max(4000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.audit('ticket.reply', input.id);
      return ctx.support.reply(input.id, input.body);
    }),

  resolve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.audit('ticket.resolve', input.id);
      return ctx.support.setStatus(input.id, 'resolved');
    }),

  assign: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.audit('ticket.assign', input.id);
      return ctx.support.assignToMe(input.id);
    }),

  reopen: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.audit('ticket.reopen', input.id);
      return ctx.support.setStatus(input.id, 'open');
    }),
});

export type SupportRouter = typeof supportRouter;
