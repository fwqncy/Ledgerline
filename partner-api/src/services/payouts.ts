import { methodFor } from '@ledgerline/core/geo';
import type { Db } from '../db';
import type { Payout, PayoutStatus } from '../generated/prisma/client';
import { apiError, badInput, notFound } from '../graphql/errors';
import { newId } from '../ids';
import { treasuryAccountId } from '../seed-data';
import type { Tx } from './idempotency';
import { recordPayoutEvent } from './webhooks';

/**
 * Same limit as the console's operator approval limit (APPROVAL_LIMIT in
 * packages/core/src/risk.ts, not imported because that module boots the
 * console's in-memory store). Larger payouts start in REVIEW.
 */
export const REVIEW_THRESHOLD = 2_000_000n;
export const MAX_PAYOUT = 100_000_000_00n; // £100m

export const CANCELLABLE: PayoutStatus[] = ['PENDING', 'REVIEW'];
const OUTSTANDING: PayoutStatus[] = ['PENDING', 'REVIEW'];

export interface CreatePayoutInput {
  accountId: string;
  amount: bigint;
  reference: string;
}

export function validateCreatePayout(input: CreatePayoutInput): CreatePayoutInput {
  const reference = input.reference.trim();
  if (input.amount <= 0n) throw badInput('`amount` must be greater than zero', { field: 'amount' });
  if (input.amount > MAX_PAYOUT) throw badInput('`amount` is above the per-payout maximum', { field: 'amount' });
  if (!reference || reference.length > 140) throw badInput('`reference` must be 1–140 characters', { field: 'reference' });
  return { ...input, reference };
}

/** Ledger balance minus outstanding (pending + review) payouts. */
export async function treasuryAvailable(tx: Tx | Db, partnerId: string): Promise<bigint> {
  const treasury = treasuryAccountId(partnerId);
  const sums = await tx.ledgerEntry.groupBy({ by: ['direction'], where: { accountId: treasury }, _sum: { amount: true } });
  const credit = sums.find((s) => s.direction === 'CREDIT')?._sum.amount ?? 0n;
  const debit = sums.find((s) => s.direction === 'DEBIT')?._sum.amount ?? 0n;
  const outstanding = await tx.payout.aggregate({ where: { partnerId, status: { in: OUTSTANDING } }, _sum: { amount: true } });
  return credit - debit - (outstanding._sum.amount ?? 0n);
}

export async function createPayout(tx: Tx, partnerId: string, createdBy: string, raw: CreatePayoutInput): Promise<Payout> {
  const input = validateCreatePayout(raw);
  const account = await tx.account.findFirst({ where: { id: input.accountId, partnerId } });
  if (!account) throw notFound('Account', input.accountId);
  if (account.kind !== 'BENEFICIARY') throw badInput('Payouts must go to a BENEFICIARY account', { field: 'accountId' });

  // Serialise payouts per partner so two concurrent requests can't both spend the same float.
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${treasuryAccountId(partnerId)} FOR UPDATE`;
  const available = await treasuryAvailable(tx, partnerId);
  if (input.amount > available) {
    throw apiError('INSUFFICIENT_FUNDS', 'The treasury does not have enough available funds for this payout', 422, {
      available: Number(available),
    });
  }

  const payout = await tx.payout.create({
    data: {
      id: newId('po'),
      partnerId,
      accountId: account.id,
      amount: input.amount,
      currency: account.currency,
      status: input.amount > REVIEW_THRESHOLD ? 'REVIEW' : 'PENDING',
      reference: input.reference,
      method: methodFor(account.country, Number(input.amount)),
      createdBy,
    },
  });
  await recordPayoutEvent(tx, 'payout.created', payout);
  return payout;
}

export async function cancelPayout(tx: Tx, partnerId: string, id: string): Promise<Payout> {
  const existing = await tx.payout.findFirst({ where: { id, partnerId } });
  if (!existing) throw notFound('Payout', id);
  // Conditional update: loses cleanly if settlement got there first.
  const { count } = await tx.payout.updateMany({
    where: { id, partnerId, status: { in: CANCELLABLE } },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });
  if (count !== 1) {
    throw apiError('PAYOUT_NOT_CANCELLABLE', `Payout ${id} is ${existing.status} and can no longer be cancelled`, 409, {
      status: existing.status,
    });
  }
  const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
  await recordPayoutEvent(tx, 'payout.cancelled', payout);
  return payout;
}

/**
 * Simulated settlement: marks PENDING payouts older than `olderThanMs` as PAID,
 * books the double entry, and queues a payout.paid webhook. Returns how many settled.
 */
export async function settleDuePayouts(db: Db, { olderThanMs, limit = 50 }: { olderThanMs: number; limit?: number }) {
  const due = await db.payout.findMany({
    where: { status: 'PENDING', createdAt: { lte: new Date(Date.now() - olderThanMs) } },
    orderBy: { createdAt: 'asc' },
    take: limit,
    select: { id: true },
  });
  let settled = 0;
  for (const { id } of due) {
    const ok = await db.$transaction(async (tx) => {
      const paidAt = new Date();
      const { count } = await tx.payout.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PAID', paidAt } });
      if (count !== 1) return false;
      const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
      const description = `Payout ${payout.id} · ${payout.reference}`;
      await tx.ledgerEntry.createMany({
        data: [
          { id: `ent_${id}_dr`, accountId: treasuryAccountId(payout.partnerId), payoutId: id, direction: 'DEBIT', amount: payout.amount, currency: payout.currency, description, occurredAt: paidAt },
          { id: `ent_${id}_cr`, accountId: payout.accountId, payoutId: id, direction: 'CREDIT', amount: payout.amount, currency: payout.currency, description, occurredAt: paidAt },
        ],
      });
      await recordPayoutEvent(tx, 'payout.paid', payout);
      return true;
    });
    if (ok) settled++;
  }
  return settled;
}

/** The review desk's decision on a REVIEW payout (admin only). */
export async function reviewPayout(db: Db, id: string, decision: 'approve' | 'reject'): Promise<Payout> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.payout.updateMany({
      where: { id, status: 'REVIEW' },
      data: decision === 'approve' ? { status: 'PENDING' } : { status: 'REJECTED' },
    });
    if (count !== 1) throw apiError('PAYOUT_NOT_IN_REVIEW', `Payout ${id} is not awaiting review`, 409);
    const payout = await tx.payout.findUniqueOrThrow({ where: { id } });
    if (decision === 'reject') await recordPayoutEvent(tx, 'payout.rejected', payout);
    return payout;
  });
}
