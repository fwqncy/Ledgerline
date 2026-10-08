'use client';

import { createModuleClient } from '@ledgerline/core/client';
import type { RiskRouter } from './router';

export const { ModuleProvider, useTRPC } = createModuleClient<RiskRouter>(
  process.env.NEXT_PUBLIC_RISK_API_URL ?? '/api/m/risk',
);
