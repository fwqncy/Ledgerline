import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { settleDuePayouts } from '../../src/services/payouts';
import { beneficiaryAccountId, DEMO_PARTNER, treasuryAccountId } from '../../src/seed-data';
import { type Harness, startHarness } from './harness';

const TREASURY = treasuryAccountId(DEMO_PARTNER.id);
const KITE = beneficiaryAccountId('Kite & Co');

const CREATE = /* GraphQL */ `
  mutation ($input: CreatePayoutInput!) {
    createPayout(input: $input) { id status amount method reference account { id name } }
  }
`;
const CANCEL = /* GraphQL */ `mutation ($id: ID!) { cancelPayout(id: $id) { id status cancelledAt } }`;
const BALANCE = /* GraphQL */ `query ($id: ID!) { account(id: $id) { balance { ledger pending available } } }`;

describe('Partner GraphQL API against real Postgres', () => {
  let h: Harness;
  let token: string;
  const key = () => ({ 'Idempotency-Key': randomUUID() });

  beforeAll(async () => {
    h = await startHarness();
    token = await h.token();
  });
  afterAll(() => h?.close());

  describe('reads', () => {
    it('lists accounts with balances that match the ledger in SQL', async () => {
      const res = await h.gql(token, '{ accounts { id kind name balance { ledger } } }');
      expect(res.status).toBe(200);
      const accounts = res.body.data.accounts as { id: string; kind: string; balance: { ledger: number } }[];
      expect(accounts[0]).toMatchObject({ id: TREASURY, kind: 'TREASURY' });
      expect(accounts.length).toBe(await h.db.account.count({ where: { partnerId: DEMO_PARTNER.id } }));

      const [row] = await h.db.$queryRaw<{ balance: bigint }[]>`
        SELECT SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) AS balance
        FROM ledger_entries WHERE account_id = ${TREASURY}`;
      expect(accounts[0]!.balance.ledger).toBe(Number(row!.balance));
    });

    it('balances: treasury available = ledger − outstanding payouts', async () => {
      const res = await h.gql(token, '{ balances { account { id kind } ledger pending available } }');
      const treasury = res.body.data.balances.find((b: { account: { kind: string } }) => b.account.kind === 'TREASURY');
      const outstanding = await h.db.payout.aggregate({ where: { status: { in: ['PENDING', 'REVIEW'] } }, _sum: { amount: true } });
      expect(treasury.pending).toBe(Number(outstanding._sum.amount));
      expect(treasury.available).toBe(treasury.ledger - treasury.pending);
    });

    it('walks every ledger entry in a date range with cursors: no gaps, no repeats', async () => {
      const from = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const to = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const expected = await h.db.ledgerEntry.count({ where: { occurredAt: { gte: new Date(from), lt: new Date(to) } } });
      expect(expected).toBeGreaterThan(150);

      const seen: string[] = [];
      let after: string | null = null;
      let pages = 0;
      do {
        const res = await h.gql(
          token,
          `query ($from: DateTime, $to: DateTime, $after: String) {
            ledgerEntries(from: $from, to: $to, first: 75, after: $after) {
              totalCount
              pageInfo { hasNextPage endCursor }
              edges { node { id occurredAt } }
            }
          }`,
          { from, to, after },
        );
        const conn = res.body.data.ledgerEntries;
        expect(conn.totalCount).toBe(expected);
        for (const { node } of conn.edges) {
          expect(node.occurredAt >= from && node.occurredAt < to).toBe(true);
          seen.push(node.id);
        }
        after = conn.pageInfo.hasNextPage ? conn.pageInfo.endCursor : null;
        pages++;
      } while (after);

      expect(seen).toHaveLength(expected);
      expect(new Set(seen).size).toBe(expected);
      expect(pages).toBe(Math.ceil(expected / 75));
    });

    it('filters payouts by status and pages them', async () => {
      const res = await h.gql(token, '{ payouts(status: REJECTED, first: 5) { totalCount edges { node { status } } pageInfo { hasNextPage } } }');
      const conn = res.body.data.payouts;
      expect(conn.totalCount).toBe(await h.db.payout.count({ where: { status: 'REJECTED' } }));
      expect(conn.edges.every((e: { node: { status: string } }) => e.node.status === 'REJECTED')).toBe(true);
      expect(conn.pageInfo.hasNextPage).toBe(conn.totalCount > 5);
    });

    it('returns readable errors for bad input', async () => {
      const res = await h.gql(token, '{ ledgerEntries(first: 500) { totalCount } }');
      expect(res.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    });
  });

  describe('payout lifecycle', () => {
    it('create → pending balance → settle → ledger entries + webhooks', async () => {
      const before = (await h.gql(token, BALANCE, { id: KITE })).body.data.account.balance;

      const created = await h.gql(token, CREATE, { input: { accountId: KITE, amount: 12_345, reference: 'SELLER-0001' } }, key());
      expect(created.body.errors).toBeUndefined();
      const payout = created.body.data.createPayout;
      expect(payout).toMatchObject({ status: 'PENDING', amount: 12_345, method: 'faster', account: { id: KITE, name: 'Kite & Co' } });

      const pending = (await h.gql(token, BALANCE, { id: KITE })).body.data.account.balance;
      expect(pending.pending).toBe(before.pending + 12_345);

      expect(await settleDuePayouts(h.db, { olderThanMs: 0 })).toBeGreaterThanOrEqual(1);

      const after = (await h.gql(token, BALANCE, { id: KITE })).body.data.account.balance;
      expect(after.ledger).toBe(before.ledger + 12_345);
      expect(after.pending).toBe(before.pending);

      const detail = await h.gql(
        token,
        `query ($id: ID!) { payout(id: $id) { status paidAt webhookDeliveries { event status payload } } }`,
        { id: payout.id },
      );
      const p = detail.body.data.payout;
      expect(p.status).toBe('PAID');
      expect(p.webhookDeliveries.map((d: { event: string }) => d.event)).toEqual(['payout.paid', 'payout.created']);
      expect(p.webhookDeliveries[0].payload).toMatchObject({ type: 'payout.paid', data: { payout: { id: payout.id, status: 'PAID' } } });

      const entries = await h.db.ledgerEntry.findMany({ where: { payoutId: payout.id } });
      expect(entries.map((e) => [e.accountId, e.direction]).sort()).toEqual([[KITE, 'CREDIT'], [TREASURY, 'DEBIT']].sort());

      const cancel = await h.gql(token, CANCEL, { id: payout.id }, key());
      expect(cancel.body.errors[0].extensions).toMatchObject({ code: 'PAYOUT_NOT_CANCELLABLE', status: 'PAID' });
    });

    it('cancels a pending payout and never settles it', async () => {
      const created = await h.gql(token, CREATE, { input: { accountId: KITE, amount: 500, reference: 'SELLER-0002' } }, key());
      const id = created.body.data.createPayout.id;
      const cancelled = await h.gql(token, CANCEL, { id }, key());
      expect(cancelled.body.data.cancelPayout).toMatchObject({ id, status: 'CANCELLED' });
      await settleDuePayouts(h.db, { olderThanMs: 0 });
      expect((await h.db.payout.findUniqueOrThrow({ where: { id } })).status).toBe('CANCELLED');
      expect(await h.db.ledgerEntry.count({ where: { payoutId: id } })).toBe(0);
    });

    it('sends payouts above £20,000 to REVIEW', async () => {
      const res = await h.gql(token, CREATE, { input: { accountId: KITE, amount: 2_000_001, reference: 'BIG-1' } }, key());
      expect(res.body.data.createPayout.status).toBe('REVIEW');
    });

    it('refuses payouts larger than the available treasury', async () => {
      const res = await h.gql(token, CREATE, { input: { accountId: KITE, amount: 9_000_000_000, reference: 'TOO-BIG' } }, key());
      expect(res.body.errors[0].extensions.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('refuses to pay the treasury itself', async () => {
      const res = await h.gql(token, CREATE, { input: { accountId: TREASURY, amount: 100, reference: 'X' } }, key());
      expect(res.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
    });
  });

  describe('scopes and partner isolation', () => {
    it('a read-only token can read but not create payouts', async () => {
      const readOnly = await h.token(undefined, 'ledger:read');
      expect((await h.gql(readOnly, '{ payouts(first: 1) { totalCount } }')).body.data.payouts.totalCount).toBeGreaterThan(0);
      const res = await h.gql(readOnly, CREATE, { input: { accountId: KITE, amount: 100, reference: 'X' } }, key());
      expect(res.body.errors[0].extensions).toMatchObject({ code: 'FORBIDDEN', requiredScope: 'payouts:write' });
      expect(res.body.data).toBeNull();
    });

    it('a write-only token cannot read', async () => {
      const writeOnly = await h.token(undefined, 'payouts:write');
      const res = await h.gql(writeOnly, '{ accounts { id } }');
      expect(res.body.errors[0].extensions.code).toBe('FORBIDDEN');
    });

    it('another partner sees none of the demo partner’s data and cannot touch its payouts', async () => {
      const other = await h.token(await h.otherPartner());
      // REVIEW payouts are cancellable (earlier tests settled every PENDING one).
      const demoPayout = await h.db.payout.findFirstOrThrow({ where: { partnerId: DEMO_PARTNER.id, status: 'REVIEW' } });

      const reads = await h.gql(
        other,
        `query ($id: ID!, $acc: ID!) {
          accounts { id }
          payouts(first: 5) { totalCount }
          ledgerEntries(first: 5) { totalCount }
          payout(id: $id) { id }
          account(id: $acc) { id }
        }`,
        { id: demoPayout.id, acc: KITE },
      );
      expect(reads.body.data).toEqual({
        accounts: [],
        payouts: { totalCount: 0 },
        ledgerEntries: { totalCount: 0 },
        payout: null,
        account: null,
      });

      const cancel = await h.gql(other, CANCEL, { id: demoPayout.id }, key());
      expect(cancel.body.errors[0].extensions.code).toBe('NOT_FOUND');
      const pay = await h.gql(other, CREATE, { input: { accountId: KITE, amount: 100, reference: 'X' } }, key());
      expect(pay.body.errors[0].extensions.code).toBe('NOT_FOUND');
      expect((await h.db.payout.findUniqueOrThrow({ where: { id: demoPayout.id } })).status).toBe('REVIEW');
    });
  });
});
