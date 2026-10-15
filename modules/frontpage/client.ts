'use client';

import { createModuleClient } from '@ledgerline/core/client';
import type { FrontPageRouter } from './router';

export const { ModuleProvider, useTRPC } = createModuleClient<FrontPageRouter>(
  process.env.NEXT_PUBLIC_FRONTPAGE_API_URL ?? '/api/m/frontpage',
);
