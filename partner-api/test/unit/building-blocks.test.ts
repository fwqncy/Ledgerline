import { Kind } from 'graphql';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/graphql/pagination';
import { DateTime, MinorUnits } from '../../src/graphql/scalars';
import { canonicalJson, requestHash } from '../../src/services/idempotency';
import { backoffMs, MAX_ATTEMPTS, signWebhook, verifyWebhookSignature } from '../../src/services/webhooks';

describe('cursors', () => {
  it('round-trip and stay opaque', () => {
    const key = { at: new Date('2026-03-01T10:00:00.123Z'), id: 'ent_fd_00a1' };
    const cursor = encodeCursor(key);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(cursor)).toEqual(key);
  });

  it('reject garbage', () => {
    for (const bad of ['', 'abc', Buffer.from('[1]').toString('base64url'), Buffer.from('["nope","x"]').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(/cursor/);
    }
  });
});

describe('MinorUnits scalar', () => {
  it('serialises bigints as JSON integers', () => {
    expect(MinorUnits.serialize(2_460_000n)).toBe(2_460_000);
    expect(MinorUnits.serialize(2n ** 40n)).toBe(2 ** 40);
  });

  it('refuses values JSON cannot hold exactly', () => {
    expect(() => MinorUnits.serialize(2n ** 60n)).toThrow();
    expect(() => MinorUnits.parseValue(10.5)).toThrow();
    expect(() => MinorUnits.parseValue('100')).toThrow();
    expect(() => MinorUnits.parseLiteral({ kind: Kind.FLOAT, value: '1.5' })).toThrow();
  });

  it('parses variables and literals to bigint', () => {
    expect(MinorUnits.parseValue(12_500)).toBe(12_500n);
    expect(MinorUnits.parseLiteral({ kind: Kind.INT, value: '12500' })).toBe(12_500n);
  });
});

describe('DateTime scalar', () => {
  it('accepts ISO strings and rejects nonsense', () => {
    expect(DateTime.parseValue('2026-01-01T00:00:00Z')).toEqual(new Date('2026-01-01T00:00:00Z'));
    expect(() => DateTime.parseValue('yesterday')).toThrow();
    expect(DateTime.serialize(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('idempotency request hashing', () => {
  it('ignores key order but not values or operation', () => {
    const a = { accountId: 'acc_1', amount: 100n, reference: 'r' };
    const b = { reference: 'r', amount: 100n, accountId: 'acc_1' };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(requestHash('createPayout', a)).toBe(requestHash('createPayout', b));
    expect(requestHash('createPayout', a)).not.toBe(requestHash('createPayout', { ...a, amount: 101n }));
    expect(requestHash('createPayout', { id: 'po_1' })).not.toBe(requestHash('cancelPayout', { id: 'po_1' }));
  });
});

describe('webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'payout.paid', data: { payout: { id: 'po_1' } } });

  it('verify when untouched and recent', () => {
    expect(verifyWebhookSignature(secret, body, signWebhook(secret, body))).toBe(true);
  });

  it('fail for a changed body, wrong secret, or stale timestamp', () => {
    const header = signWebhook(secret, body);
    expect(verifyWebhookSignature(secret, `${body} `, header)).toBe(false);
    expect(verifyWebhookSignature('whsec_other', body, header)).toBe(false);
    const old = signWebhook(secret, body, Math.floor(Date.now() / 1000) - 3600);
    expect(verifyWebhookSignature(secret, body, old)).toBe(false);
    expect(verifyWebhookSignature(secret, body, 'garbage')).toBe(false);
  });

  it('back off exponentially', () => {
    expect([1, 2, 3, 4].map(backoffMs)).toEqual([30_000, 60_000, 120_000, 240_000]);
    expect(MAX_ATTEMPTS).toBe(8);
  });
});
