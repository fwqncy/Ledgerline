import type { Db } from '../../src/db';

interface KeyRow {
  id: string;
  partnerId: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  scopes: { apiKeyId: string; scope: string }[];
}

interface PartnerRow {
  id: string;
  name: string;
  webhookUrl: string | null;
  createdAt: Date;
}

type Where = Record<string, unknown>;
const matches = (row: object, where: Where = {}) =>
  Object.entries(where).every(([k, v]) => (row as Record<string, unknown>)[k] === v);

/**
 * Just enough of the Prisma client for the auth code paths, kept in memory.
 * Resolver tests use their own focused fakes.
 */
export function fakeDb(seed: { partners?: PartnerRow[] } = {}) {
  const partners: PartnerRow[] = seed.partners ?? [{ id: 'prt_a', name: 'Partner A', webhookUrl: null, createdAt: new Date() }];
  const keys: KeyRow[] = [];
  const pick = (row: KeyRow, args: { include?: unknown; select?: Record<string, boolean> }) => {
    const copy = structuredClone(row);
    if (args.select) return Object.fromEntries(Object.keys(args.select).map((k) => [k, (copy as never)[k]]));
    return args.include ? copy : { ...copy, scopes: undefined };
  };

  const db = {
    partner: {
      findUnique: async ({ where }: { where: Where }) => partners.find((p) => matches(p, where)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Where }) => {
        const p = partners.find((row) => matches(row, where));
        if (!p) throw new Error('not found');
        return p;
      },
      findMany: async () => partners,
    },
    apiKey: {
      create: async ({ data }: { data: Omit<KeyRow, 'createdAt' | 'lastUsedAt' | 'revokedAt' | 'scopes'> & { scopes: { create: { scope: string }[] } } }) => {
        if (keys.some((k) => k.prefix === data.prefix)) throw new Error('Unique constraint failed on prefix');
        const row: KeyRow = {
          ...data,
          createdAt: new Date(),
          lastUsedAt: null,
          revokedAt: null,
          scopes: data.scopes.create.map((s) => ({ apiKeyId: data.id, scope: s.scope })),
        };
        keys.push(row);
        return { ...row, scopes: undefined };
      },
      findUnique: async (args: { where: Where; include?: unknown; select?: Record<string, boolean> }) => {
        const row = keys.find((k) => matches(k, args.where));
        return row ? pick(row, args) : null;
      },
      findFirst: async (args: { where: Where }) => {
        const row = keys.find((k) => matches(k, args.where));
        return row ? pick(row, {}) : null;
      },
      findMany: async (args: { where: Where }) => keys.filter((k) => matches(k, args.where)).map((k) => pick(k, { include: true })),
      update: async (args: { where: { id: string }; data: Partial<KeyRow>; include?: unknown }) => {
        const row = keys.find((k) => k.id === args.where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, args.data);
        return pick(row, args);
      },
    },
  };
  return { db: db as unknown as Db, keys, partners };
}
