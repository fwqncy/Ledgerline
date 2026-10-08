import { defineModule } from '@ledgerline/core/module';
import { supportRouter } from './router';
import { createSupportContext } from './trpc';
import { SupportPage } from './ui/SupportPage';

export const support = defineModule({
  manifest: {
    name: 'support',
    title: 'Support',
    version: '1.9',
    description: 'Merchant tickets, linked to the payouts they ask about.',
  },
  router: supportRouter,
  createContext: createSupportContext,
  Page: SupportPage,
  badge: ({ db }) => db.ticket.count({ where: { status: 'open' } }),
});

export type { SupportRouter } from './router';
