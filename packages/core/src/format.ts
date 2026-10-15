export const NBSP = ' ';

// `undefined` locale formats for the viewer's own locale; amounts are always GBP.
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' });
const moneyCompact = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const integer = new Intl.NumberFormat(undefined);

/** Formats an amount held in minor units (pence). */
export const formatMoney = (minor: number) => money.format(minor / 100);

/** £1.2M style, for headlines and chart axes. */
export const formatMoneyCompact = (minor: number) => moneyCompact.format(minor / 100);

export const formatPercent = (ratio: number) => percent.format(ratio);
export const formatInteger = (n: number) => integer.format(n);

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 0) {
    const ahead = Math.round(-seconds / 60);
    if (ahead < 60) return `in ${Math.max(1, ahead)}${NBSP}min`;
    const hours = Math.round(ahead / 60);
    return hours < 24 ? `in ${hours}${NBSP}h` : `in ${Math.round(hours / 24)}${NBSP}d`;
  }
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}${NBSP}min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days}${NBSP}d ago`;
  return `${Math.round(days / 30)}${NBSP}mo ago`;
}

export const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** Parses "1,234.56" or "1234" (pounds) into pence; null when it isn't a positive amount. */
export function parseMoneyInput(value: string): number | null {
  const cleaned = value.replace(/[£,\s]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(Number(cleaned) * 100);
  return pence > 0 ? pence : null;
}

/** Quotes a value for CSV, guarding against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (rows: unknown[][]) => rows.map((row) => row.map(csvCell).join(',')).join('\n');
