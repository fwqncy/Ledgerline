import type { AuditEvent, Funding, Payout, RiskFlag, Ticket } from './db';
import { CITIES, methodFor } from './geo';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NBSP = ' ';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

/** Deterministic PRNG so every boot tells the same story. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OPERATORS = ['Alex Morgan', 'Priya N.', 'Sam Ortiz', 'Jordan Lee'];

/** Regular beneficiaries: city, typical payout (pence) and how often they're paid. */
const BENEFICIARIES = [
  { name: 'Northwind Ltd', city: 'London', base: 980_000, weight: 6, account: '4410' },
  { name: 'Acme Freight', city: 'Felixstowe', base: 420_000, weight: 6, account: '9082' },
  { name: 'Kite & Co', city: 'Manchester', base: 110_000, weight: 5, account: '1177' },
  { name: 'Blue Harbour', city: 'Bristol', base: 1_900_000, weight: 2, account: '3054' },
  { name: 'Lumen Studio', city: 'Lisbon', base: 140_000, weight: 4, account: '6620' },
  { name: 'Fenwick Supply', city: 'Newcastle', base: 460_000, weight: 4, account: '2209' },
  { name: 'Orchard Labs', city: 'Dublin', base: 1_300_000, weight: 2, account: '5583' },
  { name: 'Maple & Rye', city: 'Toronto', base: 760_000, weight: 3, account: '7716' },
  { name: 'Stratus Data', city: 'Singapore', base: 1_150_000, weight: 2, account: '0048' },
  { name: 'Harbourline Café', city: 'Edinburgh', base: 70_000, weight: 4, account: '8831' },
  { name: 'Atlas Textiles', city: 'Istanbul', base: 520_000, weight: 3, account: '3391' },
  { name: 'Meridian Coffee', city: 'Bogotá', base: 380_000, weight: 3, account: '2716' },
  { name: 'Saltmarsh Media', city: 'Amsterdam', base: 260_000, weight: 4, account: '9940' },
  { name: 'Copperline Metals', city: 'Johannesburg', base: 1_450_000, weight: 2, account: '6105' },
  { name: 'Hanami Goods', city: 'Osaka', base: 340_000, weight: 3, account: '4478' },
  { name: 'Redwood Analytics', city: 'San Francisco', base: 890_000, weight: 3, account: '1029' },
  { name: 'Baltic Timber', city: 'Riga', base: 610_000, weight: 2, account: '5560' },
  { name: 'Coral & Vine', city: 'Sydney', base: 290_000, weight: 2, account: '7302' },
  { name: 'Oasis Logistics', city: 'Dubai', base: 1_020_000, weight: 2, account: '8817' },
  { name: 'Pampas Leather', city: 'Buenos Aires', base: 330_000, weight: 2, account: '6694' },
  { name: 'Nordlys Energy', city: 'Oslo', base: 1_250_000, weight: 2, account: '2283' },
  { name: 'Ganges Spice', city: 'Mumbai', base: 190_000, weight: 3, account: '4951' },
  { name: 'Lagos Mobile', city: 'Lagos', base: 240_000, weight: 2, account: '3807' },
  { name: 'Brightwater Ltd', city: 'Glasgow', base: 150_000, weight: 4, account: '1846' },
  { name: 'Hudson & Pike', city: 'New York', base: 1_600_000, weight: 2, account: '9123' },
];

export const KNOWN_BENEFICIARIES = BENEFICIARIES.map(({ name, city, account }) => {
  const country = CITIES[city]?.country ?? 'GB';
  return { name, city, country, account: `${country} •• ${account}` };
});

function payout(
  p: Omit<Payout, 'currency' | 'country' | 'method' | 'idempotencyKey' | 'account' | 'createdBy'> & {
    createdBy?: string;
  },
): Payout {
  const ben = BENEFICIARIES.find((b) => b.name === p.beneficiary);
  const city = CITIES[p.city];
  const country = city?.country ?? 'GB';
  return {
    ...p,
    currency: 'GBP',
    country,
    account: `${country} •• ${ben?.account ?? '0000'}`,
    method: methodFor(country, p.amount),
    createdBy: p.createdBy ?? 'Alex Morgan',
    idempotencyKey: null,
  };
}

export function seed() {
  const rand = mulberry32(20131225);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rand() * items.length)]!;
  const totalWeight = BENEFICIARIES.reduce((sum, b) => sum + b.weight, 0);
  const pickBeneficiary = () => {
    let r = rand() * totalWeight;
    for (const b of BENEFICIARIES) if ((r -= b.weight) <= 0) return b;
    return BENEFICIARIES[0]!;
  };

  // The desk as it stands this morning.
  const recent: Payout[] = [
    payout({ id: 'po_8f21', beneficiary: 'Northwind Ltd', city: 'London', amount: 1_248_000, status: 'pending', reference: 'NW-INV-2291', createdAt: minutesAgo(6), paidAt: null }),
    payout({ id: 'po_8f1c', beneficiary: 'Acme Freight', city: 'Felixstowe', amount: 391_520, status: 'review', reference: 'ACME-0614', createdAt: minutesAgo(22), paidAt: null }),
    payout({ id: 'po_8f0a', beneficiary: 'Kite & Co', city: 'Manchester', amount: 84_200, status: 'paid', reference: 'KITE-JUN-02', createdAt: minutesAgo(48), paidAt: minutesAgo(41) }),
    payout({ id: 'po_8ef7', beneficiary: 'Blue Harbour', city: 'Bristol', amount: 2_710_000, status: 'paid', reference: 'BH-Q2-SETTLE', createdAt: minutesAgo(95), paidAt: minutesAgo(70) }),
    payout({ id: 'po_8ee3', beneficiary: 'Lumen Studio', city: 'Lisbon', amount: 126_075, status: 'paid', reference: 'LUMEN-118', createdAt: minutesAgo(130), paidAt: minutesAgo(124) }),
    payout({ id: 'po_8ed9', beneficiary: 'Fenwick Supply', city: 'Newcastle', amount: 512_040, status: 'review', reference: 'FEN-7731', createdAt: minutesAgo(190), paidAt: null }),
    payout({ id: 'po_8ed2', beneficiary: 'Orchard Labs', city: 'Dublin', amount: 2_460_000, status: 'pending', reference: 'ORCH-SOW-14', createdAt: minutesAgo(260), paidAt: null }),
    payout({ id: 'po_8ec4', beneficiary: 'Maple & Rye', city: 'Toronto', amount: 988_000, status: 'paid', reference: 'MR-0402', createdAt: minutesAgo(410), paidAt: minutesAgo(396) }),
    payout({ id: 'po_8eb1', beneficiary: 'Stratus Data', city: 'Singapore', amount: 1_575_000, status: 'rejected', reference: 'STR-9001', createdAt: minutesAgo(620), paidAt: null }),
    payout({ id: 'po_8ea0', beneficiary: 'Harbourline Café', city: 'Edinburgh', amount: 64_000, status: 'pending', reference: 'HLC-JUN', createdAt: minutesAgo(900), paidAt: null }),
  ];

  // A year of trading days before that.
  const history: Payout[] = [];
  const todayStart = Math.floor(Date.now() / DAY) * DAY;
  const historyEnd = Date.now() - 16 * HOUR;
  for (let d = 365; d >= 1; d--) {
    const day = todayStart - d * DAY;
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const growth = 0.55 + 0.65 * (1 - d / 365);
    const count = 3 + Math.floor(rand() * 7);
    for (let i = 0; i < count; i++) {
      const ben = pickBeneficiary();
      const createdAt = day + 9 * HOUR + rand() * 8 * HOUR;
      if (createdAt > historyEnd) continue;
      const amount = Math.round((ben.base * growth * (0.35 + rand() * 1.3)) / 5) * 5;
      const rejected = rand() < 0.012;
      history.push(
        payout({
          id: '',
          beneficiary: ben.name,
          city: ben.city,
          amount,
          status: rejected ? 'rejected' : 'paid',
          reference: `${ben.name.replace(/[^A-Z]/g, '').slice(0, 4)}-${(1000 + Math.floor(rand() * 9000)).toString()}`,
          createdAt: new Date(createdAt).toISOString(),
          paidAt: rejected ? null : new Date(createdAt + (5 + rand() * 85) * MINUTE).toISOString(),
          createdBy: pick(OPERATORS),
        }),
      );
    }
  }
  // Ids count down from the oldest of today's payouts, so they read in order like the rest.
  history.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  history.forEach((p, i) => (p.id = `po_${(0x8e9f - i).toString(16)}`));

  const payouts = [...recent, ...history];

  // Fund the account: an opening float, morning sweeps when it runs low, and merchant settlements.
  const funding: Funding[] = [];
  let fundingSeq = 0;
  const fund = (amount: number, source: string, at: number) =>
    funding.push({ id: `fd_${(fundingSeq++).toString(16).padStart(4, '0')}`, amount, source, at: new Date(at).toISOString() });

  const outflows = payouts
    .filter((p) => p.paidAt)
    .map((p) => ({ at: Date.parse(p.paidAt!), amount: p.amount }))
    .sort((a, b) => a.at - b.at);

  let balance = 0;
  const start = todayStart - 366 * DAY;
  fund(22_000_000, 'Opening float', start + 8 * HOUR);
  balance += 22_000_000;
  let next = 0;
  for (let day = start; day <= todayStart; day += DAY) {
    const growth = 0.55 + 0.65 * ((day - start) / (366 * DAY));
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) {
      if (balance < 16_000_000 * growth) {
        const amount = Math.round((15_000_000 + rand() * 17_000_000) * growth);
        fund(amount, 'Treasury sweep · Barclays', day + 8.5 * HOUR);
        balance += amount;
      }
      const settlements = Math.floor(rand() * 3);
      for (let s = 0; s < settlements; s++) {
        const amount = Math.round((500_000 + rand() * 3_500_000) * growth);
        fund(amount, pick(['Merchant settlement · Visa', 'Merchant settlement · Mastercard', 'Card acquiring payout']), day + (10 + rand() * 6) * HOUR);
        balance += amount;
      }
    }
    while (next < outflows.length && outflows[next]!.at < day + DAY) {
      const out = outflows[next++]!;
      if (balance - out.amount < 2_000_000) {
        const amount = Math.round(12_000_000 * growth);
        fund(amount, 'Intraday sweep · Barclays', out.at - MINUTE);
        balance += amount;
      }
      balance -= out.amount;
    }
  }

  const riskFlags: RiskFlag[] = [
    { id: 'rf_21a4', payoutId: 'po_8f1c', rule: 'beneficiary-change', reason: `Bank details changed 2${NBSP}h before payout`, score: 72, status: 'open', createdAt: minutesAgo(21), resolvedAt: null, resolvedBy: null },
    { id: 'rf_1f90', payoutId: 'po_8ed9', rule: 'velocity', reason: `4 payouts to this beneficiary in 24${NBSP}h`, score: 64, status: 'open', createdAt: minutesAgo(188), resolvedAt: null, resolvedBy: null },
    { id: 'rf_1c33', payoutId: 'po_8ef7', rule: 'limit', reason: 'Above £20,000.00 operator approval limit', score: 41, status: 'cleared', createdAt: minutesAgo(93), resolvedAt: minutesAgo(74), resolvedBy: 'Priya N.' },
    { id: 'rf_1a07', payoutId: 'po_8eb1', rule: 'sanctions', reason: 'Beneficiary name partially matches a watchlist entry', score: 91, status: 'rejected', createdAt: minutesAgo(615), resolvedAt: minutesAgo(560), resolvedBy: 'Priya N.' },
  ];

  const auditEvents: AuditEvent[] = [
    { id: 'au_0001', action: 'risk.flag', module: 'risk', actor: 'system', targetId: 'po_8f1c', detail: `Bank details changed 2${NBSP}h before payout`, at: minutesAgo(21) },
    { id: 'au_0002', action: 'risk.flag', module: 'risk', actor: 'system', targetId: 'po_8ed9', detail: `4 payouts to this beneficiary in 24${NBSP}h`, at: minutesAgo(188) },
    { id: 'au_0003', action: 'risk.clear', module: 'risk', actor: 'Priya N.', targetId: 'po_8ef7', detail: null, at: minutesAgo(74) },
    { id: 'au_0004', action: 'payout.approve', module: 'payouts', actor: 'Alex Morgan', targetId: 'po_8ef7', detail: null, at: minutesAgo(70) },
    { id: 'au_0005', action: 'payout.approve', module: 'payouts', actor: 'Alex Morgan', targetId: 'po_8f0a', detail: null, at: minutesAgo(41) },
    { id: 'au_0006', action: 'risk.reject', module: 'risk', actor: 'Priya N.', targetId: 'po_8eb1', detail: 'Beneficiary name partially matches a watchlist entry', at: minutesAgo(560) },
    { id: 'au_0007', action: 'payout.approve', module: 'payouts', actor: 'Sam Ortiz', targetId: 'po_8ee3', detail: null, at: minutesAgo(125) },
    { id: 'au_0008', action: 'payout.approve', module: 'payouts', actor: 'Jordan Lee', targetId: 'po_8ec4', detail: null, at: minutesAgo(397) },
  ];

  // History leaves the same trail: large payouts were cleared by Risk, the rest approved.
  let auditSeq = 0x100;
  let flagSeq = 0x100;
  for (const p of history) {
    const at = Date.parse(p.paidAt ?? p.createdAt);
    const actor = pick(OPERATORS.filter((o) => o !== p.createdBy));
    if (p.status === 'rejected') {
      const reason = 'Beneficiary name partially matches a watchlist entry';
      riskFlags.push({ id: `rf_${(flagSeq++).toString(16)}`, payoutId: p.id, rule: 'sanctions', reason, score: 88, status: 'rejected', createdAt: p.createdAt, resolvedAt: new Date(at + 40 * MINUTE).toISOString(), resolvedBy: 'Priya N.' });
      auditEvents.push({ id: `au_${(auditSeq++).toString(16)}`, action: 'risk.reject', module: 'risk', actor: 'Priya N.', targetId: p.id, detail: reason, at: new Date(at + 40 * MINUTE).toISOString() });
      continue;
    }
    if (p.amount > 2_000_000) {
      const reason = 'Above £20,000.00 operator approval limit';
      riskFlags.push({ id: `rf_${(flagSeq++).toString(16)}`, payoutId: p.id, rule: 'limit', reason, score: 40 + Math.floor(rand() * 20), status: 'cleared', createdAt: p.createdAt, resolvedAt: new Date(at - 3 * MINUTE).toISOString(), resolvedBy: 'Priya N.' });
      auditEvents.push({ id: `au_${(auditSeq++).toString(16)}`, action: 'risk.clear', module: 'risk', actor: 'Priya N.', targetId: p.id, detail: reason, at: new Date(at - 3 * MINUTE).toISOString() });
    }
    auditEvents.push({ id: `au_${(auditSeq++).toString(16)}`, action: 'payout.approve', module: 'payouts', actor, targetId: p.id, detail: null, at: new Date(at - MINUTE).toISOString() });
  }

  const sla = (createdMinutesAgo: number, priority: Ticket['priority']) =>
    minutesAgo(createdMinutesAgo - { high: 60, normal: 240, low: 1440 }[priority]);

  const tickets: Ticket[] = [
    {
      id: 'T-1042', subject: 'Payout still not received', merchant: 'Acme Freight', payoutId: 'po_8f1c', priority: 'high', status: 'open', assignee: null,
      slaDueAt: sla(15, 'high'), createdAt: minutesAgo(15), updatedAt: minutesAgo(15),
      messages: [{ id: 'm_1', author: 'Dana at Acme Freight', from: 'merchant', body: 'Hi, our June payout (ACME-0614) shows as created but hasn’t landed. We updated our bank details this morning, could that be it?', at: minutesAgo(15) }],
    },
    {
      id: 'T-1041', subject: 'Why are payouts being held?', merchant: 'Fenwick Supply', payoutId: 'po_8ed9', priority: 'normal', status: 'open', assignee: 'Sam Ortiz',
      slaDueAt: sla(150, 'normal'), createdAt: minutesAgo(150), updatedAt: minutesAgo(150),
      messages: [{ id: 'm_2', author: 'Tom Fenwick', from: 'merchant', body: 'We’ve sent several invoices this week for a seasonal order. Is there anything you need from us to release FEN-7731?', at: minutesAgo(150) }],
    },
    {
      id: 'T-1040', subject: 'Can we split a payout across two accounts?', merchant: 'Atlas Textiles', payoutId: null, priority: 'low', status: 'open', assignee: null,
      slaDueAt: sla(300, 'low'), createdAt: minutesAgo(300), updatedAt: minutesAgo(300),
      messages: [{ id: 'm_7', author: 'Elif, Atlas Textiles', from: 'merchant', body: 'Our finance team would like 70% to go to our TRY account and 30% to GBP. Is that something you support?', at: minutesAgo(300) }],
    },
    {
      id: 'T-1039', subject: 'Remittance advice for Q2 settlement', merchant: 'Blue Harbour', payoutId: 'po_8ef7', priority: 'low', status: 'waiting', assignee: 'Alex Morgan',
      slaDueAt: sla(80, 'low'), createdAt: minutesAgo(80), updatedAt: minutesAgo(60),
      messages: [
        { id: 'm_3', author: 'Accounts, Blue Harbour', from: 'merchant', body: 'Could you send remittance advice for the Q2 settlement?', at: minutesAgo(80) },
        { id: 'm_4', author: 'Alex Morgan', from: 'operator', body: `Of course. It was paid 70${NBSP}minutes ago; I’ve attached the advice to your dashboard. Anything else?`, at: minutesAgo(60) },
      ],
    },
    {
      id: 'T-1036', subject: 'Fees on last settlement', merchant: 'Kite & Co', payoutId: 'po_8f0a', priority: 'normal', status: 'resolved', assignee: 'Alex Morgan',
      slaDueAt: sla(600, 'normal'), createdAt: minutesAgo(600), updatedAt: minutesAgo(420),
      messages: [
        { id: 'm_5', author: 'Sam, Kite & Co', from: 'merchant', body: 'The fee on our last settlement looks higher than usual.', at: minutesAgo(600) },
        { id: 'm_6', author: 'Alex Morgan', from: 'operator', body: 'That included a one-off FX conversion. Future GBP payouts won’t carry it.', at: minutesAgo(420) },
      ],
    },
    {
      id: 'T-1031', subject: 'Payout arrived twice?', merchant: 'Saltmarsh Media', payoutId: null, priority: 'high', status: 'resolved', assignee: 'Jordan Lee',
      slaDueAt: sla(2900, 'high'), createdAt: minutesAgo(2900), updatedAt: minutesAgo(2850),
      messages: [
        { id: 'm_8', author: 'Ruth, Saltmarsh Media', from: 'merchant', body: 'We see two credits for invoice SM-2210. Was that intentional?', at: minutesAgo(2900) },
        { id: 'm_9', author: 'Jordan Lee', from: 'operator', body: 'Good catch: the second credit was a bank-side duplicate and has been recalled. You don’t need to do anything.', at: minutesAgo(2850) },
      ],
    },
  ];

  return { payouts, funding, riskFlags, tickets, auditEvents };
}
