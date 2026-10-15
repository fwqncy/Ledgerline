import { defineModule } from '@ledgerline/core/module';
import { ledgerRouter } from './router';
import { createLedgerContext } from './trpc';
import { LedgerPage } from './ui/LedgerPage';

export const ledger = defineModule({
  manifest: {
    name: 'ledger',
    title: 'Ledger',
    version: '1.0',
    description: 'The audit log & every beneficiary’s lifetime account.',
  },
  router: ledgerRouter,
  createContext: createLedgerContext,
  Page: LedgerPage,
  hotkey: 'l',
  commands: [
    { label: 'Audit Log', href: '/ledger', keywords: 'history events trail who' },
    { label: 'Beneficiary Accounts', href: '/ledger?view=accounts', keywords: 'lifetime totals merchants' },
  ],
});

export type { LedgerRouter } from './router';
