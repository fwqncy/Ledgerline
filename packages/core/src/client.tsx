'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

const DATA_CHANGED = 'ledgerline:data-changed';

/**
 * Tells every mounted module (ticker, front page, nav badges) that data changed,
 * without the modules knowing about each other.
 */
export function useNotifyDataChanged() {
  const router = useRouter();
  return useCallback(() => {
    window.dispatchEvent(new Event(DATA_CHANGED));
    router.refresh();
  }, [router]);
}

/**
 * Gives a module its own tRPC client, query cache and endpoint. Point the endpoint
 * at a separate deployment and the module runs there without the console changing.
 */
export function createModuleClient<TRouter extends AnyTRPCRouter>(endpoint: string) {
  const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<TRouter>();

  function ModuleProvider({ children }: { children: ReactNode }) {
    const [queryClient] = useState(
      () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true } } }),
    );
    const [trpcClient] = useState(() =>
      createTRPCClient<TRouter>({
        // Modules don't use a data transformer, so the transformer-less options are correct for every router.
        links: [httpBatchLink({ url: endpoint } as Parameters<typeof httpBatchLink<TRouter>>[0])],
      }),
    );

    useEffect(() => {
      const refresh = () => void queryClient.invalidateQueries();
      window.addEventListener(DATA_CHANGED, refresh);
      return () => window.removeEventListener(DATA_CHANGED, refresh);
    }, [queryClient]);

    return (
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          {children}
        </TRPCProvider>
      </QueryClientProvider>
    );
  }

  return { ModuleProvider, useTRPC, useTRPCClient };
}

/** Saves text as a file in the viewer's downloads. */
export function downloadFile(filename: string, contents: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
