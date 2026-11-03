import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedDatabase } from '../../prisma/seed';
import { DEMO_PARTNER, treasuryAccountId } from '../../src/seed-data';
import { startDatabase, type TestDatabase } from './postgres';

describe('migrations + seed against real Postgres', () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await startDatabase();
  });
  afterAll(() => t?.stop());

  it('seeds scopes and the demo partner ledger', async () => {
    const result = await seedDatabase(t.db);
    expect(result.seeded).toBe(true);
    expect(await t.db.scope.count()).toBe(2);
    expect(await t.db.payout.count({ where: { partnerId: DEMO_PARTNER.id } })).toBe(result.payouts);
  });

  it('is a no-op the second time', async () => {
    expect(await seedDatabase(t.db)).toEqual({ seeded: false });
  });

  it('stores amounts as BIGINT, so balances past 2^31 pence (£21.4m) stay exact', async () => {
    const accountId = treasuryAccountId(DEMO_PARTNER.id);
    const where = { accountId, direction: 'CREDIT' } as const;
    const before = (await t.db.ledgerEntry.aggregate({ where, _sum: { amount: true } }))._sum.amount!;
    const big = 2n ** 31n + 12_345n;
    await t.db.ledgerEntry.create({
      data: { id: 'ent_big', accountId, direction: 'CREDIT', amount: big, description: 'Large top-up', occurredAt: new Date() },
    });
    const after = (await t.db.ledgerEntry.aggregate({ where, _sum: { amount: true } }))._sum.amount!;
    expect(typeof after).toBe('bigint');
    expect(after - before).toBe(big);
  });
});
