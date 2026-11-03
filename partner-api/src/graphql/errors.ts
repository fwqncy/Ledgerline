import { GraphQLError } from 'graphql';

/** A client-facing error with a stable `extensions.code` partners can branch on. */
export function apiError(code: string, message: string, status = 400, extra: Record<string, unknown> = {}) {
  return new GraphQLError(message, { extensions: { code, ...extra, http: { status } } });
}

export const badInput = (message: string, extra: Record<string, unknown> = {}) => apiError('BAD_USER_INPUT', message, 400, extra);

export const notFound = (what: string, id: string) => apiError('NOT_FOUND', `${what} ${id} not found`, 404);
