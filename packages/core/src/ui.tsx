'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { formatMoney, formatRelative } from './format';

const TONES: Record<string, string> = {
  pending: 'amber',
  open: 'amber',
  review: 'pink',
  waiting: 'pink',
  paid: 'green',
  cleared: 'green',
  resolved: 'green',
  rejected: 'red',
  high: 'red',
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`ll-pill ll-pill--${TONES[status] ?? 'neutral'}`}>{status}</span>;
}

export function Money({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={`ll-mono ${className ?? ''}`} translate="no">
      {formatMoney(amount)}
    </span>
  );
}

/** Identifiers and codes: monospace, never machine-translated. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <span className="ll-mono" translate="no">
      {children}
    </span>
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

/**
 * Notices render inside a polite live region that is always mounted,
 * so screen readers announce them when they appear.
 */
export function Notice({
  notice,
  onDismiss,
}: {
  notice: { tone: 'error' | 'success'; text: ReactNode } | null;
  onDismiss: () => void;
}) {
  return (
    <div aria-live="polite" className="ll-live">
      {notice && (
        <div className={`ll-notice ll-notice--${notice.tone}`}>
          <span>{notice.text}</span>
          <button type="button" className="ll-notice__close" onClick={onDismiss} aria-label="Dismiss message">
            <span aria-hidden>×</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** Builds a link to the current page with some search params changed (undefined removes one). */
export function useHrefWith() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined) next.delete(key);
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

/** "⌘ Enter" on Apple platforms, "Ctrl Enter" elsewhere. */
export function SubmitShortcut() {
  const [mod, setMod] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setMod('⌘');
  }, []);
  return (
    <kbd className="ll-kbd" suppressHydrationWarning>
      {mod}&nbsp;Enter
    </kbd>
  );
}
