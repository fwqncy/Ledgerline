import { Box } from '@ledgerline/core/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { choosePartner, DEMO_API_KEY, PARTNER_API_PUBLIC_URL, partnerApi, showDemoKey } from './lib/partner-api';
import { load, PartnerPicker, Pre } from './ui/shared';

export const metadata: Metadata = { title: 'Developers' };

export default async function DevelopersPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: requested } = await searchParams;
  const data = await load(() => Promise.all([partnerApi.partners(), partnerApi.scopes()]));
  if (!data.ok) return data.node;
  const [partners, scopes] = data.value;
  const partner = choosePartner(partners, requested);
  const key = showDemoKey && partner?.id === 'prt_demo' ? DEMO_API_KEY : 'llk_test_…';

  return (
    <>
      {partner && <PartnerPicker partners={partners} current={partner} action="/developers" />}

      <div className="tw:grid tw:gap-6 tw:lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Box label="Quick Start" meta="Three requests">
          <ol className="ll-box__body tw:m-0 tw:grid tw:list-none tw:gap-5 tw:p-4">
            <Step n={1} title="Get an API key">
              Create one under <Link href="/developers/keys" className="ll-link">API Keys</Link> and pick its scopes. It’s shown once;
              store it like a password.
              {showDemoKey && partner?.id === 'prt_demo' && (
                <span className="tw:mt-1 tw:block ll-muted">Locally, the seeded demo key below works too.</span>
              )}
            </Step>
            <Step n={2} title="Swap it for an access token">
              Tokens last 15 minutes. Ask for fewer scopes with <span className="ll-mono">{'{"scope":"ledger:read"}'}</span>.
              <Pre>{`curl -s -X POST ${PARTNER_API_PUBLIC_URL}/auth/token \\
  -H "Authorization: Bearer ${key}"`}</Pre>
            </Step>
            <Step n={3} title="Query /graphql">
              <Pre>{`curl -s ${PARTNER_API_PUBLIC_URL}/graphql \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ balances { account { name } available } }"}'`}</Pre>
              Mutations also need an <span className="ll-mono">Idempotency-Key</span> header. Retrying with the same key never pays twice.
            </Step>
          </ol>
        </Box>

        <div className="tw:grid tw:content-start tw:gap-6">
          <Box label="Scopes">
            <div className="ll-table-wrap">
              <table className="ll-table">
                <thead>
                  <tr>
                    <th scope="col">Scope</th>
                    <th scope="col">Allows</th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.map((s) => (
                    <tr key={s.name}>
                      <td className="ll-mono tw:whitespace-nowrap">{s.name}</td>
                      <td>{s.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>

          <Box label="Webhooks">
            <div className="ll-box__body tw:grid tw:gap-2 tw:p-4">
              <p className="tw:m-0">
                Every payout status change (<span className="ll-mono">payout.created</span>, <span className="ll-mono">.paid</span>,{' '}
                <span className="ll-mono">.cancelled</span>, <span className="ll-mono">.rejected</span>) is queued as a delivery,
                signed with <span className="ll-mono">Ledgerline-Signature</span>, and retried for up to 8 attempts.
              </p>
              <p className="tw:m-0 ll-muted">
                Endpoint:{' '}
                {partner?.webhookUrl ? <span className="ll-mono">{partner.webhookUrl}</span> : 'none set (deliveries are recorded, not sent)'}
              </p>
            </div>
          </Box>

          <Box label="Two APIs, Two Jobs">
            <div className="ll-box__body tw:grid tw:gap-2 tw:p-4">
              <p className="tw:m-0">
                <strong>tRPC</strong> stays the console’s internal API: typed end to end, shipped with the UI, free to change
                whenever a module redeploys.
              </p>
              <p className="tw:m-0">
                <strong>The Partner API</strong> is the public contract: GraphQL with a published schema, API keys & scopes,
                idempotent writes and webhooks. It changes additively, so partners’ integrations keep working.
              </p>
            </div>
          </Box>
        </div>
      </div>
    </>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="tw:grid tw:grid-cols-[2rem_minmax(0,1fr)] tw:gap-3">
      <span
        aria-hidden
        className="tw:grid tw:size-8 tw:place-items-center tw:bg-[var(--ink)] tw:font-[family-name:var(--font-display)] tw:text-lg tw:text-[var(--paper)]"
      >
        {n}
      </span>
      <div className="tw:grid tw:min-w-0 tw:gap-2">
        <h3 className="tw:m-0 tw:text-lg">{title}</h3>
        <div className="tw:grid tw:gap-2">{children}</div>
      </div>
    </li>
  );
}
