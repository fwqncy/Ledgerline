import 'dotenv/config';
import { ALL_SCOPES, createApiKey, parseApiKey } from '../src/auth/keys';
import { loadConfig } from '../src/config';
import { createDb, type Db } from '../src/db';
import { buildLedgerSeed, DEMO_PARTNER, SCOPES } from '../src/seed-data';

/** Well-known local key so the README's curl examples work. Never seeded in production. */
export const DEMO_API_KEY = 'llk_test_demo0001_LocalDevOnlyDoNotUseInProd000000';

const CHUNK = 1000;

async function inChunks<T>(rows: T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK));
}

/** Seeds scopes and the demo partner's ledger. Safe to re-run; SEED_RESET=1 rebuilds the ledger. */
export async function seedDatabase(db: Db, { reset = false, demoKeyPepper }: { reset?: boolean; demoKeyPepper?: string } = {}) {
  for (const scope of SCOPES) {
    await db.scope.upsert({ where: { name: scope.name }, create: scope, update: { description: scope.description } });
  }

  const existing = await db.partner.findUnique({ where: { id: DEMO_PARTNER.id } });
  if (existing && !reset) {
    await seedDemoKey(db, demoKeyPepper);
    return { seeded: false };
  }

  const { accounts, payouts, entries } = buildLedgerSeed(DEMO_PARTNER.id);
  await db.$transaction(async (tx) => {
    if (existing) {
      // Keep the partner (and its API keys); rebuild only the ledger.
      await tx.webhookDelivery.deleteMany({ where: { partnerId: DEMO_PARTNER.id } });
      await tx.ledgerEntry.deleteMany({ where: { account: { partnerId: DEMO_PARTNER.id } } });
      await tx.payout.deleteMany({ where: { partnerId: DEMO_PARTNER.id } });
      await tx.account.deleteMany({ where: { partnerId: DEMO_PARTNER.id } });
    } else {
      await tx.partner.create({ data: { ...DEMO_PARTNER, webhookSecret: 'whsec_demo_local_only' } });
    }
    await tx.account.createMany({ data: accounts });
    await inChunks(payouts, (data) => tx.payout.createMany({ data }));
    await inChunks(entries, (data) => tx.ledgerEntry.createMany({ data }));
  }, { timeout: 60_000 });
  await seedDemoKey(db, demoKeyPepper);

  return { seeded: true, accounts: accounts.length, payouts: payouts.length, entries: entries.length };
}

async function seedDemoKey(db: Db, pepper: string | undefined) {
  if (!pepper) return;
  const prefix = parseApiKey(DEMO_API_KEY)!.prefix;
  if (await db.apiKey.findUnique({ where: { prefix } })) return;
  await createApiKey(db, pepper, { partnerId: DEMO_PARTNER.id, name: 'Demo key (local only)', scopes: ALL_SCOPES, key: DEMO_API_KEY });
  console.log(`Demo API key: ${DEMO_API_KEY}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);
  const demoKeyPepper = config.NODE_ENV === 'production' ? undefined : config.API_KEY_PEPPER;
  seedDatabase(db, { reset: process.env.SEED_RESET === '1', demoKeyPepper })
    .then((result) => console.log('Seed:', result))
    .finally(() => db.$disconnect());
}
