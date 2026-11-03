import 'server-only';

/** Where the console's server reaches the Partner API. */
export const PARTNER_API_URL = (process.env.PARTNER_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
/** The URL partners use, shown in docs & curl examples. */
export const PARTNER_API_PUBLIC_URL = (process.env.PARTNER_API_PUBLIC_URL ?? PARTNER_API_URL).replace(/\/$/, '');

const ADMIN_TOKEN = process.env.PARTNER_ADMIN_TOKEN ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-admin-token');

export const DEMO_API_KEY = 'llk_test_demo0001_LocalDevOnlyDoNotUseInProd000000';
export const showDemoKey = process.env.NODE_ENV !== 'production';

export interface Partner {
  id: string;
  name: string;
  webhookUrl: string | null;
}

export interface Scope {
  name: string;
  description: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface IssuedKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  key: string;
}

/** The Partner API isn't reachable (not running, wrong URL). */
export class PartnerApiUnavailable extends Error {}

/** The console has no admin token for the Partner API, or the wrong one. */
export class PartnerApiNotConfigured extends Error {}

async function request(path: string, init: RequestInit = {}, { admin = true } = {}): Promise<Response> {
  try {
    return await fetch(`${PARTNER_API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
      headers: {
        'Content-Type': 'application/json',
        ...(admin ? { Authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new PartnerApiUnavailable(`Couldn't reach the Partner API at ${PARTNER_API_URL}`);
  }
}

async function admin<T>(path: string, init?: RequestInit): Promise<T> {
  if (!ADMIN_TOKEN) throw new PartnerApiNotConfigured('PARTNER_ADMIN_TOKEN is not set');
  const res = await request(path, init);
  if (res.status === 401) throw new PartnerApiNotConfigured('The Partner API rejected PARTNER_ADMIN_TOKEN');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message ?? `Partner API returned ${res.status}`);
  return body as T;
}

export const partnerApi = {
  partners: () => admin<{ partners: Partner[] }>('/admin/partners').then((r) => r.partners),
  scopes: () => admin<{ scopes: Scope[] }>('/admin/scopes').then((r) => r.scopes),
  keys: (partnerId: string) =>
    admin<{ keys: ApiKey[] }>(`/admin/partners/${encodeURIComponent(partnerId)}/keys`).then((r) => r.keys),
  createKey: (partnerId: string, name: string, scopes: string[]) =>
    admin<{ key: IssuedKey }>(`/admin/partners/${encodeURIComponent(partnerId)}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name, scopes }),
    }).then((r) => r.key),
  revokeKey: (partnerId: string, keyId: string) =>
    admin<{ key: ApiKey }>(`/admin/partners/${encodeURIComponent(partnerId)}/keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    }).then((r) => r.key),

  async schema(): Promise<string> {
    const res = await request('/schema.graphql', {}, { admin: false });
    if (!res.ok) throw new Error(`Partner API returned ${res.status} for the schema`);
    return res.text();
  },

  /** Exchanges a partner API key for an access token, exactly as a partner would. */
  async token(apiKey: string): Promise<{ ok: true; token: string; scope: string } | { ok: false; status: number; message: string }> {
    const res = await request('/auth/token', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` } }, { admin: false });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, status: res.status, message: body?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, token: body.access_token, scope: body.scope };
  },

  async graphql(token: string, query: string, variables: unknown, idempotencyKey?: string) {
    const res = await request(
      '/graphql',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        body: JSON.stringify({ query, variables }),
      },
      { admin: false },
    );
    return {
      status: res.status,
      replayed: res.headers.get('idempotent-replayed') === 'true',
      rateLimit: res.headers.get('ratelimit'),
      body: await res.text(),
    };
  },
};

/** Picks the partner from `?partner=`, falling back to the first one. */
export function choosePartner(partners: Partner[], requested: string | undefined): Partner | undefined {
  return partners.find((p) => p.id === requested) ?? partners[0];
}
