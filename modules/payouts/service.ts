import type { Payout } from '@ledgerline/core/db';
import { formatMoney, toCsv } from '@ledgerline/core/format';
import { CITIES, METHOD_LABELS, methodFor } from '@ledgerline/core/geo';
import { enforceRiskCheck, TRPCError, type BaseContext, type Operator } from '@ledgerline/core/server';
import type { CreatePayoutInput, PayoutSort, PayoutStatus } from './schema';

const DAY = 86_400_000;

const ORDER: Record<PayoutSort, { [K in keyof Payout]?: 'asc' | 'desc' }> = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  largest: { amount: 'desc' },
  smallest: { amount: 'asc' },
};

const searchWhere = (q?: string) =>
  q
    ? [
        { beneficiary: { contains: q, mode: 'insensitive' as const } },
        { id: { contains: q, mode: 'insensitive' as const } },
        { reference: { contains: q, mode: 'insensitive' as const } },
      ]
    : undefined;

export function createPayoutService({ db, operator }: BaseContext) {
  async function find(id: string) {
    const payout = await db.payout.findUnique({ where: { id } });
    if (!payout) throw new TRPCError({ code: 'NOT_FOUND', message: `Payout ${id} not found. Check the ID & try again.` });
    return payout;
  }

  async function approve(id: string) {
    const payout = await find(id);
    if (payout.status !== 'pending') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `${id} is already ${payout.status}. Select a pending payout to approve.`,
      });
    }
    return db.payout.update({ where: { id }, data: { status: 'paid', paidAt: new Date().toISOString() } });
  }

  return {
    approve,

    async browse(input: { status?: PayoutStatus; q?: string; sort: PayoutSort; cursor?: number | null; limit: number }) {
      const where = { status: input.status, OR: searchWhere(input.q) };
      const offset = input.cursor ?? 0;
      const [items, total] = await Promise.all([
        db.payout.findMany({ where, orderBy: ORDER[input.sort], skip: offset, take: input.limit }),
        db.payout.count({ where }),
      ]);
      const next = offset + items.length;
      return { items, total, nextCursor: next < total ? next : null };
    },

    async get(id: string) {
      const payout = await find(id);
      const [riskFlags, activity, lifetime] = await Promise.all([
        db.riskFlag.findMany({ where: { payoutId: id }, orderBy: { createdAt: 'desc' } }),
        db.auditEvent.findMany({ where: { targetId: id }, orderBy: { at: 'desc' } }),
        db.payout.findMany({ where: { beneficiary: payout.beneficiary, status: 'paid' }, orderBy: { paidAt: 'asc' } }),
      ]);

      // Monthly totals for the last 12 months, oldest first.
      const now = new Date();
      const months = Array.from({ length: 12 }, () => 0);
      for (const p of lifetime) {
        const paid = new Date(p.paidAt!);
        const age = (now.getUTCFullYear() - paid.getUTCFullYear()) * 12 + now.getUTCMonth() - paid.getUTCMonth();
        if (age >= 0 && age < 12) months[11 - age]! += p.amount;
      }

      return {
        payout,
        riskFlags,
        activity,
        history: {
          count: lifetime.length,
          total: lifetime.reduce((sum, p) => sum + p.amount, 0),
          since: lifetime[0]?.paidAt ?? null,
          months,
        },
      };
    },

    async summary() {
      const payouts = await db.payout.findMany();
      const startOfToday = Math.floor(Date.now() / DAY) * DAY;
      const total = (matching: Payout[]) => ({
        count: matching.length,
        amount: matching.reduce((sum, p) => sum + p.amount, 0),
      });
      const paidSince = (since: number) => payouts.filter((p) => p.paidAt && Date.parse(p.paidAt) >= since);
      return {
        pending: total(payouts.filter((p) => p.status === 'pending')),
        review: total(payouts.filter((p) => p.status === 'review')),
        paidToday: total(paidSince(startOfToday)),
        paid30d: total(paidSince(Date.now() - 30 * DAY)),
      };
    },

    /** Approves several payouts, running each through Risk. One failure doesn't stop the rest. */
    async bulkApprove(ids: string[], ctx: BaseContext & { operator: Operator }) {
      const results: { id: string; ok: boolean; message: string; amount: number }[] = [];
      for (const id of ids) {
        try {
          await enforceRiskCheck(ctx, id);
          await ctx.audit('payout.approve', id, 'Bulk approval');
          const paid = await approve(id);
          results.push({ id, ok: true, message: `${paid.beneficiary} paid`, amount: paid.amount });
        } catch (error) {
          results.push({ id, ok: false, message: error instanceof Error ? error.message : 'Failed', amount: 0 });
        }
      }
      return results;
    },

    async create(input: CreatePayoutInput) {
      // Retrying the same submission returns the payout it already created.
      const existing = await db.payout.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return existing;

      const all = await db.payout.findMany();
      const highest = Math.max(...all.map((p) => parseInt(p.id.slice(3), 16)).filter(Number.isFinite));
      const country = CITIES[input.city]!.country;
      return db.payout.create({
        data: {
          id: `po_${(highest + 1).toString(16)}`,
          beneficiary: input.beneficiary,
          amount: input.amount,
          currency: 'GBP',
          status: 'pending',
          reference: input.reference.toUpperCase(),
          account: `${country} •• ${input.accountLast4}`,
          method: methodFor(country, input.amount),
          city: input.city,
          country,
          createdBy: operator?.name ?? 'Operator',
          createdAt: new Date().toISOString(),
          paidAt: null,
          idempotencyKey: input.idempotencyKey,
        },
      });
    },

    async beneficiaries() {
      const payouts = await db.payout.findMany({ orderBy: { createdAt: 'desc' } });
      const seen = new Map<string, { name: string; city: string; accountLast4: string }>();
      for (const p of payouts) {
        if (!seen.has(p.beneficiary)) seen.set(p.beneficiary, { name: p.beneficiary, city: p.city, accountLast4: p.account.slice(-4) });
      }
      return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async exportCsv(input: { status?: PayoutStatus; q?: string }) {
      const rows = await db.payout.findMany({
        where: { status: input.status, OR: searchWhere(input.q) },
        orderBy: { createdAt: 'desc' },
      });
      return toCsv([
        ['id', 'beneficiary', 'amount_gbp', 'status', 'reference', 'method', 'destination', 'created_at', 'paid_at', 'created_by'],
        ...rows.map((p) => [
          p.id,
          p.beneficiary,
          (p.amount / 100).toFixed(2),
          p.status,
          p.reference,
          METHOD_LABELS[p.method],
          `${p.city}, ${p.country}`,
          p.createdAt,
          p.paidAt ?? '',
          p.createdBy,
        ]),
      ]);
    },

    async search(q: string) {
      const rows = await db.payout.findMany({ where: { OR: searchWhere(q) }, orderBy: { createdAt: 'desc' }, take: 6 });
      return rows.map((p) => ({
        id: p.id,
        title: p.beneficiary,
        subtitle: `${p.id} · ${formatMoney(p.amount)} · ${p.status}`,
        href: `/payouts?id=${p.id}`,
        kind: 'Payout',
      }));
    },
  };
}
