import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beneficiaryAccountId } from '../../src/seed-data';
import { type Harness, startHarness } from './harness';

const CREATE = /* GraphQL */ `
  mutation ($input: CreatePayoutInput!) {
    createPayout(input: $input) { id status amount reference createdAt }
  }
`;
const ACCOUNT = beneficiaryAccountId('Lumen Studio');

describe('Idempotency-Key replay against real Postgres', () => {
  let h: Harness;
  let token: string;

  beforeAll(async () => {
    h = await startHarness();
    token = await h.token();
  });
  afterAll(() => h?.close());

  const create = (key: string, input: Record<string, unknown>) =>
    h.gql(token, CREATE, { input: { accountId: ACCOUNT, ...input } }, { 'Idempotency-Key': key });
  const payoutsWithReference = (reference: string) => h.db.payout.count({ where: { reference } });

  it('replays the original response for a retry with the same key and body', async () => {
    const key = randomUUID();
    const first = await create(key, { amount: 4_200, reference: 'REPLAY-1' });
    expect(first.body.errors).toBeUndefined();
    expect(first.headers['idempotent-replayed']).toBeUndefined();

    const retry = await create(key, { reference: 'REPLAY-1', amount: 4_200 }); // same body, different key order
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(retry.body.data.createPayout).toEqual(first.body.data.createPayout);
    expect(await payoutsWithReference('REPLAY-1')).toBe(1);
  });

  it('replays the original snapshot even after the payout has moved on', async () => {
    const key = randomUUID();
    const first = await create(key, { amount: 4_300, reference: 'REPLAY-2' });
    await h.db.payout.update({ where: { id: first.body.data.createPayout.id }, data: { status: 'PAID', paidAt: new Date() } });
    const retry = await create(key, { amount: 4_300, reference: 'REPLAY-2' });
    expect(retry.body.data.createPayout.status).toBe('PENDING');
  });

  it('rejects the same key with a different body (409)', async () => {
    const key = randomUUID();
    await create(key, { amount: 4_400, reference: 'REPLAY-3' });
    const reused = await create(key, { amount: 9_999, reference: 'REPLAY-3' });
    expect(reused.status).toBe(409);
    expect(reused.body.errors[0].extensions.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await payoutsWithReference('REPLAY-3')).toBe(1);
  });

  it('creates exactly one payout when the same request races itself', async () => {
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => create(key, { amount: 4_500, reference: 'RACE-1' })));
    const ids = new Set(results.map((r) => r.body.data?.createPayout?.id));
    expect(results.every((r) => r.body.errors === undefined)).toBe(true);
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.headers['idempotent-replayed'] === 'true')).toHaveLength(5);
    expect(await payoutsWithReference('RACE-1')).toBe(1);
    expect(await h.db.webhookDelivery.count({ where: { payoutId: [...ids][0], event: 'payout.created' } })).toBe(1);
  });

  it('keys are per partner: two partners can use the same key independently', async () => {
    const key = randomUUID();
    await create(key, { amount: 4_600, reference: 'SHARED-KEY' });
    const otherToken = await h.token(await h.otherPartner());
    const other = await h.gql(otherToken, CREATE, { input: { accountId: ACCOUNT, amount: 4_600, reference: 'SHARED-KEY' } }, { 'Idempotency-Key': key });
    // The other partner doesn't own the account, so it gets NOT_FOUND, not a replay of partner A's payout.
    expect(other.headers['idempotent-replayed']).toBeUndefined();
    expect(other.body.errors[0].extensions.code).toBe('NOT_FOUND');
  });

  it('a failed request does not burn the key', async () => {
    const key = randomUUID();
    const failed = await create(key, { amount: 9_000_000_000, reference: 'RETRY-AFTER-FAIL' });
    expect(failed.body.errors[0].extensions.code).toBe('INSUFFICIENT_FUNDS');
    expect(await h.db.idempotencyKey.count({ where: { key } })).toBe(0);

    const fixed = await create(key, { amount: 4_700, reference: 'RETRY-AFTER-FAIL' });
    expect(fixed.body.data.createPayout.amount).toBe(4_700);
  });

  it('cancelPayout replays too', async () => {
    const created = await create(randomUUID(), { amount: 4_800, reference: 'CANCEL-REPLAY' });
    const id = created.body.data.createPayout.id;
    const key = randomUUID();
    const cancel = () => h.gql(token, 'mutation ($id: ID!) { cancelPayout(id: $id) { id status } }', { id }, { 'Idempotency-Key': key });
    const first = await cancel();
    const retry = await cancel();
    expect(first.body.data.cancelPayout.status).toBe('CANCELLED');
    expect(retry.body.data).toEqual(first.body.data);
    expect(retry.headers['idempotent-replayed']).toBe('true');
    expect(await h.db.webhookDelivery.count({ where: { payoutId: id, event: 'payout.cancelled' } })).toBe(1);
  });
});
