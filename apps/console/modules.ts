// apps/console/modules.ts
import { frontpage } from '@ledgerline/frontpage';
import { ledger } from '@ledgerline/ledger';
import { payouts } from '@ledgerline/payouts';
import { risk } from '@ledgerline/risk';
import { support } from '@ledgerline/support';

export const modules = [risk, payouts, support];

// The newsroom: the front page and the ledger read across every desk.
export const newsroom = { lead: frontpage, archive: ledger };
