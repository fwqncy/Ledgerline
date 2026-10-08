import type { AnyTRPCRouter, inferRouterContext } from '@trpc/server';
import type { ComponentType } from 'react';
import type { BaseContext } from './server';

export interface ModuleManifest {
  name: string;
  title: string;
  version: string;
  description: string;
}

/** The contract every console module implements. The console only ever talks to this. */
export interface ConsoleModule<TRouter extends AnyTRPCRouter = AnyTRPCRouter> {
  manifest: ModuleManifest;
  router: TRouter;
  createContext: (base: BaseContext) => inferRouterContext<TRouter>;
  Page: ComponentType;
  /** Count shown next to the module in the sidebar. */
  badge?: (base: BaseContext) => Promise<number>;
  deployedAt: string;
}

export function defineModule<TRouter extends AnyTRPCRouter>(
  module: Omit<ConsoleModule<TRouter>, 'deployedAt'>,
): ConsoleModule<TRouter> {
  return { ...module, deployedAt: process.env.LEDGERLINE_DEPLOYED_AT ?? new Date().toISOString() };
}
