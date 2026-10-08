import { defineModule } from '@ledgerline/core/module';
import { payoutsRouter } from './router';
import { createPayoutsContext } from './trpc';
import { PayoutsPage } from './ui/PayoutsPage';

export const payouts = defineModule({
  manifest: {
    name: 'payouts',
    title: 'Payouts',
    version: '3.12',
    description: 'Review and approve outgoing payouts.',
  },
  router: payoutsRouter,
  createContext: createPayoutsContext,
  Page: PayoutsPage,
  badge: ({ db }) => db.payout.count({ where: { status: 'pending' } }),
});

export type { PayoutsRouter } from './router';
