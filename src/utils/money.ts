/**
 * Money handling.
 *
 * Every amount in this system is an INTEGER number of kobo (₦1 = 100 kobo).
 * Floats never touch an amount: 0.1 + 0.2 is 0.30000000000000004 in
 * JavaScript, and a split app that is off by a kobo is a split app people stop
 * trusting. The frontend accepts naira, converts to kobo, and sends integers.
 */
export const KOBO_PER_NAIRA = 100;

/**
 * ₦100,000,000 in kobo. A sanity guard against a fat-fingered amount, not a
 * business limit — and it keeps every sum comfortably inside
 * `Number.MAX_SAFE_INTEGER`, even when multiplied by a percentage.
 */
export const MAX_AMOUNT_KOBO = 10_000_000_000;

/** For human-facing messages: 1500000 -> "₦15,000.00", -500 -> "-₦5.00". */
export function formatKobo(kobo: number): string {
  const naira = Math.abs(kobo) / KOBO_PER_NAIRA;
  const formatted = naira.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${kobo < 0 ? '-' : ''}₦${formatted}`;
}

/** Adds up a list of kobo amounts. */
export function sumKobo(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
