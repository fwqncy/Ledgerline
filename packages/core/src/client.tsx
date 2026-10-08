'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState, type ReactNode } from 'react';

/**
 * Gives a module its own tRPC client, query cache and endpoint. Point the endpoint
 * at a separate deployment and the module runs there without the console changing.
 */
export function createModuleClient<TRouter extends AnyTRPCRouter>(endpoint: string) {
  const { TRPCProvider, useTRPC } = createTRPCContext<TRouter>();

  function ModuleProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
      () => new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 1 } } }),
    );
    const [trpcClient] = useState(() =>
      createTRPCClient<TRouter>({
        // Modules don't use a data transformer, so the transformer-less options are correct for every router.
        links: [httpBatchLink({ url: endpoint } as Parameters<typeof httpBatchLink<TRouter>>[0])],
      }),
    );
    return (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    );
  }

  return { ModuleProvider, useTRPC };
}
