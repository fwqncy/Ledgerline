import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settleDuePayouts } from '../../src/services/payouts';
import { dispatchDueWebhooks, MAX_ATTEMPTS, verifyWebhookSignature } from '../../src/services/webhooks';
import { beneficiaryAccountId, DEMO_PARTNER } from '../../src/seed-data';
import { type Harness, startHarness } from './harness';

interface Received {
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe('webhook delivery against real Postgres', () => {
  let h: Harness;
  let server: Server;
  let url: string;
  const received: Received[] = [];
  let respondWith = 200;

  beforeAll(async () => {
    h = await startHarness();
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received.push({ headers: req.headers, body });
        res.writeHead(respondWith).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hooks`;
    // Settle the seeded PENDING payouts now, and drop what that queued, so each test sees only its own deliveries.
    await settleDuePayouts(h.db, { olderThanMs: 0 });
    await h.db.webhookDelivery.deleteMany();
  });
  afterAll(async () => {
    server?.close();
    await h?.close();
  });

  const admin = () => `Bearer ${h.config.PARTNER_ADMIN_TOKEN}`;

  it('records deliveries without sending while the partner has no webhook URL', async () => {
    const token = await h.token();
    await h.gql(
      token,
      'mutation ($input: CreatePayoutInput!) { createPayout(input: $input) { id } }',
      { input: { accountId: beneficiaryAccountId('Northwind Ltd'), amount: 1_000, reference: 'HOOK-1' } },
      { 'Idempotency-Key': 'hook-1' },
    );
    expect(await dispatchDueWebhooks(h.db)).toBe(0);
    expect(await h.db.webhookDelivery.count({ where: { status: 'PENDING' } })).toBe(1);
  });

  it('delivers signed payloads once a URL is set', async () => {
    await request(h.api.app).patch(`/admin/partners/${DEMO_PARTNER.id}`).set('Authorization', admin()).send({ webhookUrl: url }).expect(200);
    await settleDuePayouts(h.db, { olderThanMs: 0 });

    expect(await dispatchDueWebhooks(h.db)).toBe(2);
    const events = received.map((r) => JSON.parse(r.body).type);
    expect(events.sort()).toEqual(['payout.created', 'payout.paid']);

    for (const r of received) {
      expect(r.headers['ledgerline-event']).toBe(JSON.parse(r.body).type);
      expect(verifyWebhookSignature('whsec_demo_local_only', r.body, String(r.headers['ledgerline-signature']))).toBe(true);
    }
    const delivered = await h.db.webhookDelivery.findMany();
    expect(delivered.every((d) => d.status === 'DELIVERED' && d.attempts === 1 && d.responseStatus === 200)).toBe(true);
  });

  it('retries failures with backoff and gives up after the max attempts', async () => {
    respondWith = 500;
    const payout = await h.db.payout.findFirstOrThrow({ where: { partnerId: DEMO_PARTNER.id } });
    const delivery = await h.db.webhookDelivery.create({
      data: { id: 'whd_retry', partnerId: DEMO_PARTNER.id, payoutId: payout.id, event: 'payout.paid', payload: { hello: 'world' } },
    });

    await dispatchDueWebhooks(h.db);
    let row = await h.db.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, responseStatus: 500, lastError: 'HTTP 500' });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Not due yet: nothing is sent.
    expect(await dispatchDueWebhooks(h.db)).toBe(0);

    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await h.db.webhookDelivery.update({ where: { id: delivery.id }, data: { nextAttemptAt: new Date() } });
      await dispatchDueWebhooks(h.db);
    }
    row = await h.db.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
  });

  it('shows the delivery log to the partner through GraphQL', async () => {
    const token = await h.token();
    const res = await h.gql(token, '{ webhookDeliveries(status: FAILED, first: 10) { totalCount edges { node { id attempts lastError } } } }');
    expect(res.body.data.webhookDeliveries).toEqual({
      totalCount: 1,
      edges: [{ node: { id: 'whd_retry', attempts: MAX_ATTEMPTS, lastError: 'HTTP 500' } }],
    });
  });
});
