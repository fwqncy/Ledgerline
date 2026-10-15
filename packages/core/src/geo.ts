import type { PayoutMethod } from './db';

export interface City {
  country: string;
  lat: number;
  lng: number;
}

/** Where payouts are sent from. */
export const HQ = { city: 'London', country: 'GB', lat: 51.5072, lng: -0.1276 };

export const CITIES: Record<string, City> = {
  London: { country: 'GB', lat: 51.5072, lng: -0.1276 },
  Manchester: { country: 'GB', lat: 53.4808, lng: -2.2426 },
  Bristol: { country: 'GB', lat: 51.4545, lng: -2.5879 },
  Felixstowe: { country: 'GB', lat: 51.9617, lng: 1.3513 },
  Newcastle: { country: 'GB', lat: 54.9783, lng: -1.6178 },
  Edinburgh: { country: 'GB', lat: 55.9533, lng: -3.1883 },
  Glasgow: { country: 'GB', lat: 55.8642, lng: -4.2518 },
  Dublin: { country: 'IE', lat: 53.3498, lng: -6.2603 },
  Lisbon: { country: 'PT', lat: 38.7223, lng: -9.1393 },
  Amsterdam: { country: 'NL', lat: 52.3676, lng: 4.9041 },
  Riga: { country: 'LV', lat: 56.9496, lng: 24.1052 },
  Oslo: { country: 'NO', lat: 59.9139, lng: 10.7522 },
  Istanbul: { country: 'TR', lat: 41.0082, lng: 28.9784 },
  Dubai: { country: 'AE', lat: 25.2048, lng: 55.2708 },
  Mumbai: { country: 'IN', lat: 19.076, lng: 72.8777 },
  Singapore: { country: 'SG', lat: 1.3521, lng: 103.8198 },
  Osaka: { country: 'JP', lat: 34.6937, lng: 135.5023 },
  Sydney: { country: 'AU', lat: -33.8688, lng: 151.2093 },
  Johannesburg: { country: 'ZA', lat: -26.2041, lng: 28.0473 },
  Lagos: { country: 'NG', lat: 6.5244, lng: 3.3792 },
  Toronto: { country: 'CA', lat: 43.6532, lng: -79.3832 },
  'San Francisco': { country: 'US', lat: 37.7749, lng: -122.4194 },
  'New York': { country: 'US', lat: 40.7128, lng: -74.006 },
  Bogotá: { country: 'CO', lat: 4.711, lng: -74.0721 },
  'Buenos Aires': { country: 'AR', lat: -34.6037, lng: -58.3816 },
};

const SEPA = new Set(['IE', 'PT', 'NL', 'LV', 'NO']);

/** The rail a payout to this country goes over (large domestic payouts use Bacs). */
export function methodFor(country: string, amount: number): PayoutMethod {
  if (country === 'GB') return amount > 2_500_000 ? 'bacs' : 'faster';
  return SEPA.has(country) ? 'sepa' : 'swift';
}

export const METHOD_LABELS: Record<PayoutMethod, string> = {
  faster: 'Faster Payments',
  bacs: 'Bacs',
  sepa: 'SEPA',
  swift: 'SWIFT',
};
