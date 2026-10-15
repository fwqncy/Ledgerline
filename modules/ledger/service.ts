import type { AuditEvent } from '@ledgerline/core/db';
import { toCsv } from '@ledgerline/core/format';
import type { BaseContext } from '@ledgerline/core/server';

import type { Desk } from './desks';

export function createLedgerService({ db }: BaseContext) {
  const where = (input: { q?: string; desk?: Desk }) => ({
    module: input.desk,
    OR: input.q
      ? [
          { action: { contains: input.q, mode: 'insensitive' as const } },
          { actor: { contains: input.q, mode: 'insensitive' as const } },
          { targetId: { contains: input.q, mode: 'insensitive' as const } },
          { detail: { contains: input.q, mode: 'insensitive' as const } },
        ]
      : undefined,
  });

  return {
    async events(input: { q?: string; desk?: Desk; cursor?: number | null; limit: number }) {
      const offset = input.cursor ?? 0;
      const [items, total] = await Promise.all([
        db.auditEvent.findMany({ where: where(input), orderBy: { at: 'desc' }, skip: offset, take: input.limit }),
        db.auditEvent.count({ where: where(input) }),
      ]);
      // Name the payouts so the log reads like sentences, not IDs.
      const names = new Map<string, string>();
      for (const e of items) {
        if (e.targetId.startsWith('po_') && !names.has(e.targetId)) {
          const p = await db.payout.findUnique({ where: { id: e.targetId } });
          if (p) names.set(e.targetId, p.beneficiary);
        }
      }
      const next = offset + items.length;
      return {
        items: items.map((e: AuditEvent) => ({ ...e, subject: names.get(e.targetId) ?? null })),
        total,
        nextCursor: next < total ? next : null,
      };
    },

    async exportCsv(input: { q?: string; desk?: Desk }) {
      const rows = await db.auditEvent.findMany({ where: where(input), orderBy: { at: 'desc' } });
      return toCsv([
        ['id', 'at', 'desk', 'action', 'actor', 'target', 'detail'],
        ...rows.map((e) => [e.id, e.at, e.module, e.action, e.actor, e.targetId, e.detail ?? '']),
      ]);
    },

    async accounts() {
      const paid = await db.payout.findMany({ where: { status: 'paid' }, orderBy: { paidAt: 'asc' } });
      const now = new Date();
      const rows = new Map<
        string,
        { name: string; city: string; country: string; count: number; total: number; lastPaidAt: string; months: number[] }
      >();
      for (const p of paid) {
        const row =
          rows.get(p.beneficiary) ??
          { name: p.beneficiary, city: p.city, country: p.country, count: 0, total: 0, lastPaidAt: p.paidAt!, months: Array.from({ length: 12 }, () => 0) };
        row.count += 1;
        row.total += p.amount;
        row.lastPaidAt = p.paidAt!;
        const at = new Date(p.paidAt!);
        const age = (now.getUTCFullYear() - at.getUTCFullYear()) * 12 + now.getUTCMonth() - at.getUTCMonth();
        if (age >= 0 && age < 12) row.months[11 - age]! += p.amount;
        rows.set(p.beneficiary, row);
      }
      return [...rows.values()].sort((a, b) => b.total - a.total);
    },
  };
}
