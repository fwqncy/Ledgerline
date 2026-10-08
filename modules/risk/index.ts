import { defineModule } from '@ledgerline/core/module';
import { riskRouter } from './router';
import { createRiskContext } from './trpc';
import { RiskPage } from './ui/RiskPage';

export const risk = defineModule({
  manifest: {
    name: 'risk',
    title: 'Risk',
    version: '2.4',
    description: 'Review payouts held by risk rules.',
  },
  router: riskRouter,
  createContext: createRiskContext,
  Page: RiskPage,
  badge: ({ db }) => db.riskFlag.count({ where: { status: 'open' } }),
});

export type { RiskRouter } from './router';
