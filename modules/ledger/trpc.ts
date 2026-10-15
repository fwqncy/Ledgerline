import { createModuleTRPC, type BaseContext } from '@ledgerline/core/server';
import { createLedgerService } from './service';

export const createLedgerContext = (base: BaseContext) => ({
  ...base,
  ledger: createLedgerService(base),
});

export type LedgerContext = ReturnType<typeof createLedgerContext>;

export const { router, protectedProcedure } = createModuleTRPC<LedgerContext>();
