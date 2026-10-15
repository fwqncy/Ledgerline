import { CITIES } from '@ledgerline/core/geo';
import { z } from 'zod';

export const PAYOUT_STATUSES = ['pending', 'review', 'paid', 'rejected'] as const;

/** Omit to list payouts in every status. */
export const PayoutStatus = z.enum(PAYOUT_STATUSES).optional();
export type PayoutStatus = z.infer<typeof PayoutStatus>;

export const PAYOUT_SORTS = ['newest', 'oldest', 'largest', 'smallest'] as const;
export type PayoutSort = (typeof PAYOUT_SORTS)[number];

export const BrowseInput = z.object({
  status: PayoutStatus,
  q: z.string().trim().max(80).optional(),
  sort: z.enum(PAYOUT_SORTS).default('newest'),
  cursor: z.number().int().min(0).nullish(),
  limit: z.number().int().min(1).max(100).default(25),
});

export const CreatePayoutInput = z.object({
  beneficiary: z.string().trim().min(2, 'Enter the beneficiary’s name.').max(80, 'Keep the name under 80 characters.'),
  amount: z
    .number({ invalid_type_error: 'Enter an amount, like 1,250.00.' })
    .int()
    .positive('Enter an amount above £0.')
    .max(100_000_000, 'Payouts over £1,000,000 go through Treasury. Split it or contact them.'),
  reference: z
    .string()
    .trim()
    .min(3, 'Add a reference the beneficiary will recognise, like INV-2291.')
    .max(24, 'Keep the reference to 24 characters.')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers & hyphens only.'),
  city: z.string().refine((city) => city in CITIES, 'Choose a destination from the list.'),
  accountLast4: z.string().trim().regex(/^\d{4}$/, 'Enter the last 4 digits of the account.'),
  idempotencyKey: z.string().min(8).max(64),
});
export type CreatePayoutInput = z.infer<typeof CreatePayoutInput>;
