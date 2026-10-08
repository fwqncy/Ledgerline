import type { AuditEvent, Payout, RiskFlag, Ticket } from './db';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function seed() {
  const payouts: Payout[] = [
    { id: 'po_8f21', beneficiary: 'Northwind Ltd', amount: 1_248_000, status: 'pending', reference: 'NW-INV-2291', account: 'GB •• 4410', createdAt: minutesAgo(6), paidAt: null },
    { id: 'po_8f1c', beneficiary: 'Acme Freight', amount: 391_520, status: 'review', reference: 'ACME-0614', account: 'GB •• 9082', createdAt: minutesAgo(22), paidAt: null },
    { id: 'po_8f0a', beneficiary: 'Kite & Co', amount: 84_200, status: 'paid', reference: 'KITE-JUN-02', account: 'GB •• 1177', createdAt: minutesAgo(48), paidAt: minutesAgo(41) },
    { id: 'po_8ef7', beneficiary: 'Blue Harbour', amount: 2_710_000, status: 'paid', reference: 'BH-Q2-SETTLE', account: 'GB •• 3054', createdAt: minutesAgo(95), paidAt: minutesAgo(70) },
    { id: 'po_8ee3', beneficiary: 'Lumen Studio', amount: 126_075, status: 'paid', reference: 'LUMEN-118', account: 'GB •• 6620', createdAt: minutesAgo(130), paidAt: minutesAgo(124) },
    { id: 'po_8ed9', beneficiary: 'Fenwick Supply', amount: 512_040, status: 'review', reference: 'FEN-7731', account: 'GB •• 2209', createdAt: minutesAgo(190), paidAt: null },
    { id: 'po_8ed2', beneficiary: 'Orchard Labs', amount: 2_460_000, status: 'pending', reference: 'ORCH-SOW-14', account: 'GB •• 5583', createdAt: minutesAgo(260), paidAt: null },
    { id: 'po_8ec4', beneficiary: 'Maple & Rye', amount: 988_000, status: 'paid', reference: 'MR-0402', account: 'GB •• 7716', createdAt: minutesAgo(410), paidAt: minutesAgo(396) },
    { id: 'po_8eb1', beneficiary: 'Stratus Data', amount: 1_575_000, status: 'rejected', reference: 'STR-9001', account: 'GB •• 0048', createdAt: minutesAgo(620), paidAt: null },
    { id: 'po_8ea0', beneficiary: 'Harbourline Café', amount: 64_000, status: 'pending', reference: 'HLC-JUN', account: 'GB •• 8831', createdAt: minutesAgo(900), paidAt: null },
  ].map((p) => ({ ...p, currency: 'GBP' as const, status: p.status as Payout['status'] }));

  const riskFlags: RiskFlag[] = [
    { id: 'rf_21a4', payoutId: 'po_8f1c', rule: 'beneficiary-change', reason: 'Bank details changed 2\u00a0h before payout', score: 72, status: 'open', createdAt: minutesAgo(21), resolvedAt: null, resolvedBy: null },
    { id: 'rf_1f90', payoutId: 'po_8ed9', rule: 'velocity', reason: '4 payouts to this beneficiary in 24\u00a0h', score: 64, status: 'open', createdAt: minutesAgo(188), resolvedAt: null, resolvedBy: null },
    { id: 'rf_1c33', payoutId: 'po_8ef7', rule: 'limit', reason: 'Above £20,000.00 operator approval limit', score: 41, status: 'cleared', createdAt: minutesAgo(93), resolvedAt: minutesAgo(74), resolvedBy: 'Priya N.' },
    { id: 'rf_1a07', payoutId: 'po_8eb1', rule: 'sanctions', reason: 'Beneficiary name partially matches a watchlist entry', score: 91, status: 'rejected', createdAt: minutesAgo(615), resolvedAt: minutesAgo(560), resolvedBy: 'Priya N.' },
  ];

  const tickets: Ticket[] = [
    {
      id: 'T-1042', subject: 'Payout still not received', merchant: 'Acme Freight', payoutId: 'po_8f1c', priority: 'high', status: 'open',
      createdAt: minutesAgo(15), updatedAt: minutesAgo(15),
      messages: [{ id: 'm_1', author: 'Dana at Acme Freight', from: 'merchant', body: 'Hi, our June payout (ACME-0614) shows as created but hasn’t landed. We updated our bank details this morning, could that be it?', at: minutesAgo(15) }],
    },
    {
      id: 'T-1041', subject: 'Why are payouts being held?', merchant: 'Fenwick Supply', payoutId: 'po_8ed9', priority: 'normal', status: 'open',
      createdAt: minutesAgo(150), updatedAt: minutesAgo(150),
      messages: [{ id: 'm_2', author: 'Tom Fenwick', from: 'merchant', body: 'We’ve sent several invoices this week for a seasonal order. Is there anything you need from us to release FEN-7731?', at: minutesAgo(150) }],
    },
    {
      id: 'T-1039', subject: 'Remittance advice for Q2 settlement', merchant: 'Blue Harbour', payoutId: 'po_8ef7', priority: 'low', status: 'waiting',
      createdAt: minutesAgo(80), updatedAt: minutesAgo(60),
      messages: [
        { id: 'm_3', author: 'Accounts, Blue Harbour', from: 'merchant', body: 'Could you send remittance advice for the Q2 settlement?', at: minutesAgo(80) },
        { id: 'm_4', author: 'Alex Morgan', from: 'operator', body: 'Of course. It was paid 70\u00a0minutes ago; I’ve attached the advice to your dashboard. Anything else?', at: minutesAgo(60) },
      ],
    },
    {
      id: 'T-1036', subject: 'Fees on last settlement', merchant: 'Kite & Co', payoutId: 'po_8f0a', priority: 'normal', status: 'resolved',
      createdAt: minutesAgo(600), updatedAt: minutesAgo(420),
      messages: [
        { id: 'm_5', author: 'Sam, Kite & Co', from: 'merchant', body: 'The fee on our last settlement looks higher than usual.', at: minutesAgo(600) },
        { id: 'm_6', author: 'Alex Morgan', from: 'operator', body: 'That included a one-off FX conversion. Future GBP payouts won’t carry it.', at: minutesAgo(420) },
      ],
    },
  ];

  const auditEvents: AuditEvent[] = [
    { id: 'au_0001', action: 'risk.flag', module: 'risk', actor: 'system', targetId: 'po_8f1c', detail: 'Bank details changed 2\u00a0h before payout', at: minutesAgo(21) },
    { id: 'au_0002', action: 'risk.flag', module: 'risk', actor: 'system', targetId: 'po_8ed9', detail: '4 payouts to this beneficiary in 24\u00a0h', at: minutesAgo(188) },
    { id: 'au_0003', action: 'risk.clear', module: 'risk', actor: 'Priya N.', targetId: 'po_8ef7', detail: null, at: minutesAgo(74) },
    { id: 'au_0004', action: 'payout.approve', module: 'payouts', actor: 'Alex Morgan', targetId: 'po_8ef7', detail: null, at: minutesAgo(70) },
    { id: 'au_0005', action: 'payout.approve', module: 'payouts', actor: 'Alex Morgan', targetId: 'po_8f0a', detail: null, at: minutesAgo(41) },
    { id: 'au_0006', action: 'risk.reject', module: 'risk', actor: 'Priya N.', targetId: 'po_8eb1', detail: 'Beneficiary name partially matches a watchlist entry', at: minutesAgo(560) },
  ];

  return { payouts, riskFlags, tickets, auditEvents };
}
