import { TRPCError } from '@trpc/server';
import { newId } from './db';
import { formatMoney } from './format';
import type { BaseContext, Operator } from './server';

export const APPROVAL_LIMIT = 2_000_000;

export const OPERATORS_ON_DUTY = ['Alex Morgan', 'Priya N.', 'Sam Ortiz', 'Jordan Lee'];

export const RISK_RULES = [
  { id: 'limit', name: 'Operator Approval Limit', description: `Payouts above ${formatMoney(APPROVAL_LIMIT)} need a second review by Risk.` },
  { id: 'beneficiary-change', name: 'Beneficiary Change Window', description: 'Hold payouts when bank details changed in the last 24\u00a0hours.' },
  { id: 'velocity', name: 'Velocity', description: 'Hold more than 3 payouts to one beneficiary within 24\u00a0hours.' },
  { id: 'sanctions', name: 'Watchlist Screening', description: 'Hold beneficiaries that match a sanctions or watchlist entry.' },
] as const;

export async function enforceRiskCheck(ctx: BaseContext & { operator: Operator }, payoutId: string) {
  const payout = await ctx.db.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new TRPCError({ code: 'NOT_FOUND', message: `Payout ${payoutId} not found` });

  const flags = await ctx.db.riskFlag.findMany({ where: { payoutId } });
  const open = flags.find((f) => f.status === 'open');
  if (open) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Held by Risk: ${open.reason}. Clear it in Risk, then approve again.` });
  }
  const rejected = flags.find((f) => f.status === 'rejected');
  if (rejected) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Rejected by Risk: ${rejected.reason}. This payout can’t be sent; create a new one if it’s still owed.` });
  }

  const cleared = flags.some((f) => f.status === 'cleared');
  if (payout.amount > ctx.operator.approvalLimit && !cleared) {
    const reason = `Above ${formatMoney(ctx.operator.approvalLimit)} operator approval limit`;
    const now = new Date().toISOString();
    await ctx.db.riskFlag.create({
      data: { id: newId('rf'), payoutId, rule: 'limit', reason, score: 55, status: 'open', createdAt: now, resolvedAt: null, resolvedBy: null },
    });
    await ctx.db.payout.update({ where: { id: payoutId }, data: { status: 'review' } });
    await ctx.audit('risk.flag', payoutId, reason);
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Sent to Risk for review: ${reason}. Approve again once Risk clears it.` });
  }
}
