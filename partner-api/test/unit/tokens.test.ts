import { SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { signAccessToken, verifyAccessToken } from '../../src/auth/tokens';

const SECRET = 'unit-test-jwt-secret-that-is-long-enough';
const input = { partnerId: 'prt_a', keyId: 'key_1', scopes: ['ledger:read', 'payouts:write'] as const };

describe('access tokens', () => {
  it('round-trips partner, key and scopes', async () => {
    const { token, expiresAt } = await signAccessToken({ ...input, scopes: [...input.scopes] }, { secret: SECRET, ttlSeconds: 900 });
    const claims = await verifyAccessToken(token, SECRET);
    expect(claims).toEqual({ partnerId: 'prt_a', keyId: 'key_1', scopes: ['ledger:read', 'payouts:write'], expiresAt });
  });

  it('expires after the TTL', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const { token } = await signAccessToken({ ...input, scopes: ['ledger:read'] }, { secret: SECRET, ttlSeconds: 900, now });
    await expect(verifyAccessToken(token, SECRET, new Date('2026-01-01T00:14:59Z'))).resolves.toBeTruthy();
    await expect(verifyAccessToken(token, SECRET, new Date('2026-01-01T00:15:01Z'))).rejects.toThrow();
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await signAccessToken({ ...input, scopes: ['ledger:read'] }, { secret: `${SECRET}-other`, ttlSeconds: 900 });
    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects a token whose scopes were edited', async () => {
    const { token } = await signAccessToken({ ...input, scopes: ['ledger:read'] }, { secret: SECRET, ttlSeconds: 900 });
    const [header, payload, signature] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString());
    claims.scope = 'ledger:read payouts:write';
    const tampered = [header, Buffer.from(JSON.stringify(claims)).toString('base64url'), signature].join('.');
    await expect(verifyAccessToken(tampered, SECRET)).rejects.toThrow();
  });

  it('rejects unsigned (alg: none) tokens', async () => {
    const token = new UnsecuredJWT({ scope: 'payouts:write' })
      .setIssuer('ledgerline-partner-api')
      .setAudience('ledgerline-partners')
      .setSubject('prt_a')
      .setJti('key_1')
      .setExpirationTime('5m')
      .encode();
    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects tokens for another audience', async () => {
    const token = await new SignJWT({ scope: 'ledger:read' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('ledgerline-partner-api')
      .setAudience('someone-else')
      .setSubject('prt_a')
      .setJti('key_1')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifyAccessToken(token, SECRET)).rejects.toThrow();
  });

  it('drops unknown scopes from the claim', async () => {
    const token = await new SignJWT({ scope: 'ledger:read admin:everything' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('ledgerline-partner-api')
      .setAudience('ledgerline-partners')
      .setSubject('prt_a')
      .setJti('key_1')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode(SECRET));
    expect((await verifyAccessToken(token, SECRET)).scopes).toEqual(['ledger:read']);
  });
});
