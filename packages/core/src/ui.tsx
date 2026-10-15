'use client';

import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { formatMoney, formatRelative } from './format';
import { prefersReducedMotion } from './theme';
import { toast, type Toast } from './toast';

gsap.registerPlugin(useGSAP);

export { toast } from './toast';

/* ------------------------------------------------------------------ text bits */

const TONES: Record<string, string> = {
  pending: 'pending',
  open: 'pending',
  review: 'review',
  waiting: 'review',
  paid: 'paid',
  cleared: 'paid',
  resolved: 'paid',
  rejected: 'rejected',
  high: 'rejected',
  breached: 'rejected',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  return <span className={`ll-pill ll-pill--${TONES[status] ?? 'neutral'}`}>{label ?? status}</span>;
}

export function Money({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={`ll-mono ${className ?? ''}`} translate="no">
      {formatMoney(amount)}
    </span>
  );
}

/** Identifiers and codes: typewriter face, never machine-translated, optionally copyable. */
export function Code({ children, copy }: { children: string; copy?: boolean }) {
  return (
    <span className="ll-code">
      <span className="ll-mono" translate="no">
        {children}
      </span>
      {copy && <CopyButton value={children} />}
    </span>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="ll-copy"
      aria-label={copied ? `Copied ${value}` : `${label} ${value}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
        } catch {
          toast.show({ tone: 'error', title: 'Couldn’t copy. Select the text & copy it manually.' });
        }
      }}
    >
      <span aria-hidden>{copied ? '✓' : '⧉'}</span>
      <span className="ll-visually-hidden" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </button>
  );
}

export function RelativeTime({ iso, prefix }: { iso: string; prefix?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} suppressHydrationWarning>
      {prefix}
      {formatRelative(iso, now ?? undefined)}
    </time>
  );
}

export function Spinner() {
  return <span className="ll-spinner" aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ll-kbd">{children}</kbd>;
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function useModKey() {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod('⌘');
  }, []);
  return mod;
}

export function SubmitShortcut() {
  const mod = useModKey();
  return (
    <Kbd>
      <span suppressHydrationWarning>{mod}</span>&nbsp;Enter
    </Kbd>
  );
}

/* --------------------------------------------------------------- page layout */

/** Section header: a small-caps kicker, a poster title with printed echoes and a serif deck. */
export function PageHeader({
  kicker,
  title,
  deck,
  actions,
}: {
  kicker: string;
  title: string;
  deck?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ll-head">
      <div className="ll-head__text">
        <p className="ll-kicker">{kicker}</p>
        <h1 className="ll-title">
          <span className="ll-title__echo" aria-hidden>
            {title}
          </span>
          <span className="ll-title__echo ll-title__echo--2" aria-hidden>
            {title}
          </span>
          <span className="ll-title__text">{title}</span>
        </h1>
        {deck && <p className="ll-deck">{deck}</p>}
      </div>
      {actions && <div className="ll-head__actions">{actions}</div>}
    </header>
  );
}

/** A ruled box with an inverted label bar, like the panels of a poster. */
export function Box({
  label,
  meta,
  children,
  className,
  labelId,
}: {
  label?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  labelId?: string;
}) {
  const fallbackId = useId();
  const id = labelId ?? fallbackId;
  return (
    <section className={`ll-box ${className ?? ''}`} aria-labelledby={label ? id : undefined}>
      {label && (
        <header className="ll-box__head">
          <h2 id={id} className="ll-box__label">
            {label}
          </h2>
          {meta && <div className="ll-box__meta">{meta}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="ll-empty">{children}</div>;
}

/** Placeholder rows with the same geometry as a list row, revealed after a short delay to avoid flicker. */
export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="ll-list ll-skeletons" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ll-row ll-row--static" aria-hidden>
          <span className="ll-row__main">
            <span className="ll-skeleton ll-skeleton--title" style={{ width: `${44 - (i % 3) * 8}%` }} />
            <span className="ll-skeleton ll-skeleton--meta" />
          </span>
          <span className="ll-skeleton ll-skeleton--end" />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- URL state */

/** Builds a link to the current page with some search params changed (undefined removes one). */
export function useHrefWith() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
}

/** Filter links, so every filter is a shareable, back-button-friendly URL. */
export function FilterLinks<T extends string | undefined>({
  label,
  param,
  options,
  value,
  reset = [],
}: {
  label: string;
  param: string;
  options: readonly { label: string; value: T; count?: number }[];
  value: T;
  /** Other params to clear when the filter changes. */
  reset?: string[];
}) {
  const hrefWith = useHrefWith();
  return (
    <nav className="ll-segmented" aria-label={label}>
      {options.map((option) => (
        <Link
          key={option.label}
          href={hrefWith({ [param]: option.value, ...Object.fromEntries(reset.map((k) => [k, undefined])) })}
          scroll={false}
          replace
          aria-current={option.value === value ? 'true' : undefined}
          className="ll-segmented__item"
        >
          {option.label}
          {option.count !== undefined && <span className="ll-segmented__count">{option.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/* --------------------------------------------------------------- keyboard */

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));

/**
 * Single-key shortcuts. Uses `event.key`, so they follow the viewer's keyboard
 * layout, and stay quiet while typing or when a dialog is open.
 */
export function useHotkeys(bindings: Record<string, (event: KeyboardEvent) => void>, enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return;
      const handler = ref.current[event.key];
      if (handler) {
        event.preventDefault();
        handler(event);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/* --------------------------------------------------------------- dialogs */

/**
 * Native modal dialog: traps focus, closes on Escape and returns focus to the
 * trigger. `canClose` lets forms warn before discarding unsaved input.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  canClose,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  canClose?: () => boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const requestClose = () => {
    if (canClose && !canClose()) return;
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className={`ll-dialog ${wide ? 'll-dialog--wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
    >
      {open && (
        <div className="ll-dialog__inner">
          <header className="ll-dialog__head">
            <h2 id={titleId} className="ll-dialog__title">
              {title}
            </h2>
            <button type="button" className="ll-icon-button" aria-label="Close dialog" onClick={requestClose}>
              <span aria-hidden>×</span>
            </button>
          </header>
          {description && (
            <p id={descriptionId} className="ll-dialog__description">
              {description}
            </p>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}

/* --------------------------------------------------------------- toasts */

const NO_TOASTS: Toast[] = [];

/** Renders the shared toast stack inside a polite live region. */
export function Toaster() {
  const toasts = useSyncExternalStore(toast.subscribe, toast.snapshot, () => NO_TOASTS);
  return (
    <section className="ll-toaster" aria-label="Notifications">
      <ol aria-live="polite" aria-relevant="additions text">
        {toasts.map((t) => (
          <ToastItem key={t.id} item={t} />
        ))}
      </ol>
    </section>
  );
}

function ToastItem({ item }: { item: Toast }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    // Countdown toasts are timed by the store; others wait while hovered or focused.
    if (item.countdown || !item.duration || paused) return;
    const timer = setTimeout(() => toast.dismiss(item.id), item.duration);
    return () => clearTimeout(timer);
  }, [item, paused]);

  return (
    <li
      className={`ll-toast ll-toast--${item.tone}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="ll-toast__text">
        <p className="ll-toast__title">{item.title}</p>
        {item.body && <p className="ll-toast__body">{item.body}</p>}
      </div>
      {item.action && (
        <button type="button" className="ll-toast__action" onClick={item.action.onClick}>
          {item.action.label}
        </button>
      )}
      <button type="button" className="ll-icon-button ll-toast__close" aria-label="Dismiss notification" onClick={() => toast.dismiss(item.id)}>
        <span aria-hidden>×</span>
      </button>
      {item.countdown && (
        <span className="ll-toast__countdown" style={{ animationDuration: `${item.duration}ms` }} aria-hidden />
      )}
    </li>
  );
}

/* --------------------------------------------------------------- motion pieces */

/** An inked rubber stamp. Pass `slam` to animate it landing (cause & effect for a status change). */
export function Stamp({ label, tone, slam }: { label: string; tone: string; slam?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useGSAP(
    () => {
      if (!slam || !ref.current || prefersReducedMotion()) return;
      gsap
        .timeline()
        .fromTo(
          ref.current,
          { scale: 2.4, opacity: 0, rotate: -20 },
          { scale: 1, opacity: 0.92, rotate: -7, duration: 0.32, ease: 'power4.in' },
        )
        .fromTo(ref.current, { y: 2 }, { y: 0, duration: 0.3, ease: 'elastic.out(1, 0.35)' });
    },
    { dependencies: [label, slam] },
  );
  return (
    <span ref={ref} className={`ll-stamp ll-stamp--${tone}`} role="img" aria-label={`Stamped ${label}`}>
      {label}
    </span>
  );
}

/** A figure that counts up when it first appears or changes. Screen readers get the final value only. */
export function CountUp({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);
  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const from = shown.current ?? 0;
      shown.current = value;
      if (from === value || prefersReducedMotion()) {
        el.textContent = format(value);
        return;
      }
      const counter = { n: from };
      gsap.to(counter, {
        n: value,
        duration: 0.9,
        ease: 'power3.out',
        onUpdate: () => {
          el.textContent = format(Math.round(counter.n));
        },
      });
    },
    { dependencies: [value] },
  );
  return (
    <span className={className} translate="no">
      <span ref={ref} aria-hidden>
        {format(value)}
      </span>
      <span className="ll-visually-hidden">{format(value)}</span>
    </span>
  );
}

export interface TickerItem {
  id: string;
  text: ReactNode;
  href?: string;
}

/**
 * A wire-service ticker tape. It scrolls continuously, so it pauses on hover or
 * focus and has its own pause button; with reduced motion it sits still and scrolls by hand.
 */
export function TickerTape({ label, items }: { label: string; items: TickerItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tween = useRef<gsap.core.Tween | null>(null);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const signature = items.map((i) => i.id).join('|');

  useGSAP(
    () => {
      const track = trackRef.current;
      if (!track || !items.length || prefersReducedMotion()) {
        setStill(true);
        return;
      }
      setStill(false);
      // One copy's width (each list carries its own trailing gap), so the loop is seamless.
      const distance = (track.firstElementChild as HTMLElement).offsetWidth;
      tween.current = gsap.fromTo(track, { x: 0 }, { x: -distance, duration: distance / 55, ease: 'none', repeat: -1 });
      if (pausedRef.current) tween.current.pause();
    },
    { dependencies: [signature], revertOnUpdate: true },
  );

  useEffect(() => {
    if (paused) tween.current?.pause();
    else tween.current?.resume();
  }, [paused]);

  const hold = () => tween.current?.pause();
  const release = () => {
    if (!pausedRef.current) tween.current?.resume();
  };

  const renderItems = (copy: boolean) =>
    items.map((item) => (
      <li key={`${copy ? 'b' : 'a'}-${item.id}`} className="ll-ticker__item">
        {item.href ? (
          <Link href={item.href} tabIndex={copy ? -1 : undefined}>
            {item.text}
          </Link>
        ) : (
          item.text
        )}
      </li>
    ));

  return (
    <div className="ll-ticker" data-still={still || undefined}>
      <p className="ll-ticker__label">{label}</p>
      <div className="ll-ticker__viewport" onMouseEnter={hold} onMouseLeave={release} onFocus={hold} onBlur={release}>
        <div ref={trackRef} className="ll-ticker__track">
          <ul className="ll-ticker__list">{renderItems(false)}</ul>
          <ul className="ll-ticker__list ll-ticker__list--copy" aria-hidden>
            {renderItems(true)}
          </ul>
        </div>
      </div>
      {!still && (
        <button
          type="button"
          className="ll-ticker__toggle"
          aria-pressed={paused}
          aria-label={paused ? 'Play ticker' : 'Pause ticker'}
          onClick={() => setPaused((p) => !p)}
        >
          <span aria-hidden>{paused ? '▶' : '❚❚'}</span>
        </button>
      )}
    </div>
  );
}

/** A tiny trend line for tables. Decorative; pair it with the figures it summarises. */
export function Sparkline({ values, width = 96, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const step = (width - 2) / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`);
  return (
    <svg className="ll-sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={width - 2} cy={points.at(-1)!.split(',')[1]} r="2" fill="currentColor" />
    </svg>
  );
}
