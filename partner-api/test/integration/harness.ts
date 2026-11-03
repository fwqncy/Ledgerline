import request from 'supertest';
import { DEMO_API_KEY, seedDatabase } from '../../prisma/seed';
import { createApiKey } from '../../src/auth/keys';
import { createPartnerApi, type PartnerApi } from '../../src/app';
import { type Config, testConfig } from '../../src/config';
import type { ScopeName } from '../../src/seed-data';
import { startDatabase, type TestDatabase } from './postgres';

export interface Harness extends TestDatabase {
  api: PartnerApi;
  config: Config;
  /** Exchange an API key for an access token, optionally narrowed. */
  token(apiKey?: string, scope?: string): Promise<string>;
  /** POST a GraphQL operation. */
  gql(token: string, query: string, variables?: Record<string, unknown>, headers?: Record<string, string>): request.Test;
  /** Make another partner with its own key, for isolation tests. */
  otherPartner(scopes?: ScopeName[]): Promise<string>;
  close(): Promise<void>;
}

export async function startHarness(overrides: Partial<Config> = {}): Promise<Harness> {
  const db = await startDatabase();
  const config = testConfig({ RATE_LIMIT_PER_MINUTE: 10_000, ...overrides });
  await seedDatabase(db.db, { demoKeyPepper: config.API_KEY_PEPPER });
  const api = await createPartnerApi(db.db, config);

  return {
    ...db,
    api,
    config,
    async token(apiKey = DEMO_API_KEY, scope) {
      const res = await request(api.app).post('/auth/token').set('Authorization', `Bearer ${apiKey}`).send(scope ? { scope } : {});
      if (res.status !== 200) throw new Error(`token: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.access_token;
    },
    gql(token, query, variables = {}, headers = {}) {
      return request(api.app).post('/graphql').set('Authorization', `Bearer ${token}`).set(headers).send({ query, variables });
    },
    async otherPartner(scopes = ['ledger:read', 'payouts:write']) {
      const id = `prt_other_${Math.random().toString(36).slice(2, 8)}`;
      await db.db.partner.create({ data: { id, name: 'Other Partner', webhookSecret: 'whsec_other' } });
      const { key } = await createApiKey(db.db, config.API_KEY_PEPPER, { partnerId: id, name: 'other', scopes });
      return key;
    },
    async close() {
      await api.apollo.stop();
      await db.stop();
    },
  };
}
