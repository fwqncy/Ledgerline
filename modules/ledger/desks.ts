export const DESKS = ['payouts', 'risk', 'support'] as const;
export type Desk = (typeof DESKS)[number];
