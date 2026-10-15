'use client';

import { downloadFile, useNotifyDataChanged } from '@ledgerline/core/client';
import { formatDate, formatInteger, formatMoney, formatTimestamp } from '@ledgerline/core/format';
import { METHOD_LABELS } from '@ledgerline/core/geo';
import {
  Box,
  Code,
  CountUp,
  Empty,
  FilterLinks,
  Money,
  PageHeader,
  RelativeTime,
  SkeletonRows,
  Sparkline,
  Spinner,
  Stamp,
  StatusPill,
  toast,
  useHotkeys,
  useHrefWith,
} from '@ledgerline/core/ui';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ModuleProvider, useTRPC } from '../client';
import type { PayoutsRouter } from '../router';
import { PAYOUT_SORTS, PAYOUT_STATUSES } from '../schema';
import { NewPayoutDialog } from './NewPayout';

type Outputs = inferRouterOutputs<PayoutsRouter>;
type Detail = Outputs['get'];
type Row = Outputs['browse']['items'][number];

const STAMPS: Partial<Record<Row['status'], { label: string; tone: string }>> = {
  paid: { label: 'Paid', tone: 'paid' },
  review: { label: 'Held', tone: 'review' },
  rejected: { label: 'Void', tone: 'rejected' },
};

const SORT_LABELS: Record<(typeof PAYOUT_SORTS)[number], string> = {
  newest: 'Newest First',
  oldest: 'Oldest First',
  largest: 'Largest Amount',
  smallest: 'Smallest Amount',
};

export function PayoutsPage() {
  return (
    <ModuleProvider>
      <Payouts />
    </ModuleProvider>
  );
}

function Payouts() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hrefWith = useHrefWith();
  const searchParams = useSearchParams();
  const notifyDataChanged = useNotifyDataChanged();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Filters, sort, search, selection and the New Payout dialog all live in the URL.
  const status = PAYOUT_STATUSES.find((s) => s === searchParams.get('status'));
  const sort = PAYOUT_SORTS.find((s) => s === searchParams.get('sort')) ?? 'newest';
  const q = searchParams.get('q') ?? '';
  const idParam = searchParams.get('id');
  const creating = searchParams.get('new') === '1';

  const list = useInfiniteQuery(
    trpc.browse.infiniteQueryOptions(
      { status, q: q || undefined, sort, limit: 25 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined, placeholderData: keepPreviousData, refetchInterval: 15_000 },
    ),
  );
  const summary = useQuery({ ...trpc.summary.queryOptions(), refetchInterval: 15_000 });
  const payouts = list.data?.pages.flatMap((page) => page.items) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  // Without an explicit selection, focus on the newest pending payout so Approve has a target.
  const selectedId = idParam ?? (payouts.find((p) => p.status === 'pending') ?? payouts[0])?.id ?? null;
  const detail = useQuery({ ...trpc.get.queryOptions({ id: selectedId ?? '' }), enabled: Boolean(selectedId) });
  const selected: Row | undefined = detail.data?.payout ?? payouts.find((p) => p.id === selectedId);

  const [scheduled, setScheduled] = useState<ReadonlySet<string>>(new Set());
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const markScheduled = (ids: string[], on: boolean) =>
    setScheduled((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const approve = useMutation(
    trpc.approve.mutationOptions({
      onSuccess: (p) =>
        toast.show({ tone: 'success', title: `Paid: ${p.beneficiary}`, body: `${formatMoney(p.amount)} sent via ${METHOD_LABELS[p.method]}.` }),
      onError: (error) =>
        toast.show({
          tone: 'error',
          title: error.message,
          action: error.data?.code === 'PRECONDITION_FAILED' ? { label: 'Open Risk', onClick: () => router.push('/risk') } : undefined,
        }),
      onSettled: (_data, _error, input) => {
        markScheduled([input.id], false);
        notifyDataChanged();
      },
    }),
  );

  const bulk = useMutation(
    trpc.bulkApprove.mutationOptions({
      onSuccess: (results) => {
        const ok = results.filter((r) => r.ok);
        const failed = results.filter((r) => !r.ok);
        toast.show({
          tone: failed.length ? 'error' : 'success',
          title: `${ok.length} paid${failed.length ? ` · ${failed.length} not sent` : ''}`,
          body: failed.length
            ? failed.map((f) => `${f.id}: ${f.message}`).join(' ')
            : `${formatMoney(ok.reduce((sum, r) => sum + r.amount, 0))} sent.`,
          duration: failed.length ? 14_000 : undefined,
        });
        setChecked(new Set());
      },
      onError: (error) => toast.show({ tone: 'error', title: error.message }),
      onSettled: (_data, _error, input) => {
        markScheduled(input.ids, false);
        notifyDataChanged();
      },
    }),
  );

  /** Money can't be recalled once sent, so every approval gets a five-second undo window. */
  function approveWithUndo(payout: Row | undefined) {
    if (!payout || payout.status !== 'pending' || scheduled.has(payout.id)) return;
    markScheduled([payout.id], true);
    toast.undoable({
      title: `Approving ${payout.beneficiary} · ${formatMoney(payout.amount)}`,
      body: 'Sends in 5 seconds.',
      commit: () => approve.mutate({ id: payout.id }),
      onUndo: () => markScheduled([payout.id], false),
    });
  }

  const checkedRows = payouts.filter((p) => checked.has(p.id) && p.status === 'pending' && !scheduled.has(p.id));
  const checkedTotal = checkedRows.reduce((sum, p) => sum + p.amount, 0);

  function bulkApproveWithUndo() {
    const ids = checkedRows.map((p) => p.id);
    if (!ids.length) return;
    markScheduled(ids, true);
    toast.undoable({
      title: `Approving ${ids.length} payouts · ${formatMoney(checkedTotal)}`,
      body: 'Each one runs through Risk first. Sends in 5 seconds.',
      commit: () => bulk.mutate({ ids }),
      onUndo: () => markScheduled(ids, false),
    });
  }

  const toggleChecked = (id: string | null) => {
    const row = payouts.find((p) => p.id === id);
    if (!row || row.status !== 'pending') return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await queryClient.fetchQuery(trpc.exportCsv.queryOptions({ status, q: q || undefined }));
      downloadFile(`ledgerline-payouts-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast.show({ tone: 'success', title: 'CSV downloaded', body: `${formatInteger(total)} payouts exported.` });
    } catch {
      toast.show({ tone: 'error', title: 'The export didn’t finish. Try again in a moment.' });
    } finally {
      setExporting(false);
    }
  }

  function move(delta: number) {
    if (!payouts.length) return;
    const index = payouts.findIndex((p) => p.id === selectedId);
    const next = payouts[Math.min(payouts.length - 1, Math.max(0, index + delta))];
    if (!next) return;
    router.replace(hrefWith({ id: next.id }), { scroll: false });
    document.getElementById(`row-${next.id}`)?.focus();
  }

  function onListKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    move(event.key === 'ArrowDown' ? 1 : -1);
  }

  useHotkeys({
    j: () => move(1),
    k: () => move(-1),
    a: () => approveWithUndo(selected),
    n: () => router.push(hrefWith({ new: '1' }), { scroll: false }),
    x: () => toggleChecked(selectedId),
    e: () => void exportCsv(),
  });

  const counts = summary.data;
  const filters = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'pending', count: counts?.pending.count },
    { label: 'Review', value: 'review', count: counts?.review.count },
    { label: 'Paid', value: 'paid' },
    { label: 'Rejected', value: 'rejected' },
  ] as const;

  const canApprove = selected?.status === 'pending' && !scheduled.has(selected.id);

  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section B · Outgoing"
        title="Payouts"
        deck="Every pound that leaves the building passes this desk. Approve what’s owed; Risk vets the rest."
        actions={
          <>
            <button type="button" className="ll-button ll-button--ghost" onClick={exportCsv} disabled={exporting} aria-busy={exporting}>
              {exporting && <Spinner />}
              Export CSV
            </button>
            <Link href={hrefWith({ new: '1' })} scroll={false} className="ll-button">
              New Payout
            </Link>
            <button
              type="button"
              className="ll-button ll-button--primary"
              disabled={!canApprove}
              aria-describedby="approve-target"
              onClick={() => approveWithUndo(selected)}
            >
              Approve
            </button>
            <span id="approve-target" className="ll-visually-hidden">
              {selected
                ? canApprove
                  ? `Approves ${selected.beneficiary}, ${formatMoney(selected.amount)}`
                  : `${selected.beneficiary} is ${scheduled.has(selected.id) ? 'already scheduled' : selected.status}; select a pending payout to approve`
                : 'Select a pending payout to approve'}
            </span>
          </>
        }
      />

      <section className="ll-stats" aria-label="Totals">
        <Stat label="Awaiting Approval" value={counts?.pending} />
        <Stat label="Held by Risk" value={counts?.review} />
        <Stat label="Paid Today" value={counts?.paidToday} />
        <Stat label="Paid · Last 30 Days" value={counts?.paid30d} />
      </section>

      <div className="ll-split">
        <Box label="The Payout Book" meta={list.data ? `${formatInteger(total)} on file` : undefined} labelId="payouts-list-title">
          <div className="ll-box__toolbar">
            <FilterLinks label="Filter by status" param="status" options={filters} value={status} reset={['id']} />
            <div className="ll-search">
              <label htmlFor="payout-search" className="ll-visually-hidden">
                Search payouts
              </label>
              <span className="ll-search__icon" aria-hidden>
                ⌕
              </span>
              <input
                id="payout-search"
                data-page-search
                className="ll-input"
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search name, ID or reference…"
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => {
                  const value = event.target.value;
                  clearTimeout(searchTimer.current);
                  searchTimer.current = setTimeout(
                    () => router.replace(hrefWith({ q: value.trim() || undefined, id: undefined }), { scroll: false }),
                    250,
                  );
                }}
              />
            </div>
            <label htmlFor="payout-sort" className="ll-visually-hidden">
              Sort payouts
            </label>
            <select
              id="payout-sort"
              className="ll-select"
              style={{ width: 'auto' }}
              value={sort}
              onChange={(event) =>
                router.replace(hrefWith({ sort: event.target.value === 'newest' ? undefined : event.target.value }), { scroll: false })
              }
            >
              {PAYOUT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {checkedRows.length > 0 && (
            <div className="ll-bulkbar" role="region" aria-label="Bulk actions">
              <span className="ll-bulkbar__text">
                {checkedRows.length} selected · {formatMoney(checkedTotal)}
              </span>
              <button type="button" className="ll-button ll-button--ghost ll-button--small" onClick={() => setChecked(new Set())}>
                Clear Selection
              </button>
              <button type="button" className="ll-button ll-button--primary ll-button--small" onClick={bulkApproveWithUndo}>
                Approve {checkedRows.length}
              </button>
            </div>
          )}

          {list.isPending ? (
            <SkeletonRows />
          ) : list.isError ? (
            <Empty>
              Couldn’t load payouts. Check your connection & try again.
              <button type="button" className="ll-button" onClick={() => list.refetch()}>
                Retry
              </button>
            </Empty>
          ) : payouts.length === 0 ? (
            <Empty>
              {q ? `Nothing matches “${q}”.` : `No ${status ?? ''} payouts right now.`}
              <Link href={hrefWith({ status: undefined, q: undefined, id: undefined })} className="ll-link" scroll={false}>
                View All Payouts
              </Link>
            </Empty>
          ) : (
            <>
              <ul className="ll-list" onKeyDown={onListKey}>
                {payouts.map((payout) => (
                  <li key={payout.id} className="ll-select-row">
                    {payout.status === 'pending' ? (
                      <label className="ll-check">
                        <input
                          type="checkbox"
                          checked={checked.has(payout.id)}
                          onChange={() => toggleChecked(payout.id)}
                          aria-label={`Select ${payout.beneficiary}, ${payout.id}`}
                        />
                      </label>
                    ) : (
                      <span className="ll-check" aria-hidden />
                    )}
                    <Link
                      id={`row-${payout.id}`}
                      href={hrefWith({ id: payout.id })}
                      scroll={false}
                      replace
                      aria-current={payout.id === selectedId ? 'true' : undefined}
                      className="ll-row"
                    >
                      <span className="ll-row__main">
                        <span className="ll-row__title">{payout.beneficiary}</span>
                        <span className="ll-row__meta">
                          <span className="ll-mono" translate="no">
                            {payout.id}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{payout.city}</span>
                          <span aria-hidden>·</span>
                          <RelativeTime iso={payout.createdAt} />
                        </span>
                      </span>
                      <Money amount={payout.amount} className="ll-row__amount" />
                      {scheduled.has(payout.id) ? (
                        <StatusPill status="neutral" label="Sending" />
                      ) : (
                        <StatusPill status={payout.status} />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="ll-box__foot">
                {list.hasNextPage ? (
                  <button
                    type="button"
                    className="ll-button ll-button--small"
                    onClick={() => list.fetchNextPage()}
                    disabled={list.isFetchingNextPage}
                    aria-busy={list.isFetchingNextPage}
                  >
                    {list.isFetchingNextPage && <Spinner />}
                    Load More · {formatInteger(payouts.length)} of {formatInteger(total)}
                  </button>
                ) : (
                  <span className="ll-muted">End of the book · {formatInteger(total)} payouts</span>
                )}
              </div>
            </>
          )}
        </Box>

        <aside className="ll-box ll-detail" aria-label="Payout Detail">
          {!selectedId ? (
            <Empty>{list.isPending ? null : 'Select a payout to see its details.'}</Empty>
          ) : detail.isError ? (
            <Empty>
              That payout couldn’t be found.
              <Link href={hrefWith({ id: undefined })} className="ll-link" scroll={false}>
                Back to the List
              </Link>
            </Empty>
          ) : !detail.data ? (
            <SkeletonRows rows={3} />
          ) : (
            <PayoutDetail data={detail.data} scheduled={scheduled.has(detail.data.payout.id)} />
          )}
        </aside>
      </div>

      <NewPayoutDialog
        open={creating}
        onClose={() => router.replace(hrefWith({ new: undefined }), { scroll: false })}
        onCreated={(id) => {
          notifyDataChanged();
          router.replace(hrefWith({ new: undefined, status: undefined, q: undefined, id }), { scroll: false });
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: { count: number; amount: number } }) {
  return (
    <div className="ll-stat">
      <span className="ll-stat__label">{label}</span>
      <span className="ll-stat__value">
        {value ? <CountUp value={value.amount} format={formatMoney} /> : <span className="ll-skeleton ll-skeleton--stat" />}
      </span>
      <span className="ll-stat__meta">{value ? `${formatInteger(value.count)} payout${value.count === 1 ? '' : 's'}` : ''}</span>
    </div>
  );
}

function PayoutDetail({ data, scheduled }: { data: Detail; scheduled: boolean }) {
  const { payout, riskFlags, activity, history } = data;
  const openFlag = riskFlags.find((f) => f.status === 'open');
  const stamp = STAMPS[payout.status];

  // Slam the stamp only when this payout's status changes while it's on screen.
  const previous = useRef({ id: payout.id, status: payout.status });
  const slam = previous.current.id === payout.id && previous.current.status !== payout.status;
  useEffect(() => {
    previous.current = { id: payout.id, status: payout.status };
  }, [payout.id, payout.status]);

  return (
    <div className="ll-detail__body" style={{ position: 'relative' }}>
      <div className="ll-detail__head">
        <div>
          <h2 className="ll-detail__title">{payout.beneficiary}</h2>
          <span className="ll-row__meta">
            <Code copy>{payout.id}</Code>
          </span>
        </div>
        {scheduled ? <StatusPill status="neutral" label="Sending" /> : <StatusPill status={payout.status} />}
      </div>

      {stamp && (
        <span className="ll-detail__stamp">
          <Stamp key={`${payout.id}-${payout.status}`} label={stamp.label} tone={stamp.tone} slam={slam} />
        </span>
      )}

      <Money amount={payout.amount} className="ll-detail__amount" />

      {openFlag && (
        <div className="ll-callout">
          <strong>Held by Risk.</strong> {openFlag.reason}.{' '}
          <Link href="/risk" className="ll-link">
            Review in Risk
          </Link>
        </div>
      )}

      <dl className="ll-dl">
        <dt>Reference</dt>
        <dd>
          <Code copy>{payout.reference}</Code>
        </dd>
        <dt>Account</dt>
        <dd className="ll-mono" translate="no">
          {payout.account}
        </dd>
        <dt>Rail</dt>
        <dd>{METHOD_LABELS[payout.method]}</dd>
        <dt>Destination</dt>
        <dd>
          {payout.city}, {payout.country}
        </dd>
        <dt>Created</dt>
        <dd>
          {formatTimestamp(payout.createdAt)} · {payout.createdBy}
        </dd>
        <dt>Paid</dt>
        <dd>{payout.paidAt ? formatTimestamp(payout.paidAt) : <span aria-label="Not yet">—</span>}</dd>
      </dl>

      <section className="ll-history" aria-labelledby="history-title">
        <h3 id="history-title" className="ll-section-title">
          Lifetime with {payout.beneficiary}
        </h3>
        {history.count === 0 ? (
          <p className="ll-muted">First payout to this beneficiary.</p>
        ) : (
          <>
            <Sparkline values={history.months} width={300} height={40} />
            <p className="ll-history__figures">
              <span>
                <b className="ll-mono">{formatMoney(history.total)}</b> paid
              </span>
              <span>{formatInteger(history.count)} payouts</span>
              {history.since && <span>since {formatDate(history.since)}</span>}
            </p>
          </>
        )}
      </section>

      <h3 className="ll-section-title">Activity</h3>
      {activity.length === 0 ? (
        <p className="ll-muted">No activity yet. Approvals & risk decisions appear here.</p>
      ) : (
        <ol className="ll-timeline">
          {activity.slice(0, 8).map((event) => (
            <li key={event.id}>
              <span className="ll-mono" translate="no">
                {event.action}
              </span>
              <span className="ll-muted">
                {event.actor} · <RelativeTime iso={event.at} />
              </span>
              {event.detail && <span className="ll-timeline__detail">{event.detail}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
