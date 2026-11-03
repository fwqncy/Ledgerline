import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db';
import type { Payout } from '../generated/prisma/client';
import { newId } from '../ids';
import type { Tx } from './idempotency';

export type PayoutEvent = 'payout.created' | 'payout.paid' | 'payout.cancelled' | 'payout.rejected';

export const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 30_000;
const LEASE_MS = 60_000;

/** The public JSON shape of a payout, used in webhook payloads. */
export function payoutJson(p: Payout) {
  return {
    id: p.id,
    accountId: p.accountId,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    reference: p.reference,
    method: p.method,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
    cancelledAt: p.cancelledAt?.toISOString() ?? null,
  };
}

/** Queues a webhook in the same transaction as the status change it describes. */
export async function recordPayoutEvent(tx: Tx, event: PayoutEvent, payout: Payout) {
  const id = newId('whd');
  return tx.webhookDelivery.create({
    data: {
      id,
      partnerId: payout.partnerId,
      payoutId: payout.id,
      event,
      payload: { id, type: event, createdAt: new Date().toISOString(), data: { payout: payoutJson(payout) } },
    },
  });
}

/** `Ledgerline-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "t.body">`. */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

/** What a partner's receiver should do. Exported for the docs and tests. */
export function verifyWebhookSignature(secret: string, body: string, header: string, toleranceSeconds = 300, now = Date.now()) {
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, t).split('v1=')[1]!, 'hex');
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const backoffMs = (attempts: number) => BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1);

/**
 * Sends due deliveries for partners that have a webhook URL. Each delivery is
 * leased first, so two dispatchers never send the same one at once.
 * Returns how many were attempted.
 */
export async function dispatchDueWebhooks(db: Db, { limit = 25, fetchImpl = fetch } = {}): Promise<number> {
  const now = new Date();
  const due = await db.webhookDelivery.findMany({
    where: { status: 'PENDING', nextAttemptAt: { lte: now }, partner: { webhookUrl: { not: null } } },
    include: { partner: { select: { webhookUrl: true, webhookSecret: true } } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
  });

  let attempted = 0;
  for (const d of due) {
    const lease = await db.webhookDelivery.updateMany({
      where: { id: d.id, status: 'PENDING', nextAttemptAt: d.nextAttemptAt },
      data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
    });
    if (lease.count !== 1) continue;
    attempted++;

    const body = JSON.stringify(d.payload);
    const attempts = d.attempts + 1;
    let responseStatus: number | null = null;
    let lastError: string | null = null;
    try {
      const res = await fetchImpl(d.partner.webhookUrl!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Ledgerline-Webhooks/1',
          'Ledgerline-Event': d.event,
          'Ledgerline-Delivery': d.id,
          'Ledgerline-Signature': signWebhook(d.partner.webhookSecret, body),
        },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      });
      responseStatus = res.status;
      if (!res.ok) lastError = `HTTP ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const delivered = lastError === null;
    await db.webhookDelivery.update({
      where: { id: d.id },
      data: delivered
        ? { status: 'DELIVERED', attempts, responseStatus, lastError: null, deliveredAt: new Date() }
        : {
            status: attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
            attempts,
            responseStatus,
            lastError: lastError!.slice(0, 500),
            nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
          },
    });
  }
  return attempted;
}
