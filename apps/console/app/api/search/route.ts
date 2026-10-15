import { createBaseContext } from '@ledgerline/core/server';
import type { NextRequest } from 'next/server';
import { mountedModules } from '@/lib/registry';

/** Global search: asks every mounted module that can search, in parallel. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2 || q.length > 80) return Response.json({ results: [] });

  const results = await Promise.all(
    mountedModules
      .filter((m) => m.search)
      .map(async (m) => {
        try {
          return await m.search!(await createBaseContext(m.manifest.name), q);
        } catch {
          return []; // One module failing shouldn't empty the whole search.
        }
      }),
  );
  return Response.json({ results: results.flat() });
}
