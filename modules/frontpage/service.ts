import type { AuditEvent, Payout } from '@ledgerline/core/db';
import { formatMoney } from '@ledgerline/core/format';
import { CITIES, HQ } from '@ledgerline/core/geo';
import type { BaseContext } from '@ledgerline/core/server';

const DAY = 86_400_000;

export const RANGES = { '1M': 31, '3M': 92, '6M': 183, '1Y': 366 } as const;
export type Range = keyof typeof RANGES;

export interface Candle {
  /** Start of the day (UTC, ms). */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Paid out that day, in pence. */
  volume: number;
  count: number;
  /** Funding received that day, in pence. */
  inflow: number;
}

export function createFrontPageService({ db }: BaseContext) {
  /** Every movement on the funding account, oldest first. */
  async function movements() {
    const [funding, paid] = await Promise.all([db.funding.findMany(), db.payout.findMany({ where: { status: 'paid' } })]);
    return [
      ...funding.map((f) => ({ at: Date.parse(f.at), delta: f.amount })),
      ...paid.filter((p) => p.paidAt).map((p) => ({ at: Date.parse(p.paidAt!), delta: -p.amount })),
    ].sort((a, b) => a.at - b.at);
  }

  /** One candle per trading day: how the float opened, peaked, bottomed & closed. */
  async function candles(range: Range): Promise<Candle[]> {
    const days = new Map<number, Candle>();
    let balance = 0;
    for (const m of await movements()) {
      const t = Math.floor(m.at / DAY) * DAY;
      let candle = days.get(t);
      if (!candle) {
        candle = { t, o: balance, h: balance, l: balance, c: balance, volume: 0, count: 0, inflow: 0 };
        days.set(t, candle);
      }
      balance += m.delta;
      candle.h = Math.max(candle.h, balance);
      candle.l = Math.min(candle.l, balance);
      candle.c = balance;
      if (m.delta < 0) {
        candle.volume -= m.delta;
        candle.count += 1;
      } else {
        candle.inflow += m.delta;
      }
    }
    const since = Date.now() - RANGES[range] * DAY;
    return [...days.values()].filter((c) => c.t >= since).sort((a, b) => a.t - b.t);
  }

  function describe(event: AuditEvent, payout: Payout | undefined) {
    const who = payout ? `${payout.beneficiary} · ${formatMoney(payout.amount)}` : event.targetId;
    switch (event.action) {
      case 'payout.approve':
        return `${event.actor} approved ${who}.`;
      case 'payout.create':
        return `${event.actor} drew up a payout to ${who}.`;
      case 'risk.flag':
        return `Risk held ${who}: ${event.detail ?? 'flagged'}.`;
      case 'risk.clear':
        return `${event.actor} cleared ${who} for payment.`;
      case 'risk.reject':
        return `${event.actor} voided ${who}.`;
      case 'ticket.reply':
        return `${event.actor} answered ticket ${event.targetId}.`;
      case 'ticket.resolve':
        return `${event.actor} closed ticket ${event.targetId}.`;
      case 'ticket.assign':
        return `${event.actor} took ticket ${event.targetId}.`;
      default:
        return `${event.actor}: ${event.action} on ${event.targetId}.`;
    }
  }

  return {
    candles,

    async edition() {
      const now = Date.now();
      const startOfToday = Math.floor(now / DAY) * DAY;
      const [payouts, funding, openTickets, events] = await Promise.all([
        db.payout.findMany(),
        db.funding.findMany({ orderBy: { at: 'asc' } }),
        db.ticket.count({ where: { status: 'open' } }),
        db.auditEvent.findMany({ orderBy: { at: 'desc' }, take: 8 }),
      ]);
      const sum = (rows: Payout[]) => ({ count: rows.length, amount: rows.reduce((s, p) => s + p.amount, 0) });
      const paidBetween = (from: number, to: number) =>
        payouts.filter((p) => p.paidAt && Date.parse(p.paidAt) >= from && Date.parse(p.paidAt) < to);

      const moves = await movements();
      const balance = moves.reduce((s, m) => s + m.delta, 0);
      const balanceDayAgo = moves.filter((m) => m.at <= now - DAY).reduce((s, m) => s + m.delta, 0);
      const paid = payouts.filter((p) => p.status === 'paid');
      const founded = Date.parse(funding[0]?.at ?? new Date().toISOString());

      const last30 = paidBetween(now - 30 * DAY, now + 1);
      const byBeneficiary = new Map<string, { name: string; amount: number; count: number }>();
      for (const p of last30) {
        const row = byBeneficiary.get(p.beneficiary) ?? { name: p.beneficiary, amount: 0, count: 0 };
        row.amount += p.amount;
        row.count += 1;
        byBeneficiary.set(p.beneficiary, row);
      }

      const byId = new Map(payouts.map((p) => [p.id, p]));
      return {
        issue: Math.max(1, Math.floor((now - founded) / DAY)),
        volume: Math.max(1, Math.ceil((now - founded) / (365 * DAY))),
        balance,
        balanceChange: balance - balanceDayAgo,
        pending: sum(payouts.filter((p) => p.status === 'pending')),
        held: sum(payouts.filter((p) => p.status === 'review')),
        paidToday: sum(paidBetween(startOfToday, now + 1)),
        paidYesterday: sum(paidBetween(startOfToday - DAY, startOfToday)),
        lifetime: { ...sum(paid), since: paid.reduce((min, p) => (p.paidAt! < min ? p.paidAt! : min), new Date().toISOString()) },
        openTickets,
        topBeneficiaries: [...byBeneficiary.values()].sort((a, b) => b.amount - a.amount).slice(0, 6),
        wire: events.map((e) => ({
          id: e.id,
          at: e.at,
          text: describe(e, byId.get(e.targetId)),
          href: e.targetId.startsWith('po_') ? `/payouts?id=${e.targetId}` : e.targetId.startsWith('T-') ? `/support?id=${e.targetId}` : null,
        })),
      };
    },

    /** Where the money went in the last 90 days, for the globe. */
    async routes() {
      const since = new Date(Date.now() - 90 * DAY).toISOString();
      const paid = await db.payout.findMany({ where: { status: 'paid', paidAt: { gte: since } } });
      const byCity = new Map<string, { city: string; country: string; lat: number; lng: number; count: number; amount: number }>();
      for (const p of paid) {
        const geo = CITIES[p.city];
        if (!geo) continue;
        const row = byCity.get(p.city) ?? { city: p.city, country: geo.country, lat: geo.lat, lng: geo.lng, count: 0, amount: 0 };
        row.count += 1;
        row.amount += p.amount;
        byCity.set(p.city, row);
      }
      return { hq: HQ, cities: [...byCity.values()].sort((a, b) => b.amount - a.amount) };
    },
  };
}
