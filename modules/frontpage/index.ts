import { defineModule } from '@ledgerline/core/module';
import { frontPageRouter } from './router';
import { createFrontPageContext } from './trpc';
import { FrontPage } from './ui/FrontPage';

export const frontpage = defineModule({
  manifest: {
    name: 'frontpage',
    title: 'Front Page',
    version: '1.0',
    description: 'The day’s edition: the float, the wire & where the money went.',
  },
  router: frontPageRouter,
  createContext: createFrontPageContext,
  Page: FrontPage,
  hotkey: 'f',
  commands: [
    { label: 'The Ticker: Float Chart', href: '/frontpage#ticker', keywords: 'chart candles balance treasury history' },
    { label: 'Print Today’s Edition', href: '/frontpage?print=1', keywords: 'print report' },
  ],
});

export type { FrontPageRouter } from './router';
