import type { AnyTRPCRouter, inferRouterContext } from '@trpc/server';
import type { ComponentType } from 'react';
import type { BaseContext } from './server';

export interface ModuleManifest {
  name: string;
  title: string;
  version: string;
  description: string;
}

/** A result a module contributes to the console's global search. */
export interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  kind: string;
}

/** A static entry a module adds to the command palette. */
export interface ModuleCommand {
  label: string;
  href: string;
  keywords?: string;
  shortcut?: string;
}

/** The contract every console module implements. The console only ever talks to this. */
export interface ConsoleModule<TRouter extends AnyTRPCRouter = AnyTRPCRouter> {
  manifest: ModuleManifest;
  router: TRouter;
  createContext: (base: BaseContext) => inferRouterContext<TRouter>;
  Page: ComponentType;
  /** Count shown next to the module in the navigation. */
  badge?: (base: BaseContext) => Promise<number>;
  search?: (base: BaseContext, query: string) => Promise<SearchResult[]>;
  commands?: ModuleCommand[];
  /** Single-key shortcut used after "G" to jump to this module. */
  hotkey?: string;
  deployedAt: string;
}

export function defineModule<TRouter extends AnyTRPCRouter>(
  module: Omit<ConsoleModule<TRouter>, 'deployedAt'>,
): ConsoleModule<TRouter> {
  return { ...module, deployedAt: process.env.LEDGERLINE_DEPLOYED_AT ?? new Date().toISOString() };
}
