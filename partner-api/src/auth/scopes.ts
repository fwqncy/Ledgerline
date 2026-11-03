import { GraphQLError } from 'graphql';
import type { ScopeName } from '../seed-data';
import type { AccessClaims } from './tokens';

export interface AuthContext {
  auth: AccessClaims | null;
}

export function requireAuth(ctx: AuthContext): AccessClaims {
  if (!ctx.auth) {
    throw new GraphQLError('Sign in with a partner access token', {
      extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
    });
  }
  return ctx.auth;
}

/** Throws FORBIDDEN unless the caller's token carries `scope`. Call it first in every resolver. */
export function requireScope(ctx: AuthContext, scope: ScopeName): AccessClaims {
  const auth = requireAuth(ctx);
  if (!auth.scopes.includes(scope)) {
    throw new GraphQLError(`This operation needs the ${scope} scope`, {
      extensions: { code: 'FORBIDDEN', requiredScope: scope, http: { status: 403 } },
    });
  }
  return auth;
}
