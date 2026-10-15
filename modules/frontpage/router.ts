// modules/frontpage/router.ts
import { z } from 'zod';
import { RANGES } from './service';
import { protectedProcedure, router } from './trpc';

const Range = z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]);

export const frontPageRouter = router({
  edition: protectedProcedure.query(({ ctx }) => ctx.frontPage.edition()),

  candles: protectedProcedure
    .input(z.object({ range: Range }))
    .query(({ ctx, input }) => ctx.frontPage.candles(input.range)),

  routes: protectedProcedure.query(({ ctx }) => ctx.frontPage.routes()),
});

export type FrontPageRouter = typeof frontPageRouter;
