import { createModuleTRPC, type BaseContext } from '@ledgerline/core/server';
import { createSupportService } from './service';

export const createSupportContext = (base: BaseContext) => ({
  ...base,
  support: createSupportService(base),
});

export type SupportContext = ReturnType<typeof createSupportContext>;

export const { router, protectedProcedure } = createModuleTRPC<SupportContext>();
