import { requireAuth, requireScope } from '../auth/scopes';
import type {
  Account,
  AccountKind,
  DeliveryStatus,
  LedgerEntry,
  Payout,
  PayoutStatus,
  Prisma,
  WebhookDelivery,
} from '../generated/prisma/client';
import { withIdempotency } from '../services/idempotency';
import type { Balance } from '../services/ledger';
import { cancelPayout, type CreatePayoutInput, createPayout, validateCreatePayout } from '../services/payouts';
import type { Context } from './context';
import { notFound } from './errors';
import { keysetWhere, type PageArgs, pageSize, toConnection } from './pagination';
import { DateTime, JSONScalar, MinorUnits } from './scalars';

export const typeDefs = /* GraphQL */ `
  """
  Ledgerline Partner API. Every query needs the ledger:read scope; every
  mutation needs payouts:write and an Idempotency-Key header.
  Amounts are integers in minor units (pence).
  """
  schema {
    query: Query
    mutation: Mutation
  }

  scalar DateTime
  scalar MinorUnits
  scalar JSON

  enum AccountKind {
    "The partner's float. Payouts are paid out of it."
    TREASURY
    "A party the partner pays, e.g. a marketplace seller."
    BENEFICIARY
  }

  enum EntryDirection {
    CREDIT
    DEBIT
  }

  enum PayoutStatus {
    "Queued; settles automatically."
    PENDING
    "Above the approval limit; waiting for a reviewer."
    REVIEW
    PAID
    REJECTED
    CANCELLED
  }

  enum DeliveryStatus {
    PENDING
    DELIVERED
    "Gave up after 8 attempts."
    FAILED
  }

  type Viewer {
    partnerId: ID!
    partnerName: String!
    "Scopes granted to this access token."
    scopes: [String!]!
    tokenExpiresAt: DateTime!
  }

  type Account {
    id: ID!
    kind: AccountKind!
    name: String!
    "Masked account number, e.g. GB •• 4410."
    number: String!
    city: String
    country: String!
    currency: String!
    createdAt: DateTime!
    balance: Balance!
  }

  type Balance {
    account: Account!
    currency: String!
    "Credits minus debits."
    ledger: MinorUnits!
    "Outstanding PENDING + REVIEW payouts (outgoing for the treasury, incoming for a beneficiary)."
    pending: MinorUnits!
    "Spendable now: ledger − pending for the treasury, ledger for a beneficiary."
    available: MinorUnits!
    asOf: DateTime!
  }

  type LedgerEntry {
    id: ID!
    account: Account!
    direction: EntryDirection!
    amount: MinorUnits!
    currency: String!
    description: String!
    occurredAt: DateTime!
    payout: Payout
  }

  type Payout {
    id: ID!
    "The beneficiary account being paid."
    account: Account!
    amount: MinorUnits!
    currency: String!
    status: PayoutStatus!
    reference: String!
    "faster, bacs, sepa or swift."
    method: String!
    createdAt: DateTime!
    paidAt: DateTime
    cancelledAt: DateTime
    "Status-change notifications for this payout, newest first."
    webhookDeliveries: [WebhookDelivery!]!
  }

  type WebhookDelivery {
    id: ID!
    "payout.created, payout.paid, payout.cancelled or payout.rejected."
    event: String!
    payout: Payout
    "Exactly the JSON body POSTed to your webhook URL."
    payload: JSON!
    status: DeliveryStatus!
    attempts: Int!
    responseStatus: Int
    lastError: String
    nextAttemptAt: DateTime!
    createdAt: DateTime!
    deliveredAt: DateTime
  }

  type PageInfo {
    hasNextPage: Boolean!
    "Pass as \`after\` to get the next page."
    endCursor: String
  }

  type LedgerEntryEdge {
    cursor: String!
    node: LedgerEntry!
  }

  type LedgerEntryConnection {
    edges: [LedgerEntryEdge!]!
    pageInfo: PageInfo!
    "Matching entries across all pages (ignores \`after\`)."
    totalCount: Int!
  }

  type PayoutEdge {
    cursor: String!
    node: Payout!
  }

  type PayoutConnection {
    edges: [PayoutEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type WebhookDeliveryEdge {
    cursor: String!
    node: WebhookDelivery!
  }

  type WebhookDeliveryConnection {
    edges: [WebhookDeliveryEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type Query {
    "The authenticated partner. Needs a token but no particular scope."
    viewer: Viewer!

    accounts(kind: AccountKind): [Account!]!
    account(id: ID!): Account
    "Balances for every account you own."
    balances: [Balance!]!

    """
    Ledger entries, newest first. \`from\` is inclusive, \`to\` exclusive.
    \`first\` is 1–200 (default 50).
    """
    ledgerEntries(accountId: ID, from: DateTime, to: DateTime, first: Int, after: String): LedgerEntryConnection!

    "Payouts, newest first, filtered by creation time."
    payouts(status: PayoutStatus, accountId: ID, from: DateTime, to: DateTime, first: Int, after: String): PayoutConnection!
    payout(id: ID!): Payout

    "The webhook delivery log: every payout status change and whether it reached you."
    webhookDeliveries(payoutId: ID, status: DeliveryStatus, from: DateTime, to: DateTime, first: Int, after: String): WebhookDeliveryConnection!
  }

  input CreatePayoutInput {
    "A BENEFICIARY account you own."
    accountId: ID!
    "Minor units, greater than zero."
    amount: MinorUnits!
    "Shown on the beneficiary's statement. 1–140 characters."
    reference: String!
  }

  type Mutation {
    """
    Pays a beneficiary from your treasury. Payouts above £20,000 start in REVIEW.
    Needs an Idempotency-Key header: retrying with the same key returns the
    original payout instead of paying twice.
    """
    createPayout(input: CreatePayoutInput!): Payout!

    "Cancels a PENDING or REVIEW payout. Needs an Idempotency-Key header."
    cancelPayout(id: ID!): Payout!
  }
`;

type Args<T> = T & PageArgs;

/** Stored idempotent responses: the payout row with bigints and dates as strings. */
const payoutToJson = (p: Payout): Prisma.InputJsonValue => JSON.parse(JSON.stringify(p, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
const payoutFromJson = (json: Prisma.JsonValue): Payout => {
  const p = json as Record<string, string | null>;
  const date = (v: string | null) => (v ? new Date(v) : null);
  return { ...(p as unknown as Payout), amount: BigInt(p.amount!), createdAt: new Date(p.createdAt!), paidAt: date(p.paidAt!), cancelledAt: date(p.cancelledAt!) };
};

async function account(ctx: Context, id: string) {
  const row = await ctx.loaders.account.load(id);
  if (!row) throw notFound('Account', id);
  return row;
}

export const resolvers = {
  DateTime,
  MinorUnits,
  JSON: JSONScalar,

  Query: {
    viewer: async (_: unknown, __: unknown, ctx: Context) => {
      const auth = requireAuth(ctx);
      const partner = await ctx.db.partner.findUniqueOrThrow({ where: { id: auth.partnerId }, select: { name: true } });
      return { partnerId: auth.partnerId, partnerName: partner.name, scopes: auth.scopes, tokenExpiresAt: auth.expiresAt };
    },

    accounts: async (_: unknown, args: { kind?: AccountKind | null }, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      const rows = await ctx.db.account.findMany({
        where: { partnerId, ...(args.kind ? { kind: args.kind } : {}) },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      });
      for (const row of rows) ctx.loaders.account.prime(row.id, row);
      return rows;
    },

    account: async (_: unknown, args: { id: string }, ctx: Context) => {
      requireScope(ctx, 'ledger:read');
      return ctx.loaders.account.load(args.id);
    },

    balances: async (_: unknown, __: unknown, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      const accounts = await ctx.db.account.findMany({ where: { partnerId }, orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
      for (const row of accounts) ctx.loaders.account.prime(row.id, row);
      return (await ctx.loaders.balance.loadMany(accounts.map((a) => a.id))).filter(Boolean);
    },

    ledgerEntries: async (_: unknown, args: Args<{ accountId?: string | null }>, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      const size = pageSize(args.first);
      const base = { account: { partnerId }, ...(args.accountId ? { accountId: args.accountId } : {}) };
      const page = keysetWhere('occurredAt', args);
      const [rows, totalCount] = await Promise.all([
        ctx.db.ledgerEntry.findMany({ where: { AND: [base, page.where] }, orderBy: page.orderBy, take: size + 1 }),
        ctx.db.ledgerEntry.count({ where: { AND: [base, keysetWhere('occurredAt', { from: args.from, to: args.to }).where] } }),
      ]);
      return toConnection(rows, size, (e) => e.occurredAt, totalCount);
    },

    payouts: async (_: unknown, args: Args<{ status?: PayoutStatus | null; accountId?: string | null }>, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      const size = pageSize(args.first);
      const base = { partnerId, ...(args.status ? { status: args.status } : {}), ...(args.accountId ? { accountId: args.accountId } : {}) };
      const page = keysetWhere('createdAt', args);
      const [rows, totalCount] = await Promise.all([
        ctx.db.payout.findMany({ where: { AND: [base, page.where] }, orderBy: page.orderBy, take: size + 1 }),
        ctx.db.payout.count({ where: { AND: [base, keysetWhere('createdAt', { from: args.from, to: args.to }).where] } }),
      ]);
      return toConnection(rows, size, (p) => p.createdAt, totalCount);
    },

    payout: async (_: unknown, args: { id: string }, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      return ctx.db.payout.findFirst({ where: { id: args.id, partnerId } });
    },

    webhookDeliveries: async (_: unknown, args: Args<{ payoutId?: string | null; status?: DeliveryStatus | null }>, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'ledger:read');
      const size = pageSize(args.first);
      const base = { partnerId, ...(args.payoutId ? { payoutId: args.payoutId } : {}), ...(args.status ? { status: args.status } : {}) };
      const page = keysetWhere('createdAt', args);
      const [rows, totalCount] = await Promise.all([
        ctx.db.webhookDelivery.findMany({ where: { AND: [base, page.where] }, orderBy: page.orderBy, take: size + 1 }),
        ctx.db.webhookDelivery.count({ where: { AND: [base, keysetWhere('createdAt', { from: args.from, to: args.to }).where] } }),
      ]);
      return toConnection(rows, size, (d) => d.createdAt, totalCount);
    },
  },

  Mutation: {
    createPayout: async (_: unknown, args: { input: CreatePayoutInput }, ctx: Context) => {
      const { partnerId, keyId } = requireScope(ctx, 'payouts:write');
      const input = validateCreatePayout(args.input);
      const { value, replayed } = await withIdempotency(
        ctx.db,
        { partnerId, key: ctx.idempotencyKey, operation: 'createPayout', input, toJson: payoutToJson, fromJson: payoutFromJson },
        (tx) => createPayout(tx, partnerId, `api:${keyId}`, input),
      );
      if (replayed) ctx.setHeader('Idempotent-Replayed', 'true');
      return value;
    },

    cancelPayout: async (_: unknown, args: { id: string }, ctx: Context) => {
      const { partnerId } = requireScope(ctx, 'payouts:write');
      const { value, replayed } = await withIdempotency(
        ctx.db,
        { partnerId, key: ctx.idempotencyKey, operation: 'cancelPayout', input: { id: args.id }, toJson: payoutToJson, fromJson: payoutFromJson },
        (tx) => cancelPayout(tx, partnerId, args.id),
      );
      if (replayed) ctx.setHeader('Idempotent-Replayed', 'true');
      return value;
    },
  },

  Account: {
    balance: async (parent: Account, _: unknown, ctx: Context) => {
      const balance = await ctx.loaders.balance.load(parent.id);
      if (!balance) throw notFound('Account', parent.id);
      return balance;
    },
  },

  Balance: {
    account: (parent: Balance, _: unknown, ctx: Context) => account(ctx, parent.accountId),
  },

  LedgerEntry: {
    account: (parent: LedgerEntry, _: unknown, ctx: Context) => account(ctx, parent.accountId),
    payout: (parent: LedgerEntry, _: unknown, ctx: Context) =>
      parent.payoutId ? ctx.db.payout.findFirst({ where: { id: parent.payoutId, partnerId: requireAuth(ctx).partnerId } }) : null,
  },

  Payout: {
    account: (parent: Payout, _: unknown, ctx: Context) => account(ctx, parent.accountId),
    webhookDeliveries: (parent: Payout, _: unknown, ctx: Context) =>
      ctx.db.webhookDelivery.findMany({ where: { payoutId: parent.id, partnerId: requireAuth(ctx).partnerId }, orderBy: { createdAt: 'desc' } }),
  },

  WebhookDelivery: {
    payout: (parent: WebhookDelivery, _: unknown, ctx: Context) =>
      parent.payoutId ? ctx.db.payout.findFirst({ where: { id: parent.payoutId, partnerId: requireAuth(ctx).partnerId } }) : null,
  },
};
