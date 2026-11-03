import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Config } from '../config';

const limitExceeded = (message: string) => ({ error: { code: 'RATE_LIMITED', message } });

/**
 * Per-partner limit for the API. Runs after `authenticate`, so `req.auth` is set;
 * falls back to the client IP otherwise.
 * The store is in-memory: fine for one instance, swap in a Redis store to scale out.
 */
export function apiRateLimit(config: Config) {
  return rateLimit({
    windowMs: 60_000,
    limit: config.RATE_LIMIT_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.auth ? `partner:${req.auth.partnerId}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
    message: limitExceeded('Too many requests. Slow down and retry after the time in the RateLimit header.'),
  });
}

/** A tighter per-IP limit on token exchange, to slow down API key guessing. */
export function tokenRateLimit(config: Config) {
  return rateLimit({
    windowMs: 60_000,
    limit: config.TOKEN_RATE_LIMIT_PER_MINUTE,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: limitExceeded('Too many token requests from this address.'),
  });
}
