'use client';

import { useNotifyDataChanged } from '@ledgerline/core/client';
import { formatMoney } from '@ledgerline/core/format';
import {
  Box,
  Empty,
  FilterLinks,
  Money,
  PageHeader,
  RelativeTime,
  SkeletonRows,
  Spinner,
  StatusPill,
  toast,
} from '@ledgerline/core/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const notifyDataChanged = useNotifyDataChanged();
  const status: QueueStatus = QUEUE_STATUSES.find((s) => s === searchParams.get('status')) ?? 'open';

  const queue = useQuery({ ...trpc.queue.queryOptions({ status }), refetchInterval: 15_000 });
  const rules = useQuery(trpc.rules.queryOptions());

  const clear = useMutation(
    trpc.clear.mutationOptions({
      onSuccess: (flag) =>
        toast.show({
          tone: 'success',
          title: `Cleared ${flag.payoutId}`,
          body: 'It’s back in Payouts, ready to approve.',
          action: { label: 'Open', onClick: () => router.push(`/payouts?id=${flag.payoutId}`) },
        }),
      onError: (error) => toast.show({ tone: 'error', title: error.message }),
      onSettled: notifyDataChanged,
    }),
  );
  const reject = useMutation(
    trpc.reject.mutationOptions({
      onSuccess: (flag) => toast.show({ tone: 'success', title: `Voided ${flag.payoutId}`, body: 'It won’t be sent.' }),
      onError: (error) => toast.show({ tone: 'error', title: error.message }),
      onSettled: notifyDataChanged,
    }),
  );
  const busyId = clear.isPending ? clear.variables?.id : reject.isPending ? reject.variables?.id : undefined;

  return (
    <div className="ll-page">
      <PageHeader
        kicker="Section C · Vetting"
        title="Risk"
        deck="Payouts held by a rule wait here. Clear one to release it to Payouts, or reject it to stop it for good."
      />

      <div className="ll-split ll-split--wide">
        <Box label="The Review Queue" meta={queue.data ? `${queue.data.length} ${status}` : undefined}>
          <div className="ll-box__toolbar">
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
              <button type="button" className="ll-button" onClick={() => queue.refetch()}>
                Retry
              </button>
            </Empty>
          ) : queue.data.length === 0 ? (
            <Empty>
              {status === 'open' ? 'Nothing is waiting on Risk. A quiet day at the desk.' : `No ${status} flags yet.`}
              <Link href="/payouts" className="ll-link">
                Go to Payouts
              </Link>
            </Empty>
          ) : (
            <ul className="ll-list">
              {queue.data.slice(0, 60).map((flag) => (
                <li key={flag.id} className="ll-row ll-row--static ll-risk-row">
                  <span className="ll-row__main">
                    <Link href={`/payouts?id=${flag.payoutId}`} className="ll-row__title ll-row__link">
                      {flag.payout?.beneficiary ?? 'Unknown payout'}
                    </Link>
                    <span className="ll-row__meta">
                      <span className="ll-mono" translate="no">
                        {flag.payoutId}
                      </span>
                      <span aria-hidden>·</span>
                      <RelativeTime iso={flag.createdAt} />
                    </span>
                  </span>
                  <span className="ll-risk-row__reason">
                    <span className="ll-tag ll-mono" translate="no">
                      {flag.rule}
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
                        className="ll-button ll-button--primary ll-button--small"
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
        </Box>

        <Box label="Standing Orders">
          <div className="ll-detail__body">
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
                      {rule.open > 0 && <span className="ll-pill ll-pill--pending">{rule.open} held</span>}
                    </div>
                    <p className="ll-muted">{rule.description}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <SkeletonRows rows={4} />
            )}
          </div>
        </Box>
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
      className={`ll-button ll-button--small ${armed ? 'll-button--danger' : 'll-button--ghost'}`}
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
  const level = value >= 80 ? 'High' : value >= 60 ? 'Medium' : 'Low';
  return (
    <span className="ll-score" role="img" aria-label={`${level} risk, score ${value} of 100`}>
      <span className="ll-score__track" aria-hidden>
        <span className={`ll-score__fill ${value >= 80 ? 'll-score__fill--high' : ''}`} style={{ width: `${value}%` }} />
      </span>
      <span className="ll-mono" aria-hidden>
        {value}
      </span>
    </span>
  );
}
