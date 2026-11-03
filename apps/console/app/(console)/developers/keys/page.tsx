import { Box, Empty, RelativeTime } from '@ledgerline/core/ui';
import type { Metadata } from 'next';
import { choosePartner, partnerApi } from '../lib/partner-api';
import { CreateKeyForm } from '../ui/CreateKeyForm';
import { RevokeButton } from '../ui/RevokeButton';
import { load, PartnerPicker } from '../ui/shared';

export const metadata: Metadata = { title: 'API Keys · Developers' };

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ partner?: string }> }) {
  const { partner: requested } = await searchParams;
  const base = await load(() => Promise.all([partnerApi.partners(), partnerApi.scopes()]));
  if (!base.ok) return base.node;
  const [partners, scopes] = base.value;
  const partner = choosePartner(partners, requested);
  if (!partner) return <Empty>No partners yet. Run the Partner API seed to create the demo partner.</Empty>;
  const keys = await partnerApi.keys(partner.id);
  const active = keys.filter((k) => !k.revokedAt).length;

  return (
    <>
      <PartnerPicker partners={partners} current={partner} action="/developers/keys" />

      <div className="tw:grid tw:items-start tw:gap-6 tw:lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Box label="New Key">
          <CreateKeyForm partnerId={partner.id} scopes={scopes} />
        </Box>

        <Box label="Keys" meta={`${active} active · ${keys.length - active} revoked`}>
          {keys.length === 0 ? (
            <Empty>No keys yet. Create one to start calling the API.</Empty>
          ) : (
            <div className="ll-table-wrap">
              <table className="ll-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Key</th>
                    <th scope="col">Scopes</th>
                    <th scope="col">Last Used</th>
                    <th scope="col">
                      <span className="ll-visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className={k.revokedAt ? 'tw:opacity-60' : undefined}>
                      <td>
                        <span className="tw:block tw:font-semibold">{k.name}</span>
                        <span className="ll-muted tw:text-[13px]">
                          <RelativeTime iso={k.createdAt} prefix="Created" />
                        </span>
                      </td>
                      <td className="ll-mono tw:whitespace-nowrap" translate="no">
                        {k.prefix}_••••
                      </td>
                      <td>
                        <span className="tw:flex tw:flex-wrap tw:gap-1">
                          {k.scopes.map((s) => (
                            <span key={s} className="ll-tag ll-mono">
                              {s}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="tw:whitespace-nowrap">{k.lastUsedAt ? <RelativeTime iso={k.lastUsedAt} /> : <span className="ll-muted">Never</span>}</td>
                      <td className="tw:text-right">
                        {k.revokedAt ? (
                          <span className="ll-pill ll-pill--rejected">Revoked</span>
                        ) : (
                          <RevokeButton partnerId={partner.id} keyId={k.id} name={k.name} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Box>
      </div>
    </>
  );
}
