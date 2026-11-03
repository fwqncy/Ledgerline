import { GraphQLScalarType, Kind } from 'graphql';

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function toMinorUnits(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw new TypeError(`MinorUnits must be a whole number of minor units, got ${String(value)}`);
}

/**
 * Money in minor units (pence), as a JSON integer. Stored as BIGINT; GraphQL's
 * Int is only 32-bit (£21.4m), so this goes up to 2^53 - 1 instead.
 */
export const MinorUnits = new GraphQLScalarType<bigint, number>({
  name: 'MinorUnits',
  description: 'An amount in minor units (pence for GBP), as a JSON integer up to 2^53 - 1.',
  serialize(value) {
    const n = toMinorUnits(value);
    if (n > MAX || n < -MAX) throw new TypeError('MinorUnits value out of safe range');
    return Number(n);
  },
  parseValue(value) {
    return toMinorUnits(value);
  },
  parseLiteral(ast) {
    if (ast.kind !== Kind.INT) throw new TypeError('MinorUnits must be an integer literal');
    const n = BigInt(ast.value);
    if (n > MAX || n < -MAX) throw new TypeError('MinorUnits value out of safe range');
    return n;
  },
});

function toDate(value: unknown): Date {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) throw new TypeError(`DateTime must be an ISO 8601 string, got ${String(value)}`);
  return date;
}

export const DateTime = new GraphQLScalarType<Date, string>({
  name: 'DateTime',
  description: 'An ISO 8601 timestamp, e.g. 2026-11-04T09:30:00.000Z.',
  serialize: (value) => toDate(value).toISOString(),
  parseValue: (value) => toDate(value),
  parseLiteral(ast) {
    if (ast.kind !== Kind.STRING) throw new TypeError('DateTime must be a string');
    return toDate(ast.value);
  },
});

export const JSONScalar = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON, used for webhook payloads.',
  serialize: (value) => value,
});
