import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Db } from '../db';
import { newId } from '../ids';
import { SCOPES, type ScopeName } from '../seed-data';

/**
 * API keys look like `llk_test_3f9a1c2b_<32 chars>`.
 * The first three parts are the public prefix used for lookup;
 * only an HMAC of the whole key is stored.
 */
const KEY_PATTERN = /^(llk_(?:test|live)_[a-z0-9]{8})_([A-Za-z0-9]{32})$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const ALL_SCOPES = SCOPES.map((s) => s.name) as ScopeName[];

export const isScope = (value: string): value is ScopeName => (ALL_SCOPES as string[]).includes(value);

function randomString(length: number): string {
  // 62 symbols: reject bytes >= 248 so every symbol is equally likely.
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248 && out.length < length) out += ALPHABET[byte % 62];
    }
  }
  return out;
}

export function parseApiKey(key: string): { prefix: string } | null {
  const match = KEY_PATTERN.exec(key);
  return match ? { prefix: match[1]! } : null;
}

export function hashApiKey(key: string, pepper: string): string {
  return createHmac('sha256', pepper).update(key).digest('hex');
}

export function generateApiKey(mode: 'test' | 'live' = 'test'): { key: string; prefix: string } {
  const prefix = `llk_${mode}_${randomBytes(4).toString('hex')}`;
  return { key: `${prefix}_${randomString(32)}`, prefix };
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

export interface IssuedKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ScopeName[];
  createdAt: Date;
  /** The full key. Shown once, never stored. */
  key: string;
}

export async function createApiKey(
  db: Db,
  pepper: string,
  input: { partnerId: string; name: string; scopes: ScopeName[]; key?: string },
): Promise<IssuedKey> {
  const scopes = [...new Set(input.scopes)];
  if (!scopes.length) throw new Error('An API key needs at least one scope');
  const { key, prefix } = input.key
    ? { key: input.key, prefix: parseApiKey(input.key)?.prefix ?? '' }
    : generateApiKey();
  if (!prefix) throw new Error('Malformed API key');

  const row = await db.apiKey.create({
    data: {
      id: newId('key'),
      partnerId: input.partnerId,
      name: input.name,
      prefix,
      hash: hashApiKey(key, pepper),
      scopes: { create: scopes.map((scope) => ({ scope })) },
    },
  });
  return { id: row.id, name: row.name, prefix, scopes, createdAt: row.createdAt, key };
}

export interface KeyPrincipal {
  keyId: string;
  partnerId: string;
  scopes: ScopeName[];
}

/** Checks a presented API key. Returns null for unknown, wrong or revoked keys. */
export async function authenticateApiKey(db: Db, pepper: string, key: string): Promise<KeyPrincipal | null> {
  const parsed = parseApiKey(key);
  if (!parsed) return null;
  const row = await db.apiKey.findUnique({ where: { prefix: parsed.prefix }, include: { scopes: true } });
  if (!row || row.revokedAt || !safeEqualHex(row.hash, hashApiKey(key, pepper))) return null;

  await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } });
  return { keyId: row.id, partnerId: row.partnerId, scopes: row.scopes.map((s) => s.scope).filter(isScope) };
}
