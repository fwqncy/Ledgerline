import { z } from 'zod';

export const PAYOUT_STATUSES = ['pending', 'review', 'paid', 'rejected'] as const;

/** Omit to list payouts in every status. */
export const PayoutStatus = z.enum(PAYOUT_STATUSES).optional();
export type PayoutStatus = z.infer<typeof PayoutStatus>;
