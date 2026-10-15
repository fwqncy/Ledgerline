import { createModuleTRPC, type BaseContext } from '@ledgerline/core/server';
import { createFrontPageService } from './service';

export const createFrontPageContext = (base: BaseContext) => ({
  ...base,
  frontPage: createFrontPageService(base),
});

export type FrontPageContext = ReturnType<typeof createFrontPageContext>;

export const { router, protectedProcedure } = createModuleTRPC<FrontPageContext>();
