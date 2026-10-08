import type { Payout } from '@ledgerline/core/db';
import { TRPCError, type BaseContext } from '@ledgerline/core/server';

export function createPayoutService({ db }: BaseContext) {
  async function find(id: string) {
    const payout = await db.payout.findUnique({ where: { id } });
    if (!payout) throw new TRPCError({ code: 'NOT_FOUND', message: `Payout ${id} not found` });
    return payout;
  }

  return {
    async approve(id: string) {
      const payout = await find(id);
      if (payout.status !== 'pending') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `${id} is already ${payout.status}. Select a pending payout to approve.`,
        });
      }
      return db.payout.update({ where: { id }, data: { status: 'paid', paidAt: new Date().toISOString() } });
    },

    async get(id: string) {
      const [payout, riskFlags, activity] = await Promise.all([
        find(id),
        db.riskFlag.findMany({ where: { payoutId: id }, orderBy: { createdAt: 'desc' } }),
        db.auditEvent.findMany({ where: { targetId: id }, orderBy: { at: 'desc' } }),
      ]);
      return { payout, riskFlags, activity };
    },

    async summary() {
      const payouts = await db.payout.findMany();
      const total = (status: Payout['status']) => {
        const matching = payouts.filter((p) => p.status === status);
        return { count: matching.length, amount: matching.reduce((sum, p) => sum + p.amount, 0) };
      };
      return { pending: total('pending'), review: total('review'), paid: total('paid'), rejected: total('rejected') };
    },
  };
}
