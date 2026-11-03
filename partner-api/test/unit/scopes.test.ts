import { GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';
import { requireScope } from '../../src/auth/scopes';

const auth = (scopes: ('ledger:read' | 'payouts:write')[]) => ({
  auth: { partnerId: 'prt_a', keyId: 'key_1', scopes, expiresAt: new Date() },
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(GraphQLError);
    return (error as GraphQLError).extensions.code;
  }
  return 'OK';
};

describe('requireScope', () => {
  it('lets a token with the scope through and returns the claims', () => {
    expect(requireScope(auth(['ledger:read']), 'ledger:read').partnerId).toBe('prt_a');
  });

  it('is UNAUTHENTICATED without a token', () => {
    expect(codeOf(() => requireScope({ auth: null }, 'ledger:read'))).toBe('UNAUTHENTICATED');
  });

  it.each([
    [['ledger:read'], 'payouts:write'],
    [['payouts:write'], 'ledger:read'],
    [[], 'ledger:read'],
  ] as const)('is FORBIDDEN when the token has %j but needs %s', (scopes, needed) => {
    expect(codeOf(() => requireScope(auth([...scopes]), needed))).toBe('FORBIDDEN');
  });
});
