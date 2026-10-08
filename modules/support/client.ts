'use client';

import { createModuleClient } from '@ledgerline/core/client';
import type { SupportRouter } from './router';

export const { ModuleProvider, useTRPC } = createModuleClient<SupportRouter>(
  process.env.NEXT_PUBLIC_SUPPORT_API_URL ?? '/api/m/support',
);
