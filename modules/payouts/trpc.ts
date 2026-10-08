import { createModuleTRPC, type BaseContext } from '@ledgerline/core/server';
import { createPayoutService } from './service';

export const createPayoutsContext = (base: BaseContext) => ({
  ...base,
  payouts: createPayoutService(base),
});

export type PayoutsContext = ReturnType<typeof createPayoutsContext>;

export const { router, protectedProcedure, withRiskCheck } = createModuleTRPC<PayoutsContext>();
