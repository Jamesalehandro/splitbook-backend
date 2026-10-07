import { describe, expect, it } from 'vitest';

import {
  BalanceService,
  type LedgerExpense,
  type LedgerSettlement,
} from '../src/services/balance.service';
import { SplitService } from '../src/services/split.service';
import { sumKobo } from '../src/utils/money';

const PEOPLE = ['ada', 'tolu', 'chidi', 'bola', 'emeka', 'funmi'];

/** A small deterministic random generator, so a failure reproduces exactly. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

function randomLedger(seed: number): {
  expenses: LedgerExpense[];
  settlements: LedgerSettlement[];
} {
  const random = seededRandom(seed);
  const pick = (): string => PEOPLE[Math.floor(random() * PEOPLE.length)]!;

  const expenses: LedgerExpense[] = Array.from(
    { length: 1 + Math.floor(random() * 8) },
    () => {
      const amount = 1 + Math.floor(random() * 5_000_000);
      const participants = [
        ...new Set(Array.from({ length: 1 + Math.floor(random() * 5) }, pick)),
      ];
      const shares = SplitService.computeShares({
        amount,
        split: { splitType: 'equal', participants },
      });
      return { paidBy: pick(), amount, shares };
    },
  );

  const settlements: LedgerSettlement[] = Array.from(
    { length: Math.floor(random() * 4) },
    () => {
      const from = pick();
      let to = pick();
      while (to === from) to = pick();
      return { from, to, amount: 1 + Math.floor(random() * 1_000_000) };
    },
  );

  return { expenses, settlements };
}

describe('BalanceService.computeNetBalances', () => {
  it('credits the payer and debits each participant', () => {
    const nets = BalanceService.computeNetBalances({
      expenses: [
        {
          paidBy: 'ada',
          amount: 30_000,
          shares: [
            { user: 'ada', amount: 10_000 },
            { user: 'tolu', amount: 10_000 },
            { user: 'chidi', amount: 10_000 },
          ],
        },
      ],
      settlements: [],
    });

    expect(Object.fromEntries(nets)).toEqual({
      ada: 20_000,
      tolu: -10_000,
      chidi: -10_000,
    });
  });

  it('moves both sides towards zero when a settlement is recorded', () => {
    const nets = BalanceService.computeNetBalances({
      expenses: [
        {
          paidBy: 'ada',
          amount: 20_000,
          shares: [
            { user: 'ada', amount: 10_000 },
            { user: 'tolu', amount: 10_000 },
          ],
        },
      ],
      settlements: [{ from: 'tolu', to: 'ada', amount: 10_000 }],
    });

    expect(Object.fromEntries(nets)).toEqual({ ada: 0, tolu: 0 });
  });

  it('lists `include`d members at 0 even with no activity', () => {
    const nets = BalanceService.computeNetBalances({
      expenses: [],
      settlements: [],
      include: ['ada', 'tolu'],
    });

    expect(Object.fromEntries(nets)).toEqual({ ada: 0, tolu: 0 });
  });

  it('always sums to 0 across the group (300 random groups)', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const nets = BalanceService.computeNetBalances(randomLedger(seed));
      expect(sumKobo([...nets.values()]), `seed ${seed}`).toBe(0);
    }
  });
});

describe('BalanceService.simplifyDebts', () => {
  it('matches the largest debtor with the largest creditor', () => {
    const transfers = BalanceService.simplifyDebts(
      new Map([
        ['ada', 30_000],
        ['tolu', -20_000],
        ['chidi', -10_000],
      ]),
    );

    expect(transfers).toEqual([
      { from: 'tolu', to: 'ada', amount: 20_000 },
      { from: 'chidi', to: 'ada', amount: 10_000 },
    ]);
  });

  it('returns nothing when everyone is at 0', () => {
    expect(
      BalanceService.simplifyDebts(
        new Map([
          ['ada', 0],
          ['tolu', 0],
        ]),
      ),
    ).toEqual([]);
  });

  it('settles everyone with at most n − 1 transfers (300 random groups)', () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const nets = BalanceService.computeNetBalances(randomLedger(seed));
      const transfers = BalanceService.simplifyDebts(nets);

      const people = [...nets.values()].filter((net) => net !== 0).length;
      expect(transfers.length, `seed ${seed}`).toBeLessThanOrEqual(
        Math.max(0, people - 1),
      );

      // Applying the plan brings every balance to exactly 0.
      const after = BalanceService.computeNetBalances({
        ...randomLedger(seed),
        settlements: [...randomLedger(seed).settlements, ...transfers],
      });
      for (const [person, net] of after) {
        expect(net, `seed ${seed}, ${person}`).toBe(0);
      }

      for (const transfer of transfers) {
        expect(transfer.amount).toBeGreaterThan(0);
        expect(Number.isInteger(transfer.amount)).toBe(true);
      }
    }
  });

  it('produces the same plan every time for the same balances', () => {
    const nets = new Map([
      ['ada', 10_000],
      ['tolu', 10_000],
      ['chidi', -10_000],
      ['bola', -10_000],
    ]);

    expect(BalanceService.simplifyDebts(nets)).toEqual(
      BalanceService.simplifyDebts(new Map(nets)),
    );
  });
});
