'use client';

import { downloadFile } from '@ledgerline/core/client';
import { formatInteger, formatTimestamp } from '@ledgerline/core/format';
import { Box, Empty, FilterLinks, Money, PageHeader, RelativeTime, SkeletonRows, Sparkline, Spinner, toast, useHrefWith } from '@ledgerline/core/ui';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { ModuleProvider, useTRPC } from '../client';
import { DESKS } from '../desks';

const DESK_LABELS: Record<(typeof DESKS)[number], string> = { payouts: 'Payouts', risk: 'Risk', support: 'Support' };

export function LedgerPage() {
  return (
    <ModuleProvider>
      <Ledger />
    </ModuleProvider>
  );
}

function Ledger() {
  const searchParams = useSearchParams();
  const view = searchParams.get('view') === 'accounts' ? 'accounts' : undefined;

  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section D · Records"
        title="The Ledger"
        deck="Every decision, signed & dated. Nothing on this page can be edited, only read & exported."
      />
      <FilterLinks
        label="Ledger view"
        param="view"
        value={view}
        reset={['q', 'desk']}
        options={[
          { label: 'Audit Log', value: undefined },
          { label: 'Beneficiary Accounts', value: 'accounts' },
        ]}
      />
      {view === 'accounts' ? <Accounts /> : <AuditLog />}
    </div>
  );
}

function AuditLog() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hrefWith = useHrefWith();
  const searchParams = useSearchParams();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [exporting, setExporting] = useState(false);

  const q = searchParams.get('q') ?? '';
  const desk = DESKS.find((d) => d === searchParams.get('desk'));

  const events = useInfiniteQuery(
    trpc.events.infiniteQueryOptions(
      { q: q || undefined, desk, limit: 40 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined, placeholderData: keepPreviousData },
    ),
  );
  const rows = events.data?.pages.flatMap((p) => p.items) ?? [];
  const total = events.data?.pages[0]?.total ?? 0;

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await queryClient.fetchQuery(trpc.exportCsv.queryOptions({ q: q || undefined, desk }));
      downloadFile(`ledgerline-audit-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.show({ tone: 'success', title: 'Audit log downloaded', body: `${formatInteger(total)} entries exported.` });
    } catch {
      toast.show({ tone: 'error', title: 'The export didn’t finish. Try again in a moment.' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Box label="Audit Log" meta={events.data ? `${formatInteger(total)} entries` : undefined}>
      <div className="ll-box__toolbar">
        <div className="ll-search">
          <label htmlFor="ledger-search" className="ll-visually-hidden">
            Search the audit log
          </label>
          <span className="ll-search__icon" aria-hidden>
            ⌕
          </span>
          <input
            id="ledger-search"
            data-page-search
            className="ll-input"
            type="search"
            defaultValue={q}
            placeholder="Search action, person or ID…"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              const value = event.target.value;
              clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => router.replace(hrefWith({ q: value.trim() || undefined }), { scroll: false }), 250);
            }}
          />
        </div>
        <FilterLinks
          label="Filter by desk"
          param="desk"
          value={desk}
          options={[{ label: 'All Desks', value: undefined }, ...DESKS.map((d) => ({ label: DESK_LABELS[d], value: d }))]}
        />
        <button type="button" className="ll-button ll-button--small" onClick={exportCsv} disabled={exporting} aria-busy={exporting} style={{ marginLeft: 'auto' }}>
          {exporting && <Spinner />}
          Export CSV
        </button>
      </div>

      {events.isPending ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        <Empty>
          Nothing in the ledger matches that.
          <Link href={hrefWith({ q: undefined, desk: undefined })} className="ll-link" scroll={false}>
            Clear Filters
          </Link>
        </Empty>
      ) : (
        <>
          <div className="ll-table-wrap">
            <table className="ll-table">
              <caption className="ll-visually-hidden">Audit log, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Desk</th>
                  <th scope="col">Action</th>
                  <th scope="col">By</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {formatTimestamp(e.at)}
                      <span className="ll-muted" style={{ display: 'block', fontSize: 13 }}>
                        <RelativeTime iso={e.at} />
                      </span>
                    </td>
                    <td>{DESK_LABELS[e.module as keyof typeof DESK_LABELS] ?? e.module}</td>
                    <td className="ll-mono" translate="no">
                      {e.action}
                    </td>
                    <td>{e.actor}</td>
                    <td>
                      <Link
                        className="ll-row__link"
                        href={e.targetId.startsWith('po_') ? `/payouts?id=${e.targetId}` : `/support?id=${e.targetId}`}
                      >
                        {e.subject ?? <span className="ll-mono">{e.targetId}</span>}
                      </Link>
                      {e.subject && (
                        <span className="ll-muted ll-mono" style={{ display: 'block', fontSize: 13 }} translate="no">
                          {e.targetId}
                        </span>
                      )}
                    </td>
                    <td>{e.detail ?? <span aria-label="None">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ll-box__foot">
            {events.hasNextPage ? (
              <button
                type="button"
                className="ll-button ll-button--small"
                onClick={() => events.fetchNextPage()}
                disabled={events.isFetchingNextPage}
                aria-busy={events.isFetchingNextPage}
              >
                {events.isFetchingNextPage && <Spinner />}
                Load More · {formatInteger(rows.length)} of {formatInteger(total)}
              </button>
            ) : (
              <span className="ll-muted">The first entry. Nothing older on file.</span>
            )}
          </div>
        </>
      )}
    </Box>
  );
}

function Accounts() {
  const trpc = useTRPC();
  const accounts = useQuery(trpc.accounts.queryOptions());

  return (
    <Box label="Beneficiary Accounts" meta={accounts.data ? `${accounts.data.length} beneficiaries` : undefined}>
      {!accounts.data ? (
        <SkeletonRows rows={8} />
      ) : (
        <div className="ll-table-wrap">
          <table className="ll-table">
            <caption className="ll-visually-hidden">Lifetime totals per beneficiary, largest first</caption>
            <thead>
              <tr>
                <th scope="col">Beneficiary</th>
                <th scope="col">Destination</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Payouts
                </th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Lifetime Paid
                </th>
                <th scope="col">Last Paid</th>
                <th scope="col">12 Months</th>
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={a.name}>
                  <td>
                    <Link href={`/payouts?q=${encodeURIComponent(a.name)}`} className="ll-row__link">
                      {a.name}
                    </Link>
                  </td>
                  <td>
                    {a.city}, {a.country}
                  </td>
                  <td className="ll-num">{formatInteger(a.count)}</td>
                  <td className="ll-num">
                    <Money amount={a.total} />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <RelativeTime iso={a.lastPaidAt} />
                  </td>
                  <td>
                    <Sparkline values={a.months} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Box>
  );
}
