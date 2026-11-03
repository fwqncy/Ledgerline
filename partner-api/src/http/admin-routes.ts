import { createHash, timingSafeEqual } from 'node:crypto';
import { type NextFunction, type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { ALL_SCOPES, createApiKey } from '../auth/keys';
import type { Config } from '../config';
import type { Db } from '../db';
import { SCOPES } from '../seed-data';
import { reviewPayout } from '../services/payouts';
import { payoutJson } from '../services/webhooks';
import { bearerToken, sendError } from './authenticate';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Admin routes are for the developer portal's server side only, never for partners. */
function requireAdmin(config: Config) {
  const expected = digest(config.PARTNER_ADMIN_TOKEN);
  return (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token || !timingSafeEqual(digest(token), expected)) return sendError(res, 401, 'UNAUTHENTICATED', 'Admin token required');
    next();
  };
}

const createKeyBody = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.enum(ALL_SCOPES as [string, ...string[]])).min(1),
});

const publicKey = (k: {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  scopes: { scope: string }[];
}) => ({
  id: k.id,
  name: k.name,
  prefix: k.prefix,
  scopes: k.scopes.map((s) => s.scope),
  createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt,
  revokedAt: k.revokedAt,
});

export function adminRoutes(db: Db, config: Config) {
  const router = Router();
  router.use('/admin', requireAdmin(config));

  router.get('/admin/scopes', (_req, res) => {
    res.json({ scopes: SCOPES });
  });

  router.get('/admin/partners', async (_req, res) => {
    const partners = await db.partner.findMany({ select: { id: true, name: true, webhookUrl: true }, orderBy: { createdAt: 'asc' } });
    res.json({ partners });
  });

  router.get('/admin/partners/:partnerId/keys', async (req, res) => {
    const keys = await db.apiKey.findMany({
      where: { partnerId: req.params.partnerId },
      include: { scopes: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ keys: keys.map(publicKey) });
  });

  router.post('/admin/partners/:partnerId/keys', async (req, res) => {
    const parsed = createKeyBody.safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'BAD_REQUEST', parsed.error.issues.map((i) => i.message).join('; '));
    const partner = await db.partner.findUnique({ where: { id: req.params.partnerId } });
    if (!partner) return sendError(res, 404, 'NOT_FOUND', 'No such partner');

    const issued = await createApiKey(db, config.API_KEY_PEPPER, {
      partnerId: partner.id,
      name: parsed.data.name,
      scopes: parsed.data.scopes as (typeof ALL_SCOPES)[number][],
    });
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ key: issued });
  });

  router.delete('/admin/partners/:partnerId/keys/:keyId', async (req, res) => {
    const key = await db.apiKey.findFirst({ where: { id: req.params.keyId, partnerId: req.params.partnerId } });
    if (!key) return sendError(res, 404, 'NOT_FOUND', 'No such key');
    const revoked = await db.apiKey.update({
      where: { id: key.id },
      data: { revokedAt: key.revokedAt ?? new Date() },
      include: { scopes: true },
    });
    res.json({ key: publicKey(revoked) });
  });

  router.patch('/admin/partners/:partnerId', async (req, res) => {
    const parsed = z.object({ webhookUrl: z.url({ protocol: /^https?$/ }).nullable() }).safeParse(req.body);
    if (!parsed.success) return sendError(res, 400, 'BAD_REQUEST', 'webhookUrl must be an http(s) URL or null');
    const partner = await db.partner.update({
      where: { id: req.params.partnerId },
      data: { webhookUrl: parsed.data.webhookUrl },
      select: { id: true, name: true, webhookUrl: true },
    }).catch(() => null);
    if (!partner) return sendError(res, 404, 'NOT_FOUND', 'No such partner');
    res.json({ partner });
  });

  // The review desk: approve (back to PENDING, so it settles) or reject a REVIEW payout.
  router.post('/admin/payouts/:payoutId/review', async (req, res) => {
    const decision = req.body?.decision;
    if (decision !== 'approve' && decision !== 'reject') return sendError(res, 400, 'BAD_REQUEST', 'decision must be approve or reject');
    try {
      res.json({ payout: payoutJson(await reviewPayout(db, req.params.payoutId, decision)) });
    } catch (error) {
      sendError(res, 409, 'PAYOUT_NOT_IN_REVIEW', error instanceof Error ? error.message : 'Not in review');
    }
  });

  return router;
}
