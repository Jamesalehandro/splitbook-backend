import { ApiError } from '../utils/error';
import { formatKobo, sumKobo } from '../utils/money';
import type { SplitInput } from '../validators/expense.validator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One person's slice, in kobo. What gets saved on the expense. */
export interface ComputedShare {
  user: string;
  amount: number;
  /** Carried through for percentage splits only, for the edit form. */
  percent?: number;
}

export interface ComputeSharesParams {
  /** The expense total, in kobo. */
  amount: number;
  split: SplitInput;
}

export interface DivideEvenlyParams {
  total: number;
  parts: number;
}

interface EqualSplitParams {
  amount: number;
  participants: string[];
}

interface ExactSplitParams {
  amount: number;
  shares: Array<{ user: string; amount: number }>;
}

interface PercentageSplitParams {
  amount: number;
  shares: Array<{ user: string; percent: number }>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Turns "₦15,000 split three ways" into three kobo amounts that add up to
 * EXACTLY the total.
 *
 * Pure: no database, no HTTP, no clock. Same input, same output, every time —
 * which is what makes it cheap to unit test exhaustively (`tests/split.test.ts`).
 *
 * Every split type ends up as the same `shares[]` of kobo amounts, so the rest
 * of the system — balances, settle-up, the dashboard — never needs to know how
 * a split was entered.
 */
export class SplitService {
  /** Percentages are handled as basis points: 1% = 100bp, 100% = 10,000bp. */
  private static readonly BASIS_POINTS_TOTAL = 10_000;

  static computeShares({ amount, split }: ComputeSharesParams): ComputedShare[] {
    switch (split.splitType) {
      case 'equal':
        return SplitService.equal({ amount, participants: split.participants });
      case 'exact':
        return SplitService.exact({ amount, shares: split.shares });
      case 'percentage':
        return SplitService.percentage({ amount, shares: split.shares });
    }
  }

  /**
   * Integer division with the leftover handed out one kobo at a time, to the
   * first participants in order.
   *
   *   divideEvenly({ total: 10000, parts: 3 })  ->  [3334, 3333, 3333]
   *
   * Never loses or invents a kobo: the parts always sum to `total`.
   */
  static divideEvenly({ total, parts }: DivideEvenlyParams): number[] {
    const base = Math.floor(total / parts);
    const leftover = total - base * parts;

    return Array.from({ length: parts }, (_, index) => base + (index < leftover ? 1 : 0));
  }

  /** The same person listed twice would be charged twice. */
  private static assertUnique(users: string[], field: string): void {
    const seen = new Set<string>();
    for (const user of users) {
      if (seen.has(user)) {
        throw ApiError.badRequest({
          message: 'Each participant may appear only once',
          errors: [{ field, message: `user ${user} appears more than once` }],
        });
      }
      seen.add(user);
    }
  }

  private static equal({ amount, participants }: EqualSplitParams): ComputedShare[] {
    if (participants.length === 0) {
      throw ApiError.badRequest({
        message: 'Choose at least one participant',
        errors: [{ field: 'participants', message: 'choose at least one participant' }],
      });
    }
    SplitService.assertUnique(participants, 'participants');

    const amounts = SplitService.divideEvenly({ total: amount, parts: participants.length });
    return participants.map((user, index) => ({ user, amount: amounts[index]! }));
  }

  private static exact({ amount, shares }: ExactSplitParams): ComputedShare[] {
    SplitService.assertUnique(
      shares.map((share) => share.user),
      'shares',
    );

    const sum = sumKobo(shares.map((share) => share.amount));
    if (sum !== amount) {
      const gap = amount - sum;
      throw ApiError.badRequest({
        message: 'Shares must add up to the total amount',
        errors: [
          {
            field: 'shares',
            message:
              gap > 0
                ? `shares are ${formatKobo(gap)} short of ${formatKobo(amount)}`
                : `shares are ${formatKobo(-gap)} over ${formatKobo(amount)}`,
          },
        ],
      });
    }

    return shares.map((share) => ({ user: share.user, amount: share.amount }));
  }

  /**
   * "33.33%" as basis points (3333), without trusting float maths.
   *
   * 33.33 * 100 is 3332.9999999999995 in JavaScript, so the product is rounded
   * — and then checked, so 33.333 (a third decimal) is rejected rather than
   * silently rounded into something the user did not type.
   */
  private static toBasisPoints(percent: number): number | null {
    const scaled = percent * 100;
    const rounded = Math.round(scaled);
    return Math.abs(scaled - rounded) < 1e-6 ? rounded : null;
  }

  private static percentage({ amount, shares }: PercentageSplitParams): ComputedShare[] {
    SplitService.assertUnique(
      shares.map((share) => share.user),
      'shares',
    );

    const basisPoints = shares.map((share, index) => {
      const bp = SplitService.toBasisPoints(share.percent);
      if (bp === null || bp <= 0) {
        throw ApiError.badRequest({
          message: 'Percentages may have at most 2 decimal places',
          errors: [{ field: `shares.${index}.percent`, message: 'use at most 2 decimal places' }],
        });
      }
      return bp;
    });

    const totalBp = sumKobo(basisPoints);
    if (totalBp !== SplitService.BASIS_POINTS_TOTAL) {
      throw ApiError.badRequest({
        message: 'Percentages must add up to 100',
        errors: [{ field: 'shares', message: `percentages add up to ${totalBp / 100}, not 100` }],
      });
    }

    // Round every share DOWN first. Each loses less than one kobo, so the
    // leftover is always smaller than the number of participants.
    const amounts = basisPoints.map((bp) =>
      Math.floor((amount * bp) / SplitService.BASIS_POINTS_TOTAL),
    );
    let leftover = amount - sumKobo(amounts);

    // Then hand the leftover out one kobo at a time, in order — the same rule
    // as an equal split.
    for (let index = 0; leftover > 0; index = (index + 1) % amounts.length) {
      amounts[index]! += 1;
      leftover -= 1;
    }

    return shares.map((share, index) => ({
      user: share.user,
      amount: amounts[index]!,
      percent: share.percent,
    }));
  }
}
