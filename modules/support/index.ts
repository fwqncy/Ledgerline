import { defineModule } from '@ledgerline/core/module';
import { supportRouter } from './router';
import { createSupportService } from './service';
import { createSupportContext } from './trpc';
import { SupportPage } from './ui/SupportPage';

export const support = defineModule({
  manifest: {
    name: 'support',
    title: 'Support',
    version: '2.0',
    description: 'Merchant tickets, linked to the payouts they ask about.',
  },
  router: supportRouter,
  createContext: createSupportContext,
  Page: SupportPage,
  badge: ({ db }) => db.ticket.count({ where: { status: 'open' } }),
  search: (base, query) => createSupportService(base).search(query),
  hotkey: 's',
  commands: [
    { label: 'Open Tickets', href: '/support?status=open', keywords: 'merchants inbox help' },
    { label: 'Tickets Waiting on Merchants', href: '/support?status=waiting', keywords: 'replied pending' },
  ],
});

export type { SupportRouter } from './router';
