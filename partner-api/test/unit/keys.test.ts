import { describe, expect, it } from 'vitest';
import { authenticateApiKey, createApiKey, generateApiKey, hashApiKey, parseApiKey } from '../../src/auth/keys';
import { fakeDb } from './fake-db';

const PEPPER = 'unit-test-pepper-0123456789';

describe('API key format', () => {
  it('generates keys that parse back to their prefix', () => {
    const { key, prefix } = generateApiKey();
    expect(key).toMatch(/^llk_test_[a-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(parseApiKey(key)).toEqual({ prefix });
  });

  it('generates a different key every time', () => {
    const keys = new Set(Array.from({ length: 200 }, () => generateApiKey().key));
    expect(keys.size).toBe(200);
  });

  it('rejects malformed keys', () => {
    for (const bad of ['', 'llk_test_abc', 'sk_live_whatever', `llk_prod_abcd1234_${'a'.repeat(32)}`, `llk_test_abcd1234_${'a'.repeat(31)}!`]) {
      expect(parseApiKey(bad)).toBeNull();
    }
  });

  it('hashes with the pepper, so a leaked table alone cannot be checked offline', () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key, PEPPER)).toBe(hashApiKey(key, PEPPER));
    expect(hashApiKey(key, PEPPER)).not.toBe(hashApiKey(key, `${PEPPER}x`));
    expect(hashApiKey(key, PEPPER)).not.toContain(key);
  });
});

describe('createApiKey + authenticateApiKey', () => {
  it('stores only the hash and authenticates the real key', async () => {
    const { db, keys } = fakeDb();
    const issued = await createApiKey(db, PEPPER, { partnerId: 'prt_a', name: 'CI', scopes: ['ledger:read'] });

    expect(keys[0]!.hash).toBe(hashApiKey(issued.key, PEPPER));
    expect(JSON.stringify(keys)).not.toContain(issued.key);

    const principal = await authenticateApiKey(db, PEPPER, issued.key);
    expect(principal).toEqual({ keyId: issued.id, partnerId: 'prt_a', scopes: ['ledger:read'] });
    expect(keys[0]!.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rejects a key with the right prefix but the wrong secret', async () => {
    const { db } = fakeDb();
    const issued = await createApiKey(db, PEPPER, { partnerId: 'prt_a', name: 'CI', scopes: ['ledger:read'] });
    const forged = `${issued.prefix}_${'A'.repeat(32)}`;
    expect(await authenticateApiKey(db, PEPPER, forged)).toBeNull();
  });

  it('rejects revoked keys', async () => {
    const { db, keys } = fakeDb();
    const issued = await createApiKey(db, PEPPER, { partnerId: 'prt_a', name: 'CI', scopes: ['ledger:read'] });
    keys[0]!.revokedAt = new Date();
    expect(await authenticateApiKey(db, PEPPER, issued.key)).toBeNull();
  });

  it('rejects a key checked with a different pepper', async () => {
    const { db } = fakeDb();
    const issued = await createApiKey(db, PEPPER, { partnerId: 'prt_a', name: 'CI', scopes: ['ledger:read'] });
    expect(await authenticateApiKey(db, 'another-pepper-0123456789', issued.key)).toBeNull();
  });

  it('refuses to create a key with no scopes', async () => {
    const { db } = fakeDb();
    await expect(createApiKey(db, PEPPER, { partnerId: 'prt_a', name: 'CI', scopes: [] })).rejects.toThrow(/scope/);
  });
});
