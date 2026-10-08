import { createBaseContext } from '@ledgerline/core/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { findModule } from '@/lib/registry';

// Set when this deployment serves a module's API to a console hosted on another origin.
const corsOrigin = process.env.LEDGERLINE_CORS_ORIGIN;
const corsHeaders: Record<string, string> = corsOrigin
  ? {
      'access-control-allow-origin': corsOrigin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, trpc-accept',
    }
  : {};

// Each module is served from its own endpoint (/api/m/<module>) with its own router and context.
async function handler(req: Request, { params }: { params: Promise<{ module: string }> }) {
  const { module: name } = await params;
  const mod = findModule(name);
  if (!mod) return Response.json({ error: `Module "${name}" is not mounted` }, { status: 404, headers: corsHeaders });

  return fetchRequestHandler({
    endpoint: `/api/m/${name}`,
    req,
    router: mod.router,
    createContext: async () => mod.createContext(await createBaseContext(name)),
    responseMeta: () => ({ headers: new Headers(corsHeaders) }),
    onError: ({ error, path }) => {
      if (error.code === 'INTERNAL_SERVER_ERROR') console.error(`[${name}] ${path ?? '?'}:`, error);
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export { handler as GET, handler as POST };
