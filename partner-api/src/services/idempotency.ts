import { createHash } from 'node:crypto';
import type { Db } from '../db';
import { Prisma } from '../generated/prisma/client';
import { apiError, badInput } from '../graphql/errors';
import { newId } from '../ids';

export type Tx = Prisma.TransactionClient;

const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;
const RETENTION_MS = 24 * 60 * 60 * 1000;

/** JSON with sorted keys and bigints as strings, so equal requests hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (typeof v === 'bigint') return v.toString();
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

export const requestHash = (operation: string, input: unknown) =>
  createHash('sha256').update(`${operation}\n${canonicalJson(input)}`).digest('hex');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export interface IdempotentResult<T> {
  value: T;
  replayed: boolean;
}

/**
 * Runs `work` at most once per (partner, Idempotency-Key).
 *
 * The key row is inserted in the same transaction as the work, so:
 * - a retry after success replays the stored result;
 * - a concurrent duplicate waits on the unique index, then replays;
 * - if the work fails, everything rolls back and the key can be retried;
 * - reusing a key for a different request is a 409 IDEMPOTENCY_KEY_REUSED.
 *
 * `toJson`/`fromJson` turn the result into what's stored and back.
 */
export async function withIdempotency<T>(
  db: Db,
  args: {
    partnerId: string;
    key: string | null | undefined;
    operation: string;
    input: unknown;
    toJson: (value: T) => Prisma.InputJsonValue;
    fromJson: (json: Prisma.JsonValue) => T;
  },
  work: (tx: Tx) => Promise<T>,
): Promise<IdempotentResult<T>> {
  const { partnerId, key, operation } = args;
  if (!key) throw badInput('Mutations need an Idempotency-Key header (any unique string, e.g. a UUID)', { header: 'Idempotency-Key' });
  if (!KEY_PATTERN.test(key)) throw badInput('Idempotency-Key must be 1–255 printable ASCII characters');
  const hash = requestHash(operation, args.input);

  const replay = async (): Promise<IdempotentResult<T> | null> => {
    const existing = await db.idempotencyKey.findUnique({ where: { partnerId_key: { partnerId, key } } });
    if (!existing) return null;
    if (existing.expiresAt < new Date()) {
      await db.idempotencyKey.deleteMany({ where: { id: existing.id, expiresAt: { lt: new Date() } } });
      return null;
    }
    if (existing.requestHash !== hash) {
      throw apiError('IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used for a different request', 409);
    }
    if (existing.state !== 'COMPLETED' || existing.response === null) {
      throw apiError('IDEMPOTENCY_IN_PROGRESS', 'A request with this Idempotency-Key is still in progress; retry shortly', 409);
    }
    return { value: args.fromJson(existing.response), replayed: true };
  };

  const earlier = await replay();
  if (earlier) return earlier;

  try {
    const value = await db.$transaction(async (tx) => {
      const row = await tx.idempotencyKey.create({
        data: { id: newId('idem'), partnerId, key, requestHash: hash, expiresAt: new Date(Date.now() + RETENTION_MS) },
      });
      const result = await work(tx);
      await tx.idempotencyKey.update({ where: { id: row.id }, data: { state: 'COMPLETED', response: args.toJson(result) } });
      return result;
    });
    return { value, replayed: false };
  } catch (error) {
    // Lost a race with an identical request that committed first.
    if (isUniqueViolation(error)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw error;
  }
}
