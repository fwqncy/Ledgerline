'use client';

import { createModuleClient } from '@ledgerline/core/client';
import type { PayoutsRouter } from './router';

export const { ModuleProvider, useTRPC } = createModuleClient<PayoutsRouter>(
  process.env.NEXT_PUBLIC_PAYOUTS_API_URL ?? '/api/m/payouts',
);
