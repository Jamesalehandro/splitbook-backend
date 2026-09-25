import { describe, expect, it } from 'vitest';

import { SplitService } from '../src/services/split.service';
import { ApiError } from '../src/utils/error';
import { MoneyUtils } from '../src/utils/money';

const A = 'a'.repeat(24);
const B = 'b'.repeat(24);
const C = 'c'.repeat(24);

function expectBadRequest(run: () => unknown, message: string): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).statusCode).toBe(400);
    expect((error as ApiError).message).toBe(message);
    return;
  }
  throw new Error('expected an ApiError to be thrown');
}

describe('SplitService', () => {
  describe('equal', () => {
    it('splits ₦100 three ways as 3334, 3333, 3333 kobo', () => {
      const shares = SplitService.computeShares({
        amount: 10_000,
        split: { splitType: 'equal', participants: [A, B, C] },
      });

      expect(shares.map((share) => share.amount)).toEqual([3334, 3333, 3333]);
    });

    it('gives the leftover kobo to participants in the order sent', () => {
      const shares = SplitService.computeShares({
        amount: 10_000,
        split: { splitType: 'equal', participants: [C, A, B] },
      });

      expect(shares).toEqual([
        { user: C, amount: 3334 },
        { user: A, amount: 3333 },
        { user: B, amount: 3333 },
      ]);
    });

    it('never loses or invents a kobo, for any total and group size', () => {
      for (let total = 1; total <= 2_000; total += 7) {
        for (let parts = 1; parts <= 9; parts += 1) {
          const amounts = SplitService.divideEvenly({ total, parts });
          expect(MoneyUtils.sum(amounts)).toBe(total);
          expect(
            Math.max(...amounts) - Math.min(...amounts),
          ).toBeLessThanOrEqual(1);
        }
      }
    });

    it('rejects the same participant twice', () => {
      expectBadRequest(
        () =>
          SplitService.computeShares({
            amount: 1_000,
            split: { splitType: 'equal', participants: [A, A] },
          }),
        'Each participant may appear only once',
      );
    });
  });

  describe('exact', () => {
    it('keeps the shares exactly as sent when they sum to the total', () => {
      const shares = SplitService.computeShares({
        amount: 1_500_000,
        split: {
          splitType: 'exact',
          shares: [
            { user: A, amount: 500_000 },
            { user: B, amount: 1_000_000 },
          ],
        },
      });

      expect(shares).toEqual([
        { user: A, amount: 500_000 },
        { user: B, amount: 1_000_000 },
      ]);
    });

    it('rejects shares that do not add up to the total', () => {
      expectBadRequest(
        () =>
          SplitService.computeShares({
            amount: 1_500_000,
            split: {
              splitType: 'exact',
              shares: [
                { user: A, amount: 500_000 },
                { user: B, amount: 900_000 },
              ],
            },
          }),
        'Shares must add up to the total amount',
      );
    });

    it('rejects shares that add up to MORE than the total', () => {
      expectBadRequest(
        () =>
          SplitService.computeShares({
            amount: 1_000,
            split: {
              splitType: 'exact',
              shares: [
                { user: A, amount: 600 },
                { user: B, amount: 600 },
              ],
            },
          }),
        'Shares must add up to the total amount',
      );
    });
  });

  describe('percentage', () => {
    it('splits by percent and hands out the leftover kobo in order', () => {
      // 33.33% + 33.33% + 33.34% of 10,000 kobo = 3333, 3333, 3334 — no leftover.
      const shares = SplitService.computeShares({
        amount: 10_000,
        split: {
          splitType: 'percentage',
          shares: [
            { user: A, percent: 33.33 },
            { user: B, percent: 33.33 },
            { user: C, percent: 33.34 },
          ],
        },
      });

      expect(shares.map((share) => share.amount)).toEqual([3333, 3333, 3334]);
    });

    it('rounds down first, then gives the leftover to the first participants', () => {
      // 50/50 of 101 kobo: 50.5 each -> 50 + 50, one leftover kobo to A.
      const shares = SplitService.computeShares({
        amount: 101,
        split: {
          splitType: 'percentage',
          shares: [
            { user: A, percent: 50 },
            { user: B, percent: 50 },
          ],
        },
      });

      expect(shares.map((share) => share.amount)).toEqual([51, 50]);
      expect(shares.map((share) => share.percent)).toEqual([50, 50]);
    });

    it('always sums to the total', () => {
      for (let amount = 1; amount <= 5_000; amount += 13) {
        const shares = SplitService.computeShares({
          amount,
          split: {
            splitType: 'percentage',
            shares: [
              { user: A, percent: 12.5 },
              { user: B, percent: 37.25 },
              { user: C, percent: 50.25 },
            ],
          },
        });
        expect(MoneyUtils.sum(shares.map((share) => share.amount))).toBe(
          amount,
        );
      }
    });

    it('rejects percentages that do not add up to 100', () => {
      expectBadRequest(
        () =>
          SplitService.computeShares({
            amount: 10_000,
            split: {
              splitType: 'percentage',
              shares: [
                { user: A, percent: 50 },
                { user: B, percent: 40 },
              ],
            },
          }),
        'Percentages must add up to 100',
      );
    });

    it('rejects more than two decimal places rather than silently rounding', () => {
      expectBadRequest(
        () =>
          SplitService.computeShares({
            amount: 10_000,
            split: {
              splitType: 'percentage',
              shares: [
                { user: A, percent: 33.333 },
                { user: B, percent: 66.667 },
              ],
            },
          }),
        'Percentages may have at most 2 decimal places',
      );
    });
  });
});
