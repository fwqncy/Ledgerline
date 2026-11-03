'use server';

import { createBaseContext } from '@ledgerline/core/server';
import { revalidatePath } from 'next/cache';
import { type IssuedKey, PartnerApiNotConfigured, PartnerApiUnavailable, partnerApi } from './lib/partner-api';

/** Server actions are reachable by direct POST, so each one checks who's calling. */
async function operatorContext() {
  const ctx = await createBaseContext('developers');
  if (!ctx.operator) throw new Error('Sign in to manage partner API keys');
  return ctx;
}

const message = (error: unknown) =>
  error instanceof PartnerApiNotConfigured
    ? `${error.message}. Set it on the console to match the Partner API.`
    : error instanceof PartnerApiUnavailable
      ? `${error.message}. Start it with \`npm run partner:dev\`.`
      : error instanceof Error
        ? error.message
        : 'Something went wrong';

export type CreateKeyState = { ok: true; key: IssuedKey } | { ok: false; error: string } | null;

export async function createKeyAction(_prev: CreateKeyState, form: FormData): Promise<CreateKeyState> {
  const ctx = await operatorContext();
  const partnerId = String(form.get('partnerId') ?? '');
  const name = String(form.get('name') ?? '').trim();
  const scopes = form.getAll('scopes').map(String);
  if (!name) return { ok: false, error: 'Give the key a name, so you can tell it apart later.' };
  if (name.length > 80) return { ok: false, error: 'Keep the name to 80 characters or fewer.' };
  if (!scopes.length) return { ok: false, error: 'Pick at least one scope.' };

  try {
    const key = await partnerApi.createKey(partnerId, name, scopes);
    await ctx.audit('partner.key.create', key.id, `${partnerId} · ${name} · ${scopes.join(' ')}`);
    revalidatePath('/developers/keys');
    return { ok: true, key };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}

export async function revokeKeyAction(form: FormData): Promise<void> {
  const ctx = await operatorContext();
  const partnerId = String(form.get('partnerId') ?? '');
  const keyId = String(form.get('keyId') ?? '');
  await partnerApi.revokeKey(partnerId, keyId);
  await ctx.audit('partner.key.revoke', keyId, partnerId);
  revalidatePath('/developers/keys');
}

export type RunQueryState =
  | { ok: true; status: number; replayed: boolean; rateLimit: string | null; ms: number; body: string; scope: string }
  | { ok: false; error: string }
  | null;

const MAX_QUERY = 20_000;

/**
 * The playground runs queries from the console's server, the same two steps a partner
 * makes: API key → access token → /graphql. The key is used for this request only.
 */
export async function runQueryAction(_prev: RunQueryState, form: FormData): Promise<RunQueryState> {
  await operatorContext();
  const apiKey = String(form.get('apiKey') ?? '').trim();
  const query = String(form.get('query') ?? '');
  const rawVariables = String(form.get('variables') ?? '').trim();
  const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim() || undefined;

  if (!apiKey) return { ok: false, error: 'Paste an API key. Create one under API Keys.' };
  if (!query.trim()) return { ok: false, error: 'Write a query first.' };
  if (query.length > MAX_QUERY) return { ok: false, error: 'That query is too long for the playground.' };

  let variables: unknown = {};
  if (rawVariables) {
    try {
      variables = JSON.parse(rawVariables);
    } catch {
      return { ok: false, error: 'Variables must be valid JSON, e.g. {"first": 10}.' };
    }
  }

  try {
    const started = performance.now();
    const token = await partnerApi.token(apiKey);
    if (!token.ok) return { ok: false, error: `Sign-in failed (${token.status}): ${token.message}` };
    const res = await partnerApi.graphql(token.token, query, variables, idempotencyKey);
    let body = res.body;
    try {
      body = JSON.stringify(JSON.parse(res.body), null, 2);
    } catch {
      // Not JSON: show it as it came.
    }
    return { ok: true, status: res.status, replayed: res.replayed, rateLimit: res.rateLimit, ms: Math.round(performance.now() - started), body, scope: token.scope };
  } catch (error) {
    return { ok: false, error: message(error) };
  }
}
