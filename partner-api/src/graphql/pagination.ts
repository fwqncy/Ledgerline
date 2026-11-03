import { badInput } from './errors';

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

export interface PageArgs {
  first?: number | null;
  after?: string | null;
  from?: Date | null;
  to?: Date | null;
}

interface CursorKey {
  at: Date;
  id: string;
}

/** Opaque cursor: base64url of `[timestamp, id]`. Partners must treat it as a black box. */
export function encodeCursor({ at, id }: CursorKey): string {
  return Buffer.from(JSON.stringify([at.toISOString(), id])).toString('base64url');
}

export function decodeCursor(cursor: string): CursorKey {
  try {
    const [at, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown[];
    const date = new Date(String(at));
    if (typeof id !== 'string' || !id || Number.isNaN(date.getTime())) throw new Error('bad cursor');
    return { at: date, id };
  } catch {
    throw badInput('`after` is not a valid cursor. Pass back an endCursor from a previous page.');
  }
}

export function pageSize(first: number | null | undefined): number {
  const size = first ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    throw badInput(`\`first\` must be between 1 and ${MAX_PAGE_SIZE}`);
  }
  return size;
}

/**
 * Prisma `where` + `orderBy` for keyset pagination, newest first, on a
 * (timestamp, id) pair. `from` is inclusive, `to` is exclusive.
 */
export function keysetWhere<F extends string>(field: F, args: PageArgs) {
  if (args.from && args.to && args.from >= args.to) throw badInput('`from` must be before `to`');
  const and: Record<string, unknown>[] = [];
  if (args.from) and.push({ [field]: { gte: args.from } });
  if (args.to) and.push({ [field]: { lt: args.to } });
  if (args.after) {
    const { at, id } = decodeCursor(args.after);
    and.push({ OR: [{ [field]: { lt: at } }, { [field]: at, id: { lt: id } }] });
  }
  return {
    where: and.length ? { AND: and } : {},
    orderBy: [{ [field]: 'desc' as const }, { id: 'desc' as const }],
  };
}

/** Turns `size + 1` fetched rows into a connection. */
export function toConnection<T extends { id: string }>(rows: T[], size: number, at: (row: T) => Date, totalCount: number) {
  const page = rows.slice(0, size);
  const edges = page.map((node) => ({ node, cursor: encodeCursor({ at: at(node), id: node.id }) }));
  return {
    edges,
    totalCount,
    pageInfo: { hasNextPage: rows.length > size, endCursor: edges.at(-1)?.cursor ?? null },
  };
}
