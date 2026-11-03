import type { Funding, Payout as CorePayout } from '@ledgerline/core/db';
import { KNOWN_BENEFICIARIES, seed } from '@ledgerline/core/seed';
import type { AccountKind, EntryDirection, PayoutStatus } from './generated/prisma/client';

export const DEMO_PARTNER = { id: 'prt_demo', name: 'Demo Marketplace' } as const;

export const SCOPES = [
  { name: 'ledger:read', description: 'Read accounts, balances, ledger entries, payouts and webhook deliveries.' },
  { name: 'payouts:write', description: 'Create and cancel payouts.' },
] as const;

export type ScopeName = (typeof SCOPES)[number]['name'];

export interface AccountRow {
  id: string;
  partnerId: string;
  kind: AccountKind;
  name: string;
  number: string;
  city: string | null;
  country: string;
  currency: string;
}

export interface PayoutRow {
  id: string;
  partnerId: string;
  accountId: string;
  amount: bigint;
  currency: string;
  status: PayoutStatus;
  reference: string;
  method: string;
  createdBy: string;
  createdAt: Date;
  paidAt: Date | null;
}

export interface EntryRow {
  id: string;
  accountId: string;
  payoutId: string | null;
  direction: EntryDirection;
  amount: bigint;
  currency: string;
  description: string;
  occurredAt: Date;
}

const slug = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

export const treasuryAccountId = (partnerId: string) => `acc_${partnerId.replace(/^prt_/, '')}_treasury`;
export const beneficiaryAccountId = (name: string) => `acc_${slug(name)}`;

/**
 * Turns the console's deterministic seed into Partner API rows for one partner.
 * Double entry: funding credits the treasury; a paid payout debits the treasury
 * and credits the beneficiary.
 */
export function buildLedgerSeed(
  partnerId: string,
  data: { payouts: CorePayout[]; funding: Funding[] } = seed(),
): { accounts: AccountRow[]; payouts: PayoutRow[]; entries: EntryRow[] } {
  const treasuryId = treasuryAccountId(partnerId);
  const accounts = new Map<string, AccountRow>();
  accounts.set(treasuryId, {
    id: treasuryId,
    partnerId,
    kind: 'TREASURY',
    name: 'Treasury float',
    number: 'GB •• 0001',
    city: 'London',
    country: 'GB',
    currency: 'GBP',
  });

  const known = new Map(KNOWN_BENEFICIARIES.map((b) => [b.name, b]));
  const beneficiary = (p: CorePayout) => {
    const id = beneficiaryAccountId(p.beneficiary);
    if (!accounts.has(id)) {
      const k = known.get(p.beneficiary);
      accounts.set(id, {
        id,
        partnerId,
        kind: 'BENEFICIARY',
        name: p.beneficiary,
        number: k?.account ?? p.account,
        city: k?.city ?? p.city,
        country: k?.country ?? p.country,
        currency: p.currency,
      });
    }
    return id;
  };

  const entries: EntryRow[] = data.funding.map((f) => ({
    id: `ent_${f.id}`,
    accountId: treasuryId,
    payoutId: null,
    direction: 'CREDIT',
    amount: BigInt(f.amount),
    currency: 'GBP',
    description: f.source,
    occurredAt: new Date(f.at),
  }));

  const payouts: PayoutRow[] = data.payouts.map((p) => {
    const accountId = beneficiary(p);
    if (p.status === 'paid' && p.paidAt) {
      const occurredAt = new Date(p.paidAt);
      const description = `Payout ${p.id} · ${p.reference}`;
      entries.push(
        { id: `ent_${p.id}_dr`, accountId: treasuryId, payoutId: p.id, direction: 'DEBIT', amount: BigInt(p.amount), currency: p.currency, description, occurredAt },
        { id: `ent_${p.id}_cr`, accountId, payoutId: p.id, direction: 'CREDIT', amount: BigInt(p.amount), currency: p.currency, description, occurredAt },
      );
    }
    return {
      id: p.id,
      partnerId,
      accountId,
      amount: BigInt(p.amount),
      currency: p.currency,
      status: p.status.toUpperCase() as PayoutStatus,
      reference: p.reference,
      method: p.method,
      createdBy: p.createdBy,
      createdAt: new Date(p.createdAt),
      paidAt: p.paidAt ? new Date(p.paidAt) : null,
    };
  });

  return { accounts: [...accounts.values()], payouts, entries };
}
