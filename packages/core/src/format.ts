const NBSP = ' ';

// `undefined` locale formats for the viewer's own locale; amounts are always GBP.
const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' });

/** Formats an amount held in minor units (pence). */
export const formatMoney = (minor: number) => money.format(minor / 100);

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}${NBSP}min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}${NBSP}h ago`;
  return `${Math.round(hours / 24)}${NBSP}d ago`;
}

export const formatTimestamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
