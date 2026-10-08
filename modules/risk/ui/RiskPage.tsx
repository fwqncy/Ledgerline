'use client';

import { formatMoney } from '@ledgerline/core/format';
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
} from '@ledgerline/core/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ModuleProvider, useTRPC } from '../client';

const QUEUE_STATUSES = ['open', 'cleared', 'rejected'] as const;
type QueueStatus = (typeof QUEUE_STATUSES)[number];

export function RiskPage() {
  return (
    <ModuleProvider>
      <Risk />
    </ModuleProvider>
  );
}

function Risk() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status: QueueStatus = QUEUE_STATUSES.find((s) => s === searchParams.get('status')) ?? 'open';
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: ReactNode } | null>(null);

  const queue = useQuery(trpc.queue.queryOptions({ status }));
  const rules = useQuery(trpc.rules.queryOptions());

  const settle = {
    onError: (error: { message: string }) => setNotice({ tone: 'error', text: error.message }),
    onSettled: async () => {
      await queryClient.invalidateQueries();
      router.refresh();
    },
  };
  const clear = useMutation(
    trpc.clear.mutationOptions({
      ...settle,
      onSuccess: (flag) =>
        setNotice({
          tone: 'success',
          text: (
            <>
              Flag cleared. <Code>{flag.payoutId}</Code> is back in Payouts, ready to approve.{' '}
              <Link href={`/payouts?id=${flag.payoutId}`} className="ll-link">
                Open Payout
              </Link>
            </>
          ),
        }),
    }),
  );
  const reject = useMutation(
    trpc.reject.mutationOptions({
      ...settle,
      onSuccess: (flag) =>
        setNotice({ tone: 'success', text: <>Payout <Code>{flag.payoutId}</Code> rejected. It won’t be sent.</> }),
    }),
  );
  const busyId = clear.isPending ? clear.variables?.id : reject.isPending ? reject.variables?.id : undefined;

  return (
    <div className="ll-page">
      <header className="ll-page__header">
        <div>
          <h1 className="ll-page__title">Risk</h1>
          <p className="ll-page__subtitle">
            Payouts held by a rule. Clear one to release it to Payouts, or reject it to stop it for good.
          </p>
        </div>
      </header>

      <Notice notice={notice} onDismiss={() => setNotice(null)} />

      <div className="ll-split ll-split--wide">
        <section className="ll-card ll-card--flush" aria-labelledby="risk-queue-title">
          <h2 id="risk-queue-title" className="ll-visually-hidden">
            Review Queue
          </h2>
          <div className="ll-card__toolbar">
            <FilterLinks
              label="Filter by outcome"
              param="status"
              options={[
                { label: 'Open', value: undefined },
                { label: 'Cleared', value: 'cleared' },
                { label: 'Rejected', value: 'rejected' },
              ]}
              value={status === 'open' ? undefined : status}
            />
          </div>
          {queue.isPending ? (
            <SkeletonRows rows={3} />
          ) : queue.isError ? (
            <Empty>
              Couldn’t load the queue. Check your connection & try again.
              <button type="button" className="ll-button ll-button--ghost" onClick={() => queue.refetch()}>
                Retry
              </button>
            </Empty>
          ) : queue.data.length === 0 ? (
            <Empty>
              {status === 'open' ? 'Nothing is waiting on Risk.' : `No ${status} flags yet.`}
              <Link href="/payouts" className="ll-link">
                Go to Payouts
              </Link>
            </Empty>
          ) : (
            <ul className="ll-list">
              {queue.data.map((flag) => (
                <li key={flag.id} className="ll-row ll-row--static ll-risk-row">
                  <span className="ll-row__main">
                    <Link href={`/payouts?id=${flag.payoutId}`} className="ll-row__title ll-row__link">
                      {flag.payout?.beneficiary ?? 'Unknown payout'}
                    </Link>
                    <span className="ll-row__meta">
                      <Code>{flag.payoutId}</Code> · <RelativeTime iso={flag.createdAt} />
                    </span>
                  </span>
                  <span className="ll-risk-row__reason">
                    <span className="ll-tag">
                      <Code>{flag.rule}</Code>
                    </span>
                    {flag.reason}
                  </span>
                  <Score value={flag.score} />
                  {flag.payout && <Money amount={flag.payout.amount} className="ll-row__amount" />}
                  {flag.status === 'open' ? (
                    <span className="ll-actions">
                      <ConfirmButton
                        label="Reject"
                        confirmLabel="Confirm Reject"
                        busy={busyId === flag.id && reject.isPending}
                        disabled={Boolean(busyId)}
                        onConfirm={() => reject.mutate({ id: flag.id })}
                      />
                      <button
                        type="button"
                        className="ll-button ll-button--primary"
                        disabled={Boolean(busyId)}
                        aria-busy={busyId === flag.id && clear.isPending}
                        onClick={() => clear.mutate({ id: flag.id })}
                      >
                        {busyId === flag.id && clear.isPending && <Spinner />}
                        Clear
                      </button>
                    </span>
                  ) : (
                    <span className="ll-actions ll-muted">
                      <StatusPill status={flag.status} />
                      {flag.resolvedBy}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="ll-card ll-detail" aria-labelledby="risk-rules-title">
          <div className="ll-detail__body">
            <h2 id="risk-rules-title" className="ll-detail__title">
              Rules
            </h2>
            <p className="ll-muted">
              Every approval in Payouts runs through these rules first.
              {rules.data && <> Your approval limit is {formatMoney(rules.data.approvalLimit)}.</>}
            </p>
            {rules.data ? (
              <ul className="ll-rules">
                {rules.data.rules.map((rule) => (
                  <li key={rule.id}>
                    <div className="ll-rules__head">
                      <h3 className="ll-rules__name">{rule.name}</h3>
                      {rule.open > 0 && <span className="ll-pill ll-pill--amber">{rule.open} held</span>}
                    </div>
                    <p className="ll-muted">{rule.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <SkeletonRows rows={4} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Destructive actions take two clicks; the second must come within a few seconds. */
function ConfirmButton({
  label,
  confirmLabel,
  busy,
  disabled,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  busy: boolean;
  disabled: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`ll-button ${armed ? 'll-button--danger' : 'll-button--ghost'}`}
      disabled={disabled}
      aria-busy={busy}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {busy && <Spinner />}
      {armed ? confirmLabel : label}
    </button>
  );
}

function Score({ value }: { value: number }) {
  const tone = value >= 80 ? 'red' : value >= 60 ? 'amber' : 'neutral';
  const level = value >= 80 ? 'High' : value >= 60 ? 'Medium' : 'Low';
  return (
    <span className="ll-score" role="img" aria-label={`${level} risk, score ${value} of 100`}>
      <span className="ll-score__track" aria-hidden>
        <span className={`ll-score__fill ll-score__fill--${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="ll-mono" aria-hidden>
        {value}
      </span>
    </span>
  );
}
