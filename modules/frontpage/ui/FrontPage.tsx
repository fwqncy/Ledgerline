'use client';

import { formatInteger, formatMoney, formatMoneyCompact } from '@ledgerline/core/format';
import { prefersReducedMotion } from '@ledgerline/core/theme';
import { Box, CountUp, Empty, FilterLinks, Money, RelativeTime, SkeletonRows } from '@ledgerline/core/ui';
import { useGSAP } from '@gsap/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import { gsap } from 'gsap';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { ModuleProvider, useTRPC } from '../client';
import type { FrontPageRouter } from '../router';
import { CandleChart } from './CandleChart';
import { WireGlobe } from './WireGlobe';

gsap.registerPlugin(useGSAP);

type Edition = inferRouterOutputs<FrontPageRouter>['edition'];

const RANGES = ['1M', '3M', '6M', '1Y'] as const;
const RANGE_LABELS: Record<(typeof RANGES)[number], string> = {
  '1M': 'the last month',
  '3M': 'the last 3 months',
  '6M': 'the last 6 months',
  '1Y': 'the last year',
};

export function FrontPage() {
  return (
    <ModuleProvider>
      <TodaysEdition />
    </ModuleProvider>
  );
}

function TodaysEdition() {
  const trpc = useTRPC();
  const router = useRouter();
  const searchParams = useSearchParams();
  const range = RANGES.find((r) => r === searchParams.get('range')) ?? '6M';

  const edition = useQuery({ ...trpc.edition.queryOptions(), refetchInterval: 20_000 });
  const candles = useQuery({
    ...trpc.candles.queryOptions({ range }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const routes = useQuery(trpc.routes.queryOptions());

  // /frontpage?print=1 prints the edition once it has loaded.
  const wantsPrint = searchParams.get('print') === '1';
  useEffect(() => {
    if (!wantsPrint || !edition.data || !candles.data) return;
    const timer = setTimeout(() => {
      window.print();
      router.replace('/frontpage', { scroll: false });
    }, 700);
    return () => clearTimeout(timer);
  }, [wantsPrint, edition.data, candles.data, router]);

  const e = edition.data;

  return (
    <div className="ll-page">
      {e ? <Lead edition={e} /> : <div className="ll-lead" style={{ minHeight: 320 }} aria-busy="true" />}

      <section className="ll-stats" aria-label="Today’s figures">
        <Figure label="The Float" value={e?.balance} meta={e ? <Change delta={e.balanceChange} /> : null} />
        <Figure
          label="Paid Today"
          value={e?.paidToday.amount}
          meta={e ? `${formatInteger(e.paidToday.count)} payouts · ${formatMoneyCompact(e.paidYesterday.amount)} yesterday` : null}
        />
        <Figure label="Awaiting Approval" value={e?.pending.amount} meta={e ? `${e.pending.count} payouts` : null} href="/payouts?status=pending" />
        <Figure label="Held by Risk" value={e?.held.amount} meta={e ? `${e.held.count} payouts` : null} href="/risk" />
        <Figure label="Lifetime Paid" value={e?.lifetime.amount} meta={e ? `${formatInteger(e.lifetime.count)} payouts` : null} />
      </section>

      <div className="ll-front-grid">
        <Box label="The Ticker · Treasury Float" labelId="ticker" meta={<span className="ll-mono">Daily · GBP</span>}>
          <div className="ll-box__toolbar">
            <FilterLinks
              label="Chart range"
              param="range"
              value={range === '6M' ? undefined : range}
              options={RANGES.map((r) => ({ label: r, value: r === '6M' ? undefined : r }))}
            />
            <p className="ll-muted" style={{ fontSize: 14 }}>
              The account that funds every payout. Each candle is one trading day.
            </p>
          </div>
          <div className="ll-box__body">
            {candles.data ? (
              <CandleChart candles={candles.data} label={RANGE_LABELS[range]} replayKey={range} />
            ) : candles.isError ? (
              <Empty>
                The chart didn’t load.
                <button type="button" className="ll-button" onClick={() => candles.refetch()}>
                  Retry
                </button>
              </Empty>
            ) : (
              <div style={{ height: 440 }} className="ll-halftone" aria-busy="true" aria-label="Loading chart" />
            )}
          </div>
        </Box>

        <Box label="The Wire" meta={<span className="ll-mono">Live</span>}>
          {!e ? (
            <SkeletonRows rows={6} />
          ) : (
            <ol className="ll-wire">
              {e.wire.map((item) => (
                <li key={item.id}>
                  <span className="ll-wire__time">
                    <RelativeTime iso={item.at} />
                  </span>
                  <span className="ll-wire__text">
                    {item.href ? (
                      <Link href={item.href} className="ll-row__link">
                        {item.text}
                      </Link>
                    ) : (
                      item.text
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Box>
      </div>

      <div className="ll-front-grid ll-front-grid--even">
        <Box label="Dispatches Abroad · 90 Days">
          <div className="ll-box__body">
            {routes.data ? (
              <WireGlobe hq={routes.data.hq} places={routes.data.cities} />
            ) : (
              <div className="ll-globe ll-halftone" aria-busy="true" aria-label="Loading globe" />
            )}
          </div>
          {routes.data && (
            <ol className="ll-ranking">
              {routes.data.cities.slice(0, 6).map((c) => (
                <li key={c.city}>
                  <span className="ll-ranking__name">
                    {c.city}, {c.country}
                    <span className="ll-muted" style={{ display: 'block', fontSize: 13.5 }}>
                      {formatInteger(c.count)} payouts
                    </span>
                  </span>
                  <Money amount={c.amount} className="ll-row__amount" />
                </li>
              ))}
            </ol>
          )}
        </Box>

        <Box label="Most Paid · 30 Days">
          {!e ? (
            <SkeletonRows rows={6} />
          ) : (
            <ol className="ll-ranking">
              {e.topBeneficiaries.map((b) => (
                <li key={b.name}>
                  <span className="ll-ranking__name">
                    <Link href={`/payouts?q=${encodeURIComponent(b.name)}`} className="ll-row__link">
                      {b.name}
                    </Link>
                    <span className="ll-muted" style={{ display: 'block', fontSize: 13.5 }}>
                      {formatInteger(b.count)} payouts
                    </span>
                  </span>
                  <Money amount={b.amount} className="ll-row__amount" />
                </li>
              ))}
            </ol>
          )}
          <div className="ll-box__foot ll-no-print">
            <Link href="/frontpage?print=1" className="ll-button ll-button--small">
              Print Today’s Edition
            </Link>
          </div>
        </Box>
      </div>
    </div>
  );
}

/** The lead story, written from the day's numbers. Spins in like a film-reel headline once per session. */
function Lead({ edition: e }: { edition: Edition }) {
  const headline = useRef<HTMLHeadingElement>(null);

  useGSAP(() => {
    if (!headline.current || prefersReducedMotion()) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('ll-headline-spun') === '1';
      sessionStorage.setItem('ll-headline-spun', '1');
    } catch {
      // Private mode: spin anyway.
    }
    if (seen) return;
    gsap.from(headline.current, { rotate: -720, scale: 0.06, opacity: 0, duration: 1.2, ease: 'power3.out' });
  }, []);

  const quiet = e.pending.count === 0 && e.held.count === 0;
  const title = quiet ? 'The Desk Is Clear' : `${formatMoneyCompact(e.pending.amount + e.held.amount)} Awaits the Desk`;
  const sub = quiet
    ? `Every payout is settled. The float stands at ${formatMoney(e.balance)}.`
    : `${e.pending.count} payouts wait for a signature while Risk holds ${e.held.count} more; ${e.openTickets} merchants are on the line.`;

  return (
    <section className="ll-lead" aria-labelledby="lead-headline">
      <div className="ll-lead__rays" aria-hidden />
      <p className="ll-lead__kicker">Extra · Late City Edition</p>
      <h1 id="lead-headline" ref={headline} className="ll-lead__headline">
        {title}
      </h1>
      <p className="ll-lead__sub">{sub}</p>
      <p className="ll-lead__line">
        <span>
          Vol. {toRoman(e.volume)} · No. {formatInteger(e.issue)}
        </span>
        <span aria-hidden>★</span>
        <span>Money talks. We keep the ledger.</span>
        <span aria-hidden>★</span>
        <span>
          Paid since <RelativeTime iso={e.lifetime.since} />
        </span>
      </p>
      <div className="ll-checker" style={{ width: 'min(420px, 80%)' }} aria-hidden />
    </section>
  );
}

function Figure({
  label,
  value,
  meta,
  href,
}: {
  label: string;
  value?: number;
  meta: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <span className="ll-stat__label">{label}</span>
      <span className="ll-stat__value">
        {value === undefined ? <span className="ll-skeleton ll-skeleton--stat" /> : <CountUp value={value} format={formatMoney} />}
      </span>
      <span className="ll-stat__meta">{meta}</span>
    </>
  );
  return href ? (
    <Link href={href} className="ll-stat" style={{ textDecoration: 'none' }}>
      {body}
    </Link>
  ) : (
    <div className="ll-stat">{body}</div>
  );
}

/** The float's move over 24 hours, in pounds: a sweep in, or payouts out. */
function Change({ delta }: { delta: number }) {
  if (!delta) return <span>Unchanged in 24&nbsp;h</span>;
  return (
    <span className={delta > 0 ? 'll-up' : 'll-down'}>
      {delta > 0 ? 'Up' : 'Down'} {formatMoneyCompact(Math.abs(delta))} in 24&nbsp;h
    </span>
  );
}

function toRoman(n: number) {
  const numerals: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [value, mark] of numerals) {
    while (n >= value) {
      out += mark;
      n -= value;
    }
  }
  return out;
}
