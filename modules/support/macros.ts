/** Canned replies. `{merchant}` is replaced with the merchant's name. */
export const MACROS = [
  {
    id: 'held',
    label: 'Payout Held for Review',
    body: 'Hi {merchant}, thanks for your patience. Your payout is with our Risk team for a routine check, & most reviews finish within 4 hours. We’ll write the moment it’s released.',
  },
  {
    id: 'bank',
    label: 'Confirm New Bank Details',
    body: 'Hi {merchant}, we noticed your bank details changed recently. To keep your money safe, please confirm the change from your dashboard under Settings → Payouts, then reply here.',
  },
  {
    id: 'sent',
    label: 'Payout Sent',
    body: 'Hi {merchant}, good news: your payout has been sent. Faster Payments usually arrive within 2 hours; SWIFT can take 1–3 working days.',
  },
  {
    id: 'remittance',
    label: 'Remittance Advice Attached',
    body: 'Hi {merchant}, the remittance advice is now on your dashboard under Payouts → Statements. Is there anything else we can help with?',
  },
] as const;
