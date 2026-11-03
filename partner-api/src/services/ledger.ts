import type { Db } from '../db';
import type { Account } from '../generated/prisma/client';

export interface Balance {
  accountId: string;
  currency: string;
  /** Credits minus debits. */
  ledger: bigint;
  /** Outstanding (PENDING + REVIEW) payouts: outgoing for the treasury, incoming for a beneficiary. */
  pending: bigint;
  /** What can be spent now: ledger − pending for the treasury, ledger for a beneficiary. */
  available: bigint;
  asOf: Date;
}

/** Balances for the given accounts (all owned by `partnerId`), in two grouped queries. */
export async function balancesFor(db: Db, partnerId: string, accounts: Account[]): Promise<Map<string, Balance>> {
  const ids = accounts.map((a) => a.id);
  const [entrySums, pendingSums] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ['accountId', 'direction'],
      where: { accountId: { in: ids }, account: { partnerId } },
      _sum: { amount: true },
    }),
    db.payout.groupBy({
      by: ['accountId'],
      where: { partnerId, status: { in: ['PENDING', 'REVIEW'] } },
      _sum: { amount: true },
    }),
  ]);

  const totalOutgoing = pendingSums.reduce((sum, row) => sum + (row._sum.amount ?? 0n), 0n);
  const asOf = new Date();
  const result = new Map<string, Balance>();
  for (const account of accounts) {
    const sum = (direction: 'CREDIT' | 'DEBIT') =>
      entrySums.find((s) => s.accountId === account.id && s.direction === direction)?._sum.amount ?? 0n;
    const ledger = sum('CREDIT') - sum('DEBIT');
    const pending =
      account.kind === 'TREASURY' ? totalOutgoing : (pendingSums.find((p) => p.accountId === account.id)?._sum.amount ?? 0n);
    result.set(account.id, {
      accountId: account.id,
      currency: account.currency,
      ledger,
      pending,
      available: account.kind === 'TREASURY' ? ledger - pending : ledger,
      asOf,
    });
  }
  return result;
}
