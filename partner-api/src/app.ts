import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginLandingPageDisabled } from '@apollo/server/plugin/disabled';
import { expressMiddleware } from '@as-integrations/express5';
import express from 'express';
import type { Config } from './config';
import type { Db } from './db';
import type { Context } from './graphql/context';
import { createLoaders } from './graphql/loaders';
import { resolvers, typeDefs } from './graphql/schema';
import { adminRoutes } from './http/admin-routes';
import { authenticate } from './http/authenticate';
import { apiRateLimit, tokenRateLimit } from './http/rate-limit';
import { tokenRoute } from './http/token-route';

export interface PartnerApi {
  app: express.Express;
  apollo: ApolloServer<Context>;
}

/** Builds the Express app with Apollo mounted at /graphql. Call `apollo.stop()` when done. */
export async function createPartnerApi(db: Db, config: Config): Promise<PartnerApi> {
  const apollo = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    // The schema is the public contract; partners may introspect it once signed in.
    introspection: true,
    includeStacktraceInErrorResponses: config.NODE_ENV === 'development',
    plugins: [ApolloServerPluginLandingPageDisabled()],
  });
  await apollo.start();

  const app = express();
  app.disable('x-powered-by');
  // Behind docker / a load balancer, trust one proxy hop so rate limits see the client IP.
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '100kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // The schema is the public contract, so it's readable without signing in.
  app.get('/schema.graphql', (_req, res) => {
    res.type('text/plain').send(typeDefs);
  });

  app.use('/auth/token', tokenRateLimit(config));
  app.use(tokenRoute(db, config));
  app.use(adminRoutes(db, config));

  app.use(
    '/graphql',
    authenticate(db, config),
    apiRateLimit(config),
    expressMiddleware(apollo, {
      context: async ({ req, res }) => ({
        db,
        config,
        auth: req.auth ?? null,
        loaders: createLoaders(db, req.auth?.partnerId ?? null),
        idempotencyKey: req.get('idempotency-key') ?? null,
        setHeader: (name, value) => void res.setHeader(name, value),
      }),
    }),
  );

  return { app, apollo };
}
