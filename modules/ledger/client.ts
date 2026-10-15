'use client';

import { createModuleClient } from '@ledgerline/core/client';
import type { LedgerRouter } from './router';

export const { ModuleProvider, useTRPC } = createModuleClient<LedgerRouter>(
  process.env.NEXT_PUBLIC_LEDGER_API_URL ?? '/api/m/ledger',
);
