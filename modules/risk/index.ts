import { defineModule } from '@ledgerline/core/module';
import { riskRouter } from './router';
import { createRiskContext } from './trpc';
import { RiskPage } from './ui/RiskPage';

export const risk = defineModule({
  manifest: {
    name: 'risk',
    title: 'Risk',
    version: '2.5',
    description: 'Review payouts held by risk rules.',
  },
  router: riskRouter,
  createContext: createRiskContext,
  Page: RiskPage,
  badge: ({ db }) => db.riskFlag.count({ where: { status: 'open' } }),
  hotkey: 'r',
  commands: [
    { label: 'Open Risk Queue', href: '/risk', keywords: 'held flags review' },
    { label: 'Rejected Payouts', href: '/risk?status=rejected', keywords: 'void blocked' },
  ],
});

export type { RiskRouter } from './router';
