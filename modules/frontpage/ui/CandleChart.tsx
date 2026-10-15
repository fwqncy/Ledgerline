'use client';

import { formatDate, formatInteger, formatMoney, formatMoneyCompact } from '@ledgerline/core/format';
import { prefersReducedMotion } from '@ledgerline/core/theme';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Candle } from '../service';

gsap.registerPlugin(useGSAP);

const HEIGHT = 380;
const VOLUME_HEIGHT = 70;
const GAP = 18;
const AXIS_WIDTH = 70;
const AXIS_HEIGHT = 22;
const TOP = 10;

/**
 * The Ticker: the funding account drawn as a trading chart. One candle per trading
 * day, hollow when the float rose and solid when payouts drew it down, with the
 * day's payout volume printed underneath in halftone.
 */
export function CandleChart({ candles, label, replayKey }: { candles: Candle[]; label: string; replayKey: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const timeline = useRef<gsap.core.Timeline | null>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const patternId = `ll-dots-${useId().replace(/:/g, '')}`;
  const summaryId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = candles.length;
  const plotWidth = Math.max(0, width - AXIS_WIDTH);
  const priceHeight = HEIGHT - VOLUME_HEIGHT - GAP - AXIS_HEIGHT - TOP;
  const step = n ? plotWidth / n : 0;
  const bodyWidth = Math.max(1, Math.min(14, step * 0.64));
  const rawLow = Math.min(...candles.map((c) => c.l));
  const rawHigh = Math.max(...candles.map((c) => c.h));
  const pad = (rawHigh - rawLow || 1) * 0.06;
  const low = rawLow - pad;
  const high = rawHigh + pad;
  const maxVolume = Math.max(1, ...candles.map((c) => c.volume));
  const volumeTop = TOP + priceHeight + GAP;

  const x = (i: number) => i * step + step / 2;
  const y = (v: number) => TOP + (1 - (v - low) / (high - low)) * priceHeight;
  const volumeHeight = (v: number) => (v / maxVolume) * VOLUME_HEIGHT;

  const ticks = Array.from({ length: 5 }, (_, i) => low + ((high - low) * i) / 4);
  const dateLabels = candles
    .map((c, i) => ({ i, date: new Date(c.t) }))
    .filter(({ i, date }) => {
      if (n <= 40) return i % 5 === 0;
      const prev = candles[i - 1];
      return i === 0 || (prev && new Date(prev.t).getUTCMonth() !== date.getUTCMonth());
    })
    // Drop the opening label when the first month is too short to fit it.
    .filter((label, k, all) => !(label.i === 0 && all[k + 1] && (all[k + 1]!.i - label.i) * step < 48));

  const ready = width > 0 && n > 0;
  const { contextSafe } = useGSAP(
    () => {
      if (!ready || prefersReducedMotion()) return;
      play();
    },
    { dependencies: [replayKey, ready], scope: svgRef },
  );

  /** Prints the candles left to right, like a market replay. */
  const play = contextSafe(() => {
    const svg = svgRef.current;
    if (!svg) return;
    timeline.current?.kill();
    const total = Math.min(2.6, 0.8 + n * 0.008);
    const each = total / Math.max(1, n);
    setPlaying(true);
    timeline.current = gsap
      .timeline({ onComplete: () => setPlaying(false) })
      .from(svg.querySelectorAll('.ll-candle'), { opacity: 0, scaleY: 0.05, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out', stagger: each }, 0)
      .from(svg.querySelectorAll('.ll-chart__vol'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.2, ease: 'power2.out', stagger: each }, 0)
      .from(svg.querySelectorAll('.ll-chart__last'), { opacity: 0, duration: 0.3 }, total);
  });

  const stop = () => {
    timeline.current?.progress(1).kill();
    setPlaying(false);
  };

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!step) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left) / step);
    setActive(index >= 0 && index < n ? index : null);
  }

  function onKeyDown(event: KeyboardEvent) {
    const current = active ?? n - 1;
    const moves: Record<string, number> = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: n - 1, PageUp: current - 5, PageDown: current + 5 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    setActive(Math.max(0, Math.min(n - 1, moves[event.key]!)));
  }

  if (!n) return <p className="ll-muted">No movements in this range yet.</p>;

  const first = candles[0]!;
  const last = candles[n - 1]!;
  const shown = candles[active ?? n - 1]!;
  const totalPaid = candles.reduce((sum, c) => sum + c.volume, 0);
  const totalCount = candles.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="ll-chart">
      <div className="ll-chart__controls ll-no-print">
        <p className="ll-chart__readout" aria-live="polite">
          <span>{formatDate(new Date(shown.t).toISOString())}</span>
          <span>
            O <b>{formatMoneyCompact(shown.o)}</b>
          </span>
          <span>
            H <b>{formatMoneyCompact(shown.h)}</b>
          </span>
          <span>
            L <b>{formatMoneyCompact(shown.l)}</b>
          </span>
          <span>
            C <b>{formatMoneyCompact(shown.c)}</b>
          </span>
          <span>
            Paid <b>{formatMoneyCompact(shown.volume)}</b> ({shown.count})
          </span>
        </p>
        {playing ? (
          <button type="button" className="ll-button ll-button--small ll-button--ghost" onClick={stop}>
            Skip Replay
          </button>
        ) : (
          <button type="button" className="ll-button ll-button--small" onClick={play}>
            ▶ Replay
          </button>
        )}
      </div>

      <div
        ref={wrapRef}
        className="ll-chart__canvas"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Treasury float, ${label}. Use the left & right arrow keys to read each trading day.`}
        aria-describedby={summaryId}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            onPointerMove={onPointerMove}
            onPointerLeave={() => setActive(null)}
            aria-hidden
          >
            <defs>
              <pattern id={patternId} width="3" height="3" patternUnits="userSpaceOnUse">
                <circle cx="1.5" cy="1.5" r="0.95" fill="currentColor" />
              </pattern>
            </defs>

            <g className="ll-chart__grid">
              {ticks.map((t) => (
                <line key={t} x1={0} x2={plotWidth} y1={y(t)} y2={y(t)} />
              ))}
              <line x1={0} x2={plotWidth} y1={volumeTop + VOLUME_HEIGHT} y2={volumeTop + VOLUME_HEIGHT} />
            </g>

            <g className="ll-chart__axis">
              {ticks.map((t) => (
                <text key={t} x={plotWidth + 8} y={y(t) + 4}>
                  {formatMoneyCompact(t)}
                </text>
              ))}
              {dateLabels.map(({ i, date }) => (
                <text key={i} x={x(i)} y={HEIGHT - 4} textAnchor={i === 0 ? 'start' : 'middle'}>
                  {n <= 40
                    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                    : date.getUTCMonth() === 0 || i === 0
                      ? date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
                      : date.toLocaleDateString(undefined, { month: 'short' })}
                </text>
              ))}
            </g>

            <g className="ll-chart__volume">
              {candles.map((c, i) => {
                const h = Math.max(1, volumeHeight(c.volume));
                return (
                  <rect
                    key={c.t}
                    className="ll-chart__vol"
                    x={x(i) - bodyWidth / 2}
                    y={volumeTop + VOLUME_HEIGHT - h}
                    width={bodyWidth}
                    height={h}
                    fill={`url(#${patternId})`}
                  />
                );
              })}
            </g>

            <g>
              {candles.map((c, i) => {
                const up = c.c >= c.o;
                const top = y(Math.max(c.o, c.c));
                return (
                  <g key={c.t} className={`ll-candle ll-candle--${up ? 'up' : 'down'}`}>
                    <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} />
                    <rect x={x(i) - bodyWidth / 2} y={top} width={bodyWidth} height={Math.max(1, y(Math.min(c.o, c.c)) - top)} />
                  </g>
                );
              })}
            </g>

            <g className="ll-chart__last ll-chart__crosshair">
              <line x1={0} x2={plotWidth} y1={y(last.c)} y2={y(last.c)} strokeDasharray="1 3" />
              <rect x={plotWidth + 2} y={y(last.c) - 9} width={AXIS_WIDTH - 2} height={18} />
              <text x={plotWidth + 8} y={y(last.c) + 4}>
                {formatMoneyCompact(last.c)}
              </text>
            </g>

            {active !== null && (
              <g className="ll-chart__crosshair">
                <line x1={x(active)} x2={x(active)} y1={TOP} y2={volumeTop + VOLUME_HEIGHT} />
                <line x1={0} x2={plotWidth} y1={y(shown.c)} y2={y(shown.c)} />
                <rect x={plotWidth + 2} y={y(shown.c) - 9} width={AXIS_WIDTH - 2} height={18} />
                <text x={plotWidth + 8} y={y(shown.c) + 4}>
                  {formatMoneyCompact(shown.c)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>

      <p id={summaryId} className="ll-visually-hidden">
        Over {label} the float moved from {formatMoney(first.o)} on {formatDate(new Date(first.t).toISOString())} to{' '}
        {formatMoney(last.c)}, peaking at {formatMoney(rawHigh)} with a low of {formatMoney(rawLow)}.{' '}
        {formatMoney(totalPaid)} went out across {formatInteger(totalCount)} payouts.
      </p>

      <ul className="ll-legend">
        <li>
          <span className="ll-legend__swatch" aria-hidden /> Float rose that day
        </li>
        <li>
          <span className="ll-legend__swatch ll-legend__swatch--down" aria-hidden /> Payouts drew it down
        </li>
        <li>
          <span className="ll-legend__swatch ll-legend__swatch--volume" aria-hidden /> Paid out that day
        </li>
        <li className="ll-mono">
          {formatMoney(totalPaid)} paid · {formatInteger(totalCount)} payouts
        </li>
      </ul>
    </div>
  );
}
