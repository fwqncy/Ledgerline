import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_API_KEY, seedDatabase } from '../../prisma/seed';
import { createPartnerApi, type PartnerApi } from '../../src/app';
import { testConfig } from '../../src/config';
import { startDatabase, type TestDatabase } from './postgres';

describe('auth against real Postgres', () => {
  const config = testConfig();
  let t: TestDatabase;
  let api: PartnerApi;

  beforeAll(async () => {
    t = await startDatabase();
    await seedDatabase(t.db, { demoKeyPepper: config.API_KEY_PEPPER });
    api = await createPartnerApi(t.db, config);
  });
  afterAll(async () => {
    await api?.apollo.stop();
    await t?.stop();
  });

  const token = async (apiKey: string, scope?: string) =>
    request(api.app).post('/auth/token').set('Authorization', `Bearer ${apiKey}`).send(scope ? { scope } : {});

  it('never stores the plaintext key', async () => {
    const rows = await t.db.apiKey.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(DEMO_API_KEY);
  });

  it('signs in with the seeded demo key and reads the viewer', async () => {
    const res = await token(DEMO_API_KEY);
    expect(res.status).toBe(200);
    const viewer = await request(api.app)
      .post('/graphql')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .send({ query: '{ viewer { partnerId partnerName scopes } }' });
    expect(viewer.body.data.viewer).toEqual({
      partnerId: 'prt_demo',
      partnerName: 'Demo Marketplace',
      scopes: ['ledger:read', 'payouts:write'],
    });
    const key = await t.db.apiKey.findFirstOrThrow();
    expect(key.lastUsedAt).toBeInstanceOf(Date);
  });

  it('issues, uses and revokes a portal-created key end to end', async () => {
    const admin = `Bearer ${config.PARTNER_ADMIN_TOKEN}`;
    const created = await request(api.app)
      .post('/admin/partners/prt_demo/keys')
      .set('Authorization', admin)
      .send({ name: 'Read-only reporting', scopes: ['ledger:read'] });
    expect(created.status).toBe(201);
    const { key, id } = created.body.key;

    expect((await token(key, 'payouts:write')).status).toBe(403);
    const access = (await token(key)).body.access_token;
    const ask = () =>
      request(api.app).post('/graphql').set('Authorization', `Bearer ${access}`).send({ query: '{ viewer { scopes } }' });
    expect((await ask()).body.data.viewer.scopes).toEqual(['ledger:read']);

    await request(api.app).delete(`/admin/partners/prt_demo/keys/${id}`).set('Authorization', admin).expect(200);
    expect((await ask()).status).toBe(401);
    expect((await token(key)).status).toBe(401);
  });
});
