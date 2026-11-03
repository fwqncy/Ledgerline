import { jwtVerify, SignJWT } from 'jose';
import type { ScopeName } from '../seed-data';
import { isScope } from './keys';

const ISSUER = 'ledgerline-partner-api';
const AUDIENCE = 'ledgerline-partners';

export interface AccessClaims {
  partnerId: string;
  keyId: string;
  scopes: ScopeName[];
  expiresAt: Date;
}

const secretKey = (secret: string) => new TextEncoder().encode(secret);

export async function signAccessToken(
  input: { partnerId: string; keyId: string; scopes: ScopeName[] },
  options: { secret: string; ttlSeconds: number; now?: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const exp = issuedAt + options.ttlSeconds;
  const token = await new SignJWT({ scope: input.scopes.join(' ') })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(input.partnerId)
    .setJti(input.keyId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(exp)
    .sign(secretKey(options.secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

/** Verifies signature, issuer, audience and expiry. Throws on any failure. */
export async function verifyAccessToken(token: string, secret: string, now?: Date): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: ['HS256'],
    currentDate: now,
  });
  if (!payload.sub || !payload.jti || typeof payload.scope !== 'string' || !payload.exp) {
    throw new Error('Token is missing required claims');
  }
  return {
    partnerId: payload.sub,
    keyId: payload.jti,
    scopes: payload.scope.split(' ').filter(isScope),
    expiresAt: new Date(payload.exp * 1000),
  };
}
