'use client';

import { formatMoney } from '@ledgerline/core/format';
import { TickerTape, type TickerItem } from '@ledgerline/core/ui';
import { useQuery } from '@tanstack/react-query';
import { ModuleProvider, useTRPC } from '../client';

const MARKS = {
  pending: '◆ Awaiting',
  review: '■ Held',
  paid: '▼ Paid',
  rejected: '✕ Void',
} as const;

/** The wire: the latest payouts running across the top of every page. */
export function PayoutsTicker() {
  return (
    <ModuleProvider>
      <Wire />
    </ModuleProvider>
  );
}

function Wire() {
  const trpc = useTRPC();
  const latest = useQuery({ ...trpc.list.queryOptions({ status: undefined }), refetchInterval: 15_000 });

  const items: TickerItem[] = (latest.data ?? []).slice(0, 18).map((p) => ({
    id: `${p.id}-${p.status}`,
    href: `/payouts?id=${p.id}`,
    text: (
      <>
        {p.beneficiary} <b>{formatMoney(p.amount)}</b> {MARKS[p.status]}
      </>
    ),
  }));

  return <TickerTape label="Ledgerline Wire" items={items} />;
}
