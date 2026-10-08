import { createModuleTRPC, type BaseContext } from '@ledgerline/core/server';
import { createRiskService } from './service';

export const createRiskContext = (base: BaseContext) => ({
  ...base,
  risk: createRiskService(base),
});

export type RiskContext = ReturnType<typeof createRiskContext>;

export const { router, protectedProcedure } = createModuleTRPC<RiskContext>();
