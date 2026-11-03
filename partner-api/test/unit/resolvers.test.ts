import { GraphQLError } from 'graphql';
import { describe, expect, it, vi } from 'vitest';
import type { ScopeName } from '../../src/seed-data';
import { testConfig } from '../../src/config';
import type { Db } from '../../src/db';
import type { Context } from '../../src/graphql/context';
import { createLoaders } from '../../src/graphql/loaders';
import { encodeCursor } from '../../src/graphql/pagination';
import { resolvers } from '../../src/graphql/schema';

/** A db that fails the test if anything touches it. */
const untouchableDb = new Proxy({}, {
  get(_t, prop) {
    throw new Error(`db.${String(prop)} was touched`);
  },
}) as Db;

function ctx(scopes: ScopeName[] | null, db: Db = untouchableDb, extra: Partial<Context> = {}): Context {
  return {
    db,
    config: testConfig(),
    auth: scopes ? { partnerId: 'prt_a', keyId: 'key_1', scopes, expiresAt: new Date() } : null,
    loaders: createLoaders(db, scopes ? 'prt_a' : null),
    idempotencyKey: null,
    setHeader: vi.fn(),
    ...extra,
  };
}

async function errorCode(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof GraphQLError)) throw error;
    return error.extensions.code;
  }
  return 'OK';
}

const query = resolvers.Query as Record<string, (p: unknown, a: unknown, c: Context) => unknown>;
const mutation = resolvers.Mutation as Record<string, (p: unknown, a: unknown, c: Context) => unknown>;

const sampleArgs: Record<string, unknown> = {
  account: { id: 'acc_x' },
  payout: { id: 'po_x' },
  createPayout: { input: { accountId: 'acc_x', amount: 100n, reference: 'r' } },
  cancelPayout: { id: 'po_x' },
};

describe('scope enforcement on every resolver', () => {
  const readFields = Object.keys(query).filter((f) => f !== 'viewer');
  const writeFields = Object.keys(mutation);

  it('covers the whole schema', () => {
    expect(readFields.sort()).toEqual(['account', 'accounts', 'balances', 'ledgerEntries', 'payout', 'payouts', 'webhookDeliveries']);
    expect(writeFields.sort()).toEqual(['cancelPayout', 'createPayout']);
  });

  it.each(readFields)('Query.%s needs ledger:read and checks it before touching the db', async (field) => {
    expect(await errorCode(() => query[field]!(null, sampleArgs[field] ?? {}, ctx(null)))).toBe('UNAUTHENTICATED');
    expect(await errorCode(() => query[field]!(null, sampleArgs[field] ?? {}, ctx(['payouts:write'])))).toBe('FORBIDDEN');
  });

  it.each(writeFields)('Mutation.%s needs payouts:write and checks it before touching the db', async (field) => {
    expect(await errorCode(() => mutation[field]!(null, sampleArgs[field], ctx(null)))).toBe('UNAUTHENTICATED');
    expect(await errorCode(() => mutation[field]!(null, sampleArgs[field], ctx(['ledger:read'])))).toBe('FORBIDDEN');
  });
});

describe('Query resolvers', () => {
  it('accounts only ever asks for the caller’s accounts', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await query.accounts!(null, { kind: 'BENEFICIARY' }, ctx(['ledger:read'], { account: { findMany } } as unknown as Db));
    expect(findMany.mock.calls[0]![0].where).toEqual({ partnerId: 'prt_a', kind: 'BENEFICIARY' });
  });

  it('payout(id) is scoped to the caller, so another partner’s id finds nothing', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const result = await query.payout!(null, { id: 'po_other' }, ctx(['ledger:read'], { payout: { findFirst } } as unknown as Db));
    expect(result).toBeNull();
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'po_other', partnerId: 'prt_a' } });
  });

  describe('ledgerEntries', () => {
    const entry = (n: number) => ({ id: `ent_${n}`, accountId: 'acc_t', occurredAt: new Date(Date.UTC(2026, 0, 31 - n)) });
    const setup = (rows: ReturnType<typeof entry>[], total = rows.length) => {
      const findMany = vi.fn().mockResolvedValue(rows);
      const count = vi.fn().mockResolvedValue(total);
      return { findMany, count, c: ctx(['ledger:read'], { ledgerEntry: { findMany, count } } as unknown as Db) };
    };

    it('fetches one extra row to know if there is a next page', async () => {
      const { findMany, c } = setup([entry(1), entry(2), entry(3)], 10);
      const page = (await query.ledgerEntries!(null, { first: 2 }, c)) as {
        edges: { node: { id: string } }[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
        totalCount: number;
      };
      expect(findMany.mock.calls[0]![0].take).toBe(3);
      expect(page.edges.map((e) => e.node.id)).toEqual(['ent_1', 'ent_2']);
      expect(page.pageInfo).toEqual({ hasNextPage: true, endCursor: encodeCursor({ at: entry(2).occurredAt, id: 'ent_2' }) });
      expect(page.totalCount).toBe(10);
    });

    it('filters by partner, account, date range and cursor', async () => {
      const { findMany, count, c } = setup([]);
      const from = new Date('2026-01-01T00:00:00Z');
      const to = new Date('2026-02-01T00:00:00Z');
      const after = encodeCursor({ at: new Date('2026-01-20T00:00:00Z'), id: 'ent_9' });
      await query.ledgerEntries!(null, { accountId: 'acc_t', from, to, after, first: 10 }, c);

      const { where, orderBy } = findMany.mock.calls[0]![0];
      expect(where.AND[0]).toEqual({ account: { partnerId: 'prt_a' }, accountId: 'acc_t' });
      expect(where.AND[1].AND).toEqual([
        { occurredAt: { gte: from } },
        { occurredAt: { lt: to } },
        { OR: [{ occurredAt: { lt: new Date('2026-01-20T00:00:00Z') } }, { occurredAt: new Date('2026-01-20T00:00:00Z'), id: { lt: 'ent_9' } }] },
      ]);
      expect(orderBy).toEqual([{ occurredAt: 'desc' }, { id: 'desc' }]);
      // totalCount keeps the date range but ignores the cursor.
      expect(count.mock.calls[0]![0].where.AND[1].AND).toHaveLength(2);
    });

    it.each([
      [{ first: 0 }],
      [{ first: 201 }],
      [{ after: 'not-a-cursor' }],
      [{ from: new Date('2026-02-01'), to: new Date('2026-01-01') }],
    ])('rejects bad paging input %j with BAD_USER_INPUT', async (args) => {
      const { c } = setup([]);
      expect(await errorCode(() => query.ledgerEntries!(null, args, c))).toBe('BAD_USER_INPUT');
    });
  });
});

describe('Mutation resolvers', () => {
  const write = (extra: Partial<Context> = {}) => ctx(['payouts:write'], untouchableDb, extra);

  it('createPayout needs an Idempotency-Key header', async () => {
    const input = { accountId: 'acc_x', amount: 100n, reference: 'INV-1' };
    expect(await errorCode(() => mutation.createPayout!(null, { input }, write()))).toBe('BAD_USER_INPUT');
  });

  it.each([
    ['a zero amount', { amount: 0n, reference: 'INV-1' }],
    ['a negative amount', { amount: -5n, reference: 'INV-1' }],
    ['a blank reference', { amount: 100n, reference: '   ' }],
    ['a 141-character reference', { amount: 100n, reference: 'x'.repeat(141) }],
  ])('createPayout rejects %s before touching the db', async (_label, fields) => {
    const input = { accountId: 'acc_x', ...fields };
    expect(await errorCode(() => mutation.createPayout!(null, { input }, write({ idempotencyKey: 'k1' })))).toBe('BAD_USER_INPUT');
  });

  it('cancelPayout needs an Idempotency-Key header', async () => {
    expect(await errorCode(() => mutation.cancelPayout!(null, { id: 'po_1' }, write()))).toBe('BAD_USER_INPUT');
  });
});
