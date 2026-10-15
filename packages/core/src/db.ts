import { seed } from './seed';

export type PayoutStatusValue = 'pending' | 'review' | 'paid' | 'rejected';
export type PayoutMethod = 'faster' | 'bacs' | 'sepa' | 'swift';

export interface Payout {
  id: string;
  beneficiary: string;
  /** Minor units (pence). */
  amount: number;
  currency: 'GBP';
  status: PayoutStatusValue;
  reference: string;
  account: string;
  method: PayoutMethod;
  city: string;
  country: string;
  createdBy: string;
  createdAt: string;
  paidAt: string | null;
  idempotencyKey: string | null;
}

/** Money moving into the account that funds payouts (top-ups and settlements). */
export interface Funding {
  id: string;
  amount: number;
  source: string;
  at: string;
}

export type RiskFlagStatus = 'open' | 'cleared' | 'rejected';

export interface RiskFlag {
  id: string;
  payoutId: string;
  rule: string;
  reason: string;
  score: number;
  status: RiskFlagStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export type TicketStatus = 'open' | 'waiting' | 'resolved';
export type TicketPriority = 'low' | 'normal' | 'high';

export interface TicketMessage {
  id: string;
  author: string;
  from: 'merchant' | 'operator';
  body: string;
  at: string;
}

export interface Ticket {
  id: string;
  subject: string;
  merchant: string;
  payoutId: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assignee: string | null;
  slaDueAt: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessage[];
}

export interface AuditEvent {
  id: string;
  action: string;
  module: string;
  actor: string;
  targetId: string;
  detail: string | null;
  at: string;
}

type Comparable<V> = { gt?: V; gte?: V; lt?: V; lte?: V };
type FieldFilter<V> =
  | V
  | ({ in?: V[]; not?: V; contains?: string; mode?: 'insensitive' } & Comparable<V>)
  | undefined;

export type Where<T> = { [K in keyof T]?: FieldFilter<T[K]> } & { OR?: Where<T>[]; AND?: Where<T>[] };
export type OrderBy<T> = { [K in keyof T]?: 'asc' | 'desc' };

const clone = <T>(value: T): T => structuredClone(value);

function matchesField(value: unknown, condition: unknown): boolean {
  // Like Prisma, an undefined filter means "don't filter on this field".
  if (condition === undefined) return true;
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) return value === condition;

  const c = condition as Record<string, unknown>;
  if ('in' in c && !(c.in as unknown[]).includes(value)) return false;
  if ('not' in c && value === c.not) return false;
  if (typeof c.contains === 'string') {
    if (typeof value !== 'string') return false;
    const insensitive = c.mode === 'insensitive';
    const haystack = insensitive ? value.toLowerCase() : value;
    const needle = insensitive ? c.contains.toLowerCase() : c.contains;
    if (!haystack.includes(needle)) return false;
  }
  const v = value as number | string;
  if (c.gt !== undefined && !(v > (c.gt as typeof v))) return false;
  if (c.gte !== undefined && !(v >= (c.gte as typeof v))) return false;
  if (c.lt !== undefined && !(v < (c.lt as typeof v))) return false;
  if (c.lte !== undefined && !(v <= (c.lte as typeof v))) return false;
  return true;
}

function matches<T>(row: T, where?: Where<T>): boolean {
  if (!where) return true;
  const { OR, AND, ...fields } = where;
  if (OR && !OR.some((w) => matches(row, w))) return false;
  if (AND && !AND.every((w) => matches(row, w))) return false;
  return Object.entries(fields).every(([key, condition]) => matchesField(row[key as keyof T], condition));
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

/**
 * A small in-memory table with a Prisma-compatible subset of the client API,
 * so module code reads exactly as it would against a real database.
 */
export class Table<T extends { id: string }> {
  constructor(private rows: T[]) {}

  async findMany(
    args: { where?: Where<T>; orderBy?: OrderBy<T>; take?: number; skip?: number } = {},
  ): Promise<T[]> {
    let result = this.rows.filter((row) => matches(row, args.where));
    const order = args.orderBy && (Object.entries(args.orderBy)[0] as [keyof T, 'asc' | 'desc'] | undefined);
    if (order) {
      const [key, direction] = order;
      result = [...result].sort((a, b) => compare(a[key], b[key]) * (direction === 'desc' ? -1 : 1));
    }
    const start = args.skip ?? 0;
    result = result.slice(start, args.take === undefined ? undefined : start + args.take);
    return result.map(clone);
  }

  async findUnique(args: { where: { id: string } }): Promise<T | null> {
    const row = this.rows.find((r) => r.id === args.where.id);
    return row ? clone(row) : null;
  }

  async findFirst(args: { where?: Where<T>; orderBy?: OrderBy<T> } = {}): Promise<T | null> {
    const [row] = await this.findMany({ ...args, take: 1 });
    return row ?? null;
  }

  async count(args: { where?: Where<T> } = {}): Promise<number> {
    return this.rows.filter((row) => matches(row, args.where)).length;
  }

  async create(args: { data: T }): Promise<T> {
    this.rows.push(clone(args.data));
    return clone(args.data);
  }

  async update(args: { where: { id: string }; data: Partial<T> }): Promise<T> {
    const index = this.rows.findIndex((r) => r.id === args.where.id);
    const current = this.rows[index];
    if (!current) throw new Error(`Record ${args.where.id} not found`);
    const next = { ...current, ...clone(args.data) };
    this.rows[index] = next;
    return clone(next);
  }
}

function createDb() {
  const data = seed();
  return {
    payout: new Table<Payout>(data.payouts),
    funding: new Table<Funding>(data.funding),
    riskFlag: new Table<RiskFlag>(data.riskFlags),
    ticket: new Table<Ticket>(data.tickets),
    auditEvent: new Table<AuditEvent>(data.auditEvents),
  };
}

export type Db = ReturnType<typeof createDb>;

// Keep one store per server process, surviving dev-server hot reloads.
const globalStore = globalThis as unknown as { __ledgerlineDb?: Db; __ledgerlineDbVersion?: number };
const DB_VERSION = 2;
if (globalStore.__ledgerlineDbVersion !== DB_VERSION) {
  globalStore.__ledgerlineDb = undefined;
  globalStore.__ledgerlineDbVersion = DB_VERSION;
}
export const db: Db = (globalStore.__ledgerlineDb ??= createDb());

export function newId(prefix: string, length = 4): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
  return `${prefix}_${hex}`;
}
