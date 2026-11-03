import { Box } from '@ledgerline/core/ui';
import type { ReactNode } from 'react';
import { type Partner, PARTNER_API_URL, PartnerApiNotConfigured, PartnerApiUnavailable } from '../lib/partner-api';

/** Runs a Partner API call for a page, turning "not running" into a friendly box instead of an error screen. */
export async function load<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; node: ReactNode }> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (error instanceof PartnerApiNotConfigured) return { ok: false, node: <NotConfigured reason={error.message} /> };
    if (!(error instanceof PartnerApiUnavailable)) throw error;
    return { ok: false, node: <Unavailable /> };
  }
}

export function NotConfigured({ reason }: { reason: string }) {
  return (
    <Box label="Partner API Not Configured">
      <div className="ll-box__body tw:grid tw:gap-3 tw:p-4">
        <p className="ll-callout">{reason}.</p>
        <p className="tw:m-0">
          Set <span className="ll-mono">PARTNER_ADMIN_TOKEN</span> on the console to the same value the Partner API uses. In
          development both default to <span className="ll-mono">dev-admin-token</span>; in production there is no default.
        </p>
      </div>
    </Box>
  );
}

export function Unavailable() {
  return (
    <Box label="Partner API Offline">
      <div className="ll-box__body tw:grid tw:gap-3 tw:p-4">
        <p className="ll-callout">
          The console couldn’t reach the Partner API at <span className="ll-mono">{PARTNER_API_URL}</span>.
        </p>
        <p>Start Postgres and the API, then reload:</p>
        <Pre>{`docker compose up -d postgres\nnpm run partner:setup   # first time: migrate & seed\nnpm run partner:dev`}</Pre>
        <p className="ll-muted">
          Set <span className="ll-mono">PARTNER_API_URL</span> if it runs somewhere else.
        </p>
      </div>
    </Box>
  );
}

export function Pre({ children, label }: { children: string; label?: string }) {
  return (
    <pre
      aria-label={label}
      className="ll-mono tw:m-0 tw:overflow-x-auto tw:whitespace-pre tw:border-[1.5px] tw:border-[var(--rule)] tw:bg-[var(--paper-2)] tw:p-3 tw:text-[13px] tw:leading-relaxed"
      translate="no"
    >
      {children}
    </pre>
  );
}

/** A GET form, so the partner choice lives in the URL and works without JavaScript. */
export function PartnerPicker({ partners, current, action }: { partners: Partner[]; current: Partner; action: string }) {
  if (partners.length < 2) {
    return (
      <p className="ll-muted tw:m-0">
        Partner: <strong className="tw:text-[var(--ink)]">{current.name}</strong> <span className="ll-mono">({current.id})</span>
      </p>
    );
  }
  return (
    <form action={action} className="tw:flex tw:flex-wrap tw:items-end tw:gap-2">
      <label className="ll-field tw:m-0">
        <span className="ll-label">Partner</span>
        <select name="partner" defaultValue={current.id} className="ll-select">
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="ll-button ll-button--small">
        Switch
      </button>
    </form>
  );
}
