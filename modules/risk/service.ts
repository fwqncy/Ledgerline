import type { RiskFlagStatus } from '@ledgerline/core/db';
import { APPROVAL_LIMIT, RISK_RULES, TRPCError, type BaseContext } from '@ledgerline/core/server';

export function createRiskService({ db, operator, audit }: BaseContext) {
  return {
    async queue(status: RiskFlagStatus) {
      const flags = await db.riskFlag.findMany({ where: { status }, orderBy: { createdAt: 'desc' } });
      return Promise.all(
        flags.map(async (flag) => ({ ...flag, payout: await db.payout.findUnique({ where: { id: flag.payoutId } }) })),
      );
    },

    async rules() {
      const held = await db.riskFlag.findMany({ where: { status: 'open' } });
      return {
        approvalLimit: APPROVAL_LIMIT,
        rules: RISK_RULES.map((rule) => ({ ...rule, open: held.filter((f) => f.rule === rule.id).length })),
      };
    },

    async resolve(id: string, outcome: Exclude<RiskFlagStatus, 'open'>) {
      const flag = await db.riskFlag.findUnique({ where: { id } });
      if (!flag) throw new TRPCError({ code: 'NOT_FOUND', message: `Risk flag ${id} not found` });
      if (flag.status !== 'open') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `This flag was already ${flag.status}. Refresh to see the latest queue.` });
      }

      const updated = await db.riskFlag.update({
        where: { id },
        data: { status: outcome, resolvedAt: new Date().toISOString(), resolvedBy: operator?.name ?? 'unknown' },
      });

      if (outcome === 'rejected') {
        await db.payout.update({ where: { id: flag.payoutId }, data: { status: 'rejected' } });
      } else {
        // Release the payout back to Payouts once nothing else is holding it.
        const stillHeld = await db.riskFlag.count({ where: { payoutId: flag.payoutId, status: 'open' } });
        const payout = await db.payout.findUnique({ where: { id: flag.payoutId } });
        if (!stillHeld && payout?.status === 'review') {
          await db.payout.update({ where: { id: flag.payoutId }, data: { status: 'pending' } });
        }
      }

      await audit(outcome === 'cleared' ? 'risk.clear' : 'risk.reject', flag.payoutId, flag.reason);
      return updated;
    },
  };
}
