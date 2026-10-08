'use client';

import { formatMoney, formatTimestamp } from '@ledgerline/core/format';
import {
  Code,
  Empty,
  FilterLinks,
  Money,
  Notice,
  RelativeTime,
  SkeletonRows,
  Spinner,
  StatusPill,
  useHrefWith,
} from '@ledgerline/core/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ModuleProvider, useTRPC } from '../client';
import type { PayoutsRouter } from '../router';
import { PAYOUT_STATUSES, type PayoutStatus } from '../schema';

type Detail = inferRouterOutputs<PayoutsRouter>['get'];

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
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(null);

  // Filter and selection live in the URL, so they survive refresh and can be shared.
  const statusParam = searchParams.get('status');
  const status = PAYOUT_STATUSES.find((s) => s === statusParam) as PayoutStatus;

  const list = useQuery(trpc.list.queryOptions({ status }));
  const summary = useQuery(trpc.summary.queryOptions());
  const payouts = list.data ?? [];

  // Without an explicit selection, focus on the newest pending payout so Approve has a target.
  const idParam = searchParams.get('id');
  const selected =
    payouts.find((p) => p.id === idParam) ?? payouts.find((p) => p.status === 'pending') ?? payouts[0];
  const selectedId = selected?.id ?? null;

  const detail = useQuery({ ...trpc.get.queryOptions({ id: selectedId ?? '' }), enabled: Boolean(selectedId) });

  const approve = useMutation(
    trpc.approve.mutationOptions({
      onSuccess: (payout) =>
        setNotice({ tone: 'success', text: `${payout.beneficiary} · ${formatMoney(payout.amount)} approved & sent.` }),
      onError: (error) =>
        setNotice({
          tone: 'error',
          text: (
            <>
              {error.message}{' '}
              {error.data?.code === 'PRECONDITION_FAILED' && (
                <Link href="/risk" className="ll-link">
                  Open Risk
                </Link>
              )}
            </>
          ),
        }),
      onSettled: async () => {
        await queryClient.invalidateQueries();
        router.refresh();
      },
    }),
  );

  const counts = summary.data;
  const filters = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'pending', count: counts?.pending.count },
    { label: 'Review', value: 'review', count: counts?.review.count },
    { label: 'Paid', value: 'paid' },
    { label: 'Rejected', value: 'rejected' },
  ] as const;

  function onListKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = payouts.findIndex((p) => p.id === selectedId);
    const next = payouts[Math.min(payouts.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      router.replace(hrefWith({ id: next.id }), { scroll: false });
      document.getElementById(`row-${next.id}`)?.focus();
    }
  }

  const canApprove = selected?.status === 'pending';

  return (
    <div className="ll-page">
      <header className="ll-page__header">
        <div>
          <h1 className="ll-page__title">Payouts</h1>
          <p className="ll-page__subtitle">Outgoing transfers awaiting approval & recently sent.</p>
        </div>
        <button
          type="button"
          className="ll-button ll-button--primary"
          disabled={!canApprove || approve.isPending}
          aria-busy={approve.isPending}
          aria-describedby="approve-target"
          onClick={() => selected && approve.mutate({ id: selected.id })}
        >
          {approve.isPending && <Spinner />}
          Approve
        </button>
        <span id="approve-target" className="ll-visually-hidden">
          {selected
            ? canApprove
              ? `Approves ${selected.beneficiary}, ${formatMoney(selected.amount)}`
              : `${selected.beneficiary} is ${selected.status}; select a pending payout to approve`
            : 'Select a pending payout to approve'}
        </span>
      </header>

      <section className="ll-stats" aria-label="Totals">
        <Stat label="Pending" count={counts?.pending.count} amount={counts?.pending.amount} />
        <Stat label="In Review" count={counts?.review.count} amount={counts?.review.amount} />
        <Stat label="Paid" count={counts?.paid.count} amount={counts?.paid.amount} />
      </section>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="ll-split">
        <section className="ll-card ll-card--flush" aria-labelledby="payouts-list-title">
          <h2 id="payouts-list-title" className="ll-visually-hidden">
            Payout List
          </h2>
          <div className="ll-card__toolbar">
            <FilterLinks label="Filter by status" param="status" options={filters} value={status} reset={['id']} />
          </div>
          {list.isPending ? (
            <SkeletonRows />
          ) : list.isError ? (
            <Empty>
              Couldn’t load payouts. Check your connection & try again.
              <button type="button" className="ll-button ll-button--ghost" onClick={() => list.refetch()}>
                Retry
              </button>
            </Empty>
          ) : payouts.length === 0 ? (
            <Empty>
              No {status} payouts right now.
              <Link href={hrefWith({ status: undefined, id: undefined })} className="ll-link" scroll={false}>
                View All Payouts
              </Link>
            </Empty>
          ) : (
            <ul className="ll-list" onKeyDown={onListKey}>
              {payouts.map((payout) => (
                <li key={payout.id}>
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
                        <Code>{payout.id}</Code>
                      </span>
                    </span>
                    <Money amount={payout.amount} className="ll-row__amount" />
                    <StatusPill status={payout.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="ll-card ll-detail" aria-label="Payout Detail">
          {!selectedId ? (
            <Empty>{list.isPending ? null : 'Select a payout to see its details.'}</Empty>
          ) : !detail.data ? (
            <SkeletonRows rows={3} />
          ) : (
            <PayoutDetail data={detail.data} />
          )}
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, count, amount }: { label: string; count?: number; amount?: number }) {
  return (
    <div className="ll-stat">
      <span className="ll-stat__label">{label}</span>
      <span className="ll-stat__value ll-mono" translate="no">
        {amount === undefined ? <span className="ll-skeleton ll-skeleton--stat" /> : formatMoney(amount)}
      </span>
      <span className="ll-stat__meta">{count === undefined ? '' : `${count} payout${count === 1 ? '' : 's'}`}</span>
    </div>
  );
}

function PayoutDetail({ data }: { data: Detail }) {
  const { payout, riskFlags, activity } = data;
  const openFlag = riskFlags.find((f) => f.status === 'open');

  return (
    <div className="ll-detail__body">
      <div className="ll-detail__head">
        <div>
          <h2 className="ll-detail__title">{payout.beneficiary}</h2>
          <span className="ll-row__meta">
            <Code>{payout.id}</Code>
          </span>
        </div>
        <StatusPill status={payout.status} />
      </div>

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
          <Code>{payout.reference}</Code>
        </dd>
        <dt>Account</dt>
        <dd>
          <Code>{payout.account}</Code>
        </dd>
        <dt>Created</dt>
        <dd>{formatTimestamp(payout.createdAt)}</dd>
        <dt>Paid</dt>
        <dd>{payout.paidAt ? formatTimestamp(payout.paidAt) : <span aria-label="Not yet">—</span>}</dd>
      </dl>

      <h3 className="ll-section-title">Activity</h3>
      {activity.length === 0 ? (
        <p className="ll-muted">No activity yet. Approvals & risk decisions appear here.</p>
      ) : (
        <ol className="ll-timeline">
          {activity.map((event) => (
            <li key={event.id}>
              <span className="ll-timeline__action">
                <Code>{event.action}</Code>
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
