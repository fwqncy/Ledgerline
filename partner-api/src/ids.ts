import { randomBytes } from 'node:crypto';

/** Stripe-style prefixed ids: `po_9c1e4b0a7f3d`. */
export function newId(prefix: string, bytes = 6): string {
  return `${prefix}_${randomBytes(bytes).toString('hex')}`;
}
