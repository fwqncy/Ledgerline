import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiKey } from '../../src/auth/keys';
import { signAccessToken } from '../../src/auth/tokens';
import { createPartnerApi, type PartnerApi } from '../../src/app';
import { type Config, testConfig } from '../../src/config';
import { fakeDb } from './fake-db';

let api: PartnerApi | undefined;
afterEach(async () => {
  await api?.apollo.stop();
  api = undefined;
});

async function setup(overrides: Partial<Config> = {}) {
  const config = testConfig(overrides);
  const fake = fakeDb();
  api = await createPartnerApi(fake.db, config);
  const issue = (scopes: ('ledger:read' | 'payouts:write')[]) =>
    createApiKey(fake.db, config.API_KEY_PEPPER, { partnerId: 'prt_a', name: 'test', scopes });
  const tokenFor = async (scopes: ('ledger:read' | 'payouts:write')[]) => {
    const res = await request(api!.app).post('/auth/token').set('Authorization', `Bearer ${(await issue(scopes)).key}`);
    return res.body.access_token as string;
  };
  return { app: api.app, config, fake, issue, tokenFor };
}

const viewer = { query: '{ viewer { partnerId partnerName scopes tokenExpiresAt } }' };

describe('POST /auth/token', () => {
  it('exchanges an API key for a short-lived bearer token', async () => {
    const { app, issue } = await setup();
    const { key } = await issue(['ledger:read', 'payouts:write']);
    const res = await request(app).post('/auth/token').set('Authorization', `Bearer ${key}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'ledger:read payouts:write' });
    expect(res.body.access_token.split('.')).toHaveLength(3);
  });

  it('can issue a token with fewer scopes than the key', async () => {
    const { app, issue } = await setup();
    const { key } = await issue(['ledger:read', 'payouts:write']);
    const res = await request(app).post('/auth/token').set('Authorization', `Bearer ${key}`).send({ scope: 'ledger:read' });
    expect(res.body.scope).toBe('ledger:read');
  });

  it('will not issue scopes the key does not have', async () => {
    const { app, issue } = await setup();
    const { key } = await issue(['ledger:read']);
    const res = await request(app).post('/auth/token').set('Authorization', `Bearer ${key}`).send({ scope: 'payouts:write' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_SCOPE');
  });

  it('rejects unknown scopes, missing keys and wrong keys', async () => {
    const { app, issue } = await setup();
    const { key, prefix } = await issue(['ledger:read']);
    expect((await request(app).post('/auth/token').set('Authorization', `Bearer ${key}`).send({ scope: 'admin' })).status).toBe(400);
    expect((await request(app).post('/auth/token')).status).toBe(401);
    const wrong = await request(app).post('/auth/token').set('Authorization', `Bearer ${prefix}_${'x'.repeat(32)}`);
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_API_KEY');
  });

  it('rate-limits token requests per IP', async () => {
    const { app } = await setup({ TOKEN_RATE_LIMIT_PER_MINUTE: 3 });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await request(app).post('/auth/token')).status);
    expect(statuses).toEqual([401, 401, 401, 429]);
  });
});

describe('/graphql authentication', () => {
  it('returns 401 without a token', async () => {
    const { app } = await setup();
    const res = await request(app).post('/graphql').send(viewer);
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toMatch(/^Bearer/);
  });

  it('returns 401 for a garbage or foreign token', async () => {
    const { app } = await setup();
    expect((await request(app).post('/graphql').set('Authorization', 'Bearer not.a.jwt').send(viewer)).status).toBe(401);
    const { token } = await signAccessToken(
      { partnerId: 'prt_a', keyId: 'key_x', scopes: ['ledger:read'] },
      { secret: 'some-other-secret-that-is-long-enough!!', ttlSeconds: 900 },
    );
    expect((await request(app).post('/graphql').set('Authorization', `Bearer ${token}`).send(viewer)).status).toBe(401);
  });

  it('answers viewer for a valid token', async () => {
    const { app, tokenFor } = await setup();
    const token = await tokenFor(['ledger:read']);
    const res = await request(app).post('/graphql').set('Authorization', `Bearer ${token}`).send(viewer);
    expect(res.status).toBe(200);
    expect(res.body.data.viewer).toMatchObject({ partnerId: 'prt_a', partnerName: 'Partner A', scopes: ['ledger:read'] });
  });

  it('stops accepting a token as soon as its key is revoked', async () => {
    const { app, tokenFor, fake } = await setup();
    const token = await tokenFor(['ledger:read']);
    fake.keys[0]!.revokedAt = new Date();
    const res = await request(app).post('/graphql').set('Authorization', `Bearer ${token}`).send(viewer);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('KEY_REVOKED');
  });

  it('rate-limits per partner, with standard RateLimit headers', async () => {
    const { app, tokenFor } = await setup({ RATE_LIMIT_PER_MINUTE: 2 });
    const token = await tokenFor(['ledger:read']);
    const send = () => request(app).post('/graphql').set('Authorization', `Bearer ${token}`).send(viewer);
    const first = await send();
    expect(first.headers['ratelimit-policy']).toBeDefined();
    await send();
    const third = await send();
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('admin key routes', () => {
  it('require the admin token', async () => {
    const { app } = await setup();
    expect((await request(app).get('/admin/partners/prt_a/keys')).status).toBe(401);
    expect((await request(app).get('/admin/partners/prt_a/keys').set('Authorization', 'Bearer wrong-token-123')).status).toBe(401);
  });

  it('create a key (shown once), list without secrets, and revoke', async () => {
    const { app, config } = await setup();
    const admin = `Bearer ${config.PARTNER_ADMIN_TOKEN}`;

    const created = await request(app)
      .post('/admin/partners/prt_a/keys')
      .set('Authorization', admin)
      .send({ name: 'Payout bot', scopes: ['payouts:write'] });
    expect(created.status).toBe(201);
    const { key, id } = created.body.key;
    expect(key).toMatch(/^llk_test_/);

    const list = await request(app).get('/admin/partners/prt_a/keys').set('Authorization', admin);
    expect(list.body.keys).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(key);
    expect(list.body.keys[0]).not.toHaveProperty('hash');

    const revoked = await request(app).delete(`/admin/partners/prt_a/keys/${id}`).set('Authorization', admin);
    expect(revoked.body.key.revokedAt).toBeTruthy();
    expect((await request(app).post('/auth/token').set('Authorization', `Bearer ${key}`)).status).toBe(401);
  });

  it('validate scopes on create', async () => {
    const { app, config } = await setup();
    const res = await request(app)
      .post('/admin/partners/prt_a/keys')
      .set('Authorization', `Bearer ${config.PARTNER_ADMIN_TOKEN}`)
      .send({ name: 'x', scopes: ['root'] });
    expect(res.status).toBe(400);
  });
});
