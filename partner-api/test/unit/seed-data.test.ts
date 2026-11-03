import { describe, expect, it } from 'vitest';
import { beneficiaryAccountId, buildLedgerSeed, treasuryAccountId } from '../../src/seed-data';

describe('buildLedgerSeed', () => {
  const partnerId = 'prt_demo';
  const { accounts, payouts, entries } = buildLedgerSeed(partnerId);
  const treasury = treasuryAccountId(partnerId);

  it('creates one treasury account and one account per beneficiary', () => {
    expect(accounts.filter((a) => a.kind === 'TREASURY').map((a) => a.id)).toEqual([treasury]);
    const beneficiaries = new Set(payouts.map((p) => p.accountId));
    expect(accounts.filter((a) => a.kind === 'BENEFICIARY')).toHaveLength(beneficiaries.size);
    expect(accounts.every((a) => a.partnerId === partnerId)).toBe(true);
  });

  it('uses unique ids everywhere', () => {
    for (const rows of [accounts, payouts, entries]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
  });

  it('books every paid payout as a balanced debit/credit pair', () => {
    const paid = payouts.filter((p) => p.status === 'PAID');
    expect(paid.length).toBeGreaterThan(0);
    for (const p of paid) {
      const pair = entries.filter((e) => e.payoutId === p.id);
      expect(pair.map((e) => [e.direction, e.accountId]).sort()).toEqual(
        [
          ['CREDIT', p.accountId],
          ['DEBIT', treasury],
        ].sort(),
      );
      expect(pair.every((e) => e.amount === p.amount)).toBe(true);
    }
  });

  it('books nothing for payouts that have not been paid', () => {
    const unpaid = new Set(payouts.filter((p) => p.status !== 'PAID').map((p) => p.id));
    expect(entries.some((e) => e.payoutId && unpaid.has(e.payoutId))).toBe(false);
  });

  it('keeps the books balanced: funding in = treasury balance + paid out', () => {
    const sum = (filter: (e: (typeof entries)[number]) => boolean) =>
      entries.filter(filter).reduce((total, e) => total + e.amount, 0n);
    const fundingIn = sum((e) => e.accountId === treasury && e.direction === 'CREDIT');
    const paidOut = sum((e) => e.accountId === treasury && e.direction === 'DEBIT');
    const beneficiaryCredits = sum((e) => e.accountId !== treasury);
    expect(beneficiaryCredits).toBe(paidOut);
    expect(fundingIn - paidOut).toBeGreaterThan(0n);
  });

  it('builds stable, readable account ids', () => {
    expect(beneficiaryAccountId('Harbourline Café')).toBe('acc_harbourline_cafe');
    expect(beneficiaryAccountId('Kite & Co')).toBe('acc_kite_co');
  });
});
