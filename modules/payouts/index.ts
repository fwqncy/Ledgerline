import { defineModule } from '@ledgerline/core/module';
import { payoutsRouter } from './router';
import { createPayoutService } from './service';
import { createPayoutsContext } from './trpc';
import { PayoutsPage } from './ui/PayoutsPage';

export const payouts = defineModule({
  manifest: {
    name: 'payouts',
    title: 'Payouts',
    version: '4.0',
    description: 'Review, approve & create outgoing payouts.',
  },
  router: payoutsRouter,
  createContext: createPayoutsContext,
  Page: PayoutsPage,
  badge: ({ db }) => db.payout.count({ where: { status: 'pending' } }),
  search: (base, query) => createPayoutService(base).search(query),
  hotkey: 'p',
  commands: [
    { label: 'New Payout', href: '/payouts?new=1', keywords: 'create send pay', shortcut: 'N' },
    { label: 'Payouts Awaiting Approval', href: '/payouts?status=pending', keywords: 'pending queue' },
    { label: 'Largest Payouts', href: '/payouts?sort=largest', keywords: 'biggest amount' },
  ],
});

export type { PayoutsRouter } from './router';
