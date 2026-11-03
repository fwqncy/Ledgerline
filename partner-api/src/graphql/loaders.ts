import DataLoader from 'dataloader';
import type { Db } from '../db';
import type { Account } from '../generated/prisma/client';
import { type Balance, balancesFor } from '../services/ledger';

/** Per-request batching, so `payouts { edges { node { account { balance } } } }` stays at a handful of queries. */
export function createLoaders(db: Db, partnerId: string | null) {
  const account = new DataLoader<string, Account | null>(async (ids) => {
    if (!partnerId) return ids.map(() => null);
    const rows = await db.account.findMany({ where: { id: { in: [...ids] }, partnerId } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id) ?? null);
  });

  const balance = new DataLoader<string, Balance | null>(async (ids) => {
    if (!partnerId) return ids.map(() => null);
    const accounts = (await account.loadMany(ids)).filter((a): a is Account => !!a && !(a instanceof Error));
    const balances = await balancesFor(db, partnerId, accounts);
    return ids.map((id) => balances.get(id) ?? null);
  });

  return { account, balance };
}

export type Loaders = ReturnType<typeof createLoaders>;
