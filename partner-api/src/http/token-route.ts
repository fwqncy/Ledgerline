import { Router } from 'express';
import { authenticateApiKey, isScope } from '../auth/keys';
import { signAccessToken } from '../auth/tokens';
import type { Config } from '../config';
import type { Db } from '../db';
import { bearerToken, sendError } from './authenticate';

/**
 * POST /auth/token
 *   Authorization: Bearer <api key>
 *   { "scope": "ledger:read" }   // optional: ask for fewer scopes than the key has
 *
 * Returns an OAuth2-style token response with a short-lived JWT.
 */
export function tokenRoute(db: Db, config: Config) {
  const router = Router();
  router.post('/auth/token', async (req, res) => {
    const apiKey = bearerToken(req) ?? (typeof req.body?.api_key === 'string' ? req.body.api_key : null);
    if (!apiKey) return sendError(res, 401, 'UNAUTHENTICATED', 'Send your API key as Authorization: Bearer <api key>');

    const principal = await authenticateApiKey(db, config.API_KEY_PEPPER, apiKey);
    if (!principal) return sendError(res, 401, 'INVALID_API_KEY', 'The API key is invalid or has been revoked');

    let scopes = principal.scopes;
    if (req.body?.scope !== undefined) {
      const requested = String(req.body.scope).split(/\s+/).filter(Boolean);
      const unknown = requested.filter((s) => !isScope(s));
      if (unknown.length) return sendError(res, 400, 'INVALID_SCOPE', `Unknown scope: ${unknown.join(', ')}`);
      const notGranted = requested.filter((s) => !principal.scopes.includes(s as never));
      if (notGranted.length) return sendError(res, 403, 'INVALID_SCOPE', `This key does not have: ${notGranted.join(', ')}`);
      scopes = principal.scopes.filter((s) => requested.includes(s));
    }

    const { token } = await signAccessToken(
      { partnerId: principal.partnerId, keyId: principal.keyId, scopes },
      { secret: config.JWT_SECRET, ttlSeconds: config.TOKEN_TTL_SECONDS },
    );
    res.set('Cache-Control', 'no-store');
    res.json({ access_token: token, token_type: 'Bearer', expires_in: config.TOKEN_TTL_SECONDS, scope: scopes.join(' ') });
  });
  return router;
}
