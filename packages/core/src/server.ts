import { initTRPC, TRPCError } from '@trpc/server';
import { db, newId, type Db } from './db';
import { APPROVAL_LIMIT, enforceRiskCheck } from './risk';

export { TRPCError } from '@trpc/server';
export { RISK_RULES, APPROVAL_LIMIT, enforceRiskCheck } from './risk';
export { OPERATORS_ON_DUTY } from './risk';

export interface Operator {
  id: string;
  name: string;
  email: string;
  /** Largest payout (in pence) this operator may approve without a Risk review. */
  approvalLimit: number;
}

export interface BaseContext {
  db: Db;
  /** The module serving the request; stamped on every audit event. */
  module: string;
  operator: Operator | null;
  audit: (action: string, targetId: string, detail?: string) => Promise<void>;
}

const DEMO_OPERATOR: Operator = {
  id: 'op_01',
  name: 'Alex Morgan',
  email: 'alex@ledgerline.dev',
  approvalLimit: APPROVAL_LIMIT,
};

export async function createBaseContext(module: string): Promise<BaseContext> {
  // A real deployment would resolve the session here; the demo signs every request in as one operator.
  const operator = DEMO_OPERATOR;
  return {
    db,
    module,
    operator,
    audit: async (action, targetId, detail) => {
      await db.auditEvent.create({
        data: {
          id: newId('au', 8),
          action,
          module,
          actor: operator.name,
          targetId,
          detail: detail ?? null,
          at: new Date().toISOString(),
        },
      });
    },
  };
}

/**
 * Each module gets its own tRPC instance, typed with its own context, so it can be
 * built, versioned and deployed without knowing about the other modules.
 */
export function createModuleTRPC<TContext extends BaseContext>() {
  const t = initTRPC.context<TContext>().create();

  const protectedProcedure = t.procedure.use(({ ctx, next }) => {
    if (!ctx.operator) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to use the console' });
    return next({ ctx: { operator: ctx.operator } });
  });

  /** Blocks a mutation on a payout until Risk has no objection to it. */
  const withRiskCheck = (procedure: typeof protectedProcedure) =>
    procedure.use(async ({ ctx, getRawInput, next }) => {
      const input = (await getRawInput()) as { id?: unknown } | undefined;
      if (typeof input?.id !== 'string') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'withRiskCheck needs a payout id' });
      }
      await enforceRiskCheck(ctx, input.id);
      return next();
    });

  return {
    router: t.router,
    publicProcedure: t.procedure,
    protectedProcedure,
    withRiskCheck,
  };
}
