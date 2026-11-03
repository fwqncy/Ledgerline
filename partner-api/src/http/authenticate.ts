import type { NextFunction, Request, Response } from 'express';
import type { AccessClaims } from '../auth/tokens';
import { verifyAccessToken } from '../auth/tokens';
import type { Config } from '../config';
import type { Db } from '../db';

declare global {
  namespace Express {
    interface Request {
      auth?: AccessClaims;
    }
  }
}

export function bearerToken(req: Request): string | null {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match ? match[1]! : null;
}

export function sendError(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ error: { code, message } });
}

/**
 * Requires a valid partner access token. Also checks the API key behind it
 * hasn't been revoked since, so revocation takes effect immediately rather
 * than when the token expires.
 */
export function authenticate(db: Db, config: Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) {
      res.set('WWW-Authenticate', 'Bearer realm="ledgerline-partner-api"');
      return sendError(res, 401, 'UNAUTHENTICATED', 'Send Authorization: Bearer <access token> (POST /auth/token to get one)');
    }
    let claims: AccessClaims;
    try {
      claims = await verifyAccessToken(token, config.JWT_SECRET);
    } catch {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return sendError(res, 401, 'INVALID_TOKEN', 'The access token is invalid or has expired');
    }
    const key = await db.apiKey.findUnique({ where: { id: claims.keyId }, select: { partnerId: true, revokedAt: true } });
    if (!key || key.revokedAt || key.partnerId !== claims.partnerId) {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      return sendError(res, 401, 'KEY_REVOKED', 'The API key behind this token has been revoked');
    }
    req.auth = claims;
    next();
  };
}
