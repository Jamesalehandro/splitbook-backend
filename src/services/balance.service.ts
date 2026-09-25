import type { Types } from 'mongoose';

import { ExpenseModel } from '../models/expense.model';
import type { GroupDocument } from '../models/group.model';
import { SettlementModel } from '../models/settlement.model';
import { UserModel } from '../models/user.model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The only parts of an expense that affect money. */
export interface LedgerExpense {
  paidBy: string;
  amount: number;
  shares: Array<{ user: string; amount: number }>;
}

/** The only parts of a settlement that affect money. */
export interface LedgerSettlement {
  from: string;
  to: string;
  amount: number;
}

export interface ComputeNetBalancesParams {
  expenses: LedgerExpense[];
  settlements: LedgerSettlement[];
  /** Anyone listed here appears in the result even at 0 — current members, typically. */
  include?: string[];
}

/** One "X pays Y" instruction, by user id. */
export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface UserSummary {
  id: string;
  name: string;
  email: string;
}

export interface MemberBalance {
  user: UserSummary;
  /** Positive = the group owes them. Negative = they owe the group. Kobo. */
  net: number;
  /** False only for a former member — which the rules keep at 0. */
  isMember: boolean;
}

export interface GetNetForParams {
  group: GroupDocument;
  userId: Types.ObjectId | string;
}

export interface SettleUpItem {
  from: Pick<UserSummary, 'id' | 'name'>;
  to: Pick<UserSummary, 'id' | 'name'>;
  amount: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Who owes whom.
 *
 * Balances are NEVER stored. They are recomputed from the expenses and
 * settlements every time they are asked for, so no edit, delete or bug in some
 * other code path can leave a stored balance out of step with the history that
 * produced it.
 *
 * The two pure functions — `computeNetBalances` and `simplifyDebts` — hold all
 * of the maths and are unit tested without a database. The `get*` methods only
 * load data and hand it to them.
 */
export class BalanceService {
  /**
   *   net(u) = Σ paid(u) − Σ share(u) + Σ settlementsSent(u) − Σ settlementsReceived(u)
   *
   * Read it as: you are owed what you paid for others, minus what others paid
   * for you. Paying someone back moves you towards zero from below; being paid
   * back moves you towards zero from above.
   *
   * Every kobo is added to one person and subtracted from another, so the nets
   * of a group ALWAYS sum to 0. `tests/balance.test.ts` asserts that.
   */
  static computeNetBalances({
    expenses,
    settlements,
    include = [],
  }: ComputeNetBalancesParams): Map<string, number> {
    const nets = new Map<string, number>(include.map((id) => [id, 0]));
    const add = (user: string, amount: number): void => {
      nets.set(user, (nets.get(user) ?? 0) + amount);
    };

    for (const expense of expenses) {
      add(expense.paidBy, expense.amount);
      for (const share of expense.shares) {
        add(share.user, -share.amount);
      }
    }

    for (const settlement of settlements) {
      add(settlement.from, settlement.amount);
      add(settlement.to, -settlement.amount);
    }

    return nets;
  }

  /**
   * The fewest-ish transfers that bring everyone to zero (greedy):
   *
   *   1. split into creditors (net > 0) and debtors (net < 0)
   *   2. match the LARGEST debtor with the LARGEST creditor
   *   3. transfer the smaller of the two amounts
   *   4. reduce both, drop anyone now at 0, repeat
   *
   * Each round zeroes at least one person, so n people need at most n − 1
   * transfers. Ties are broken by user id so the same balances always produce
   * the same plan — a list that reshuffles on every refresh looks broken.
   */
  static simplifyDebts(nets: Map<string, number>): Transfer[] {
    const creditors: Array<{ id: string; amount: number }> = [];
    const debtors: Array<{ id: string; amount: number }> = [];

    for (const [id, net] of nets) {
      if (net > 0) creditors.push({ id, amount: net });
      if (net < 0) debtors.push({ id, amount: -net });
    }

    const largestFirst = (
      a: { id: string; amount: number },
      b: { id: string; amount: number },
    ): number => b.amount - a.amount || a.id.localeCompare(b.id);

    const transfers: Transfer[] = [];

    while (creditors.length > 0 && debtors.length > 0) {
      // Re-sorted every round: after a partial payment the person who WAS
      // largest may not be any more. Groups are small, so this costs nothing.
      creditors.sort(largestFirst);
      debtors.sort(largestFirst);

      const creditor = creditors[0]!;
      const debtor = debtors[0]!;
      const amount = Math.min(creditor.amount, debtor.amount);

      transfers.push({ from: debtor.id, to: creditor.id, amount });

      creditor.amount -= amount;
      debtor.amount -= amount;
      if (creditor.amount === 0) creditors.shift();
      if (debtor.amount === 0) debtors.shift();
    }

    return transfers;
  }

  /** Current member ids, as strings. */
  static memberIds(group: GroupDocument): string[] {
    return group.members.map((member) => String(member.user));
  }

  /**
   * Loads one group's ledger and computes every net.
   *
   * `.lean()` returns plain objects instead of full Mongoose documents — much
   * cheaper, and all that is needed for arithmetic. If a group ever grows to
   * thousands of expenses, this is the one method to swap for an aggregation
   * or a cached balance; nothing that calls it would change.
   */
  static async getNetBalances(group: GroupDocument): Promise<Map<string, number>> {
    const [expenses, settlements] = await Promise.all([
      ExpenseModel.find({ group: group._id, isDeleted: false })
        .select('paidBy amount shares.user shares.amount')
        .lean(),
      SettlementModel.find({ group: group._id }).select('from to amount').lean(),
    ]);

    return BalanceService.computeNetBalances({
      expenses: expenses.map((expense) => ({
        paidBy: String(expense.paidBy),
        amount: expense.amount,
        shares: expense.shares.map((share) => ({ user: String(share.user), amount: share.amount })),
      })),
      settlements: settlements.map((settlement) => ({
        from: String(settlement.from),
        to: String(settlement.to),
        amount: settlement.amount,
      })),
      include: BalanceService.memberIds(group),
    });
  }

  /** One user's net in one group. */
  static async getNetFor({ group, userId }: GetNetForParams): Promise<number> {
    const nets = await BalanceService.getNetBalances(group);
    return nets.get(String(userId)) ?? 0;
  }

  /** True when nobody in the group owes or is owed anything. */
  static async isFullySettled(group: GroupDocument): Promise<boolean> {
    const nets = await BalanceService.getNetBalances(group);
    return [...nets.values()].every((net) => net === 0);
  }

  private static async loadUsers(ids: string[]): Promise<Map<string, UserSummary>> {
    const users = await UserModel.find({ _id: { $in: ids } }).select('name email');
    return new Map(
      users.map((user) => [user.id as string, { id: user.id as string, name: user.name, email: user.email }]),
    );
  }

  /** GET /groups/:groupId/balances — creditors first, then the even, then debtors. */
  static async getGroupBalances(group: GroupDocument): Promise<MemberBalance[]> {
    const nets = await BalanceService.getNetBalances(group);
    const memberIds = new Set(BalanceService.memberIds(group));

    // A former member is listed only if they are somehow not at 0 — which the
    // membership rules exist to prevent, so it is a signal worth surfacing.
    const ids = [...nets.keys()].filter((id) => memberIds.has(id) || nets.get(id) !== 0);
    const users = await BalanceService.loadUsers(ids);

    return ids
      .map((id) => ({
        user: users.get(id) ?? { id, name: 'Deleted user', email: '' },
        net: nets.get(id) ?? 0,
        isMember: memberIds.has(id),
      }))
      .sort((a, b) => b.net - a.net || a.user.name.localeCompare(b.user.name));
  }

  /** GET /groups/:groupId/settle-up */
  static async getSettleUpPlan(group: GroupDocument): Promise<SettleUpItem[]> {
    const nets = await BalanceService.getNetBalances(group);
    const transfers = BalanceService.simplifyDebts(nets);

    const users = await BalanceService.loadUsers([
      ...new Set(transfers.flatMap((transfer) => [transfer.from, transfer.to])),
    ]);
    const summary = (id: string): Pick<UserSummary, 'id' | 'name'> => ({
      id,
      name: users.get(id)?.name ?? 'Deleted user',
    });

    return transfers.map((transfer) => ({
      from: summary(transfer.from),
      to: summary(transfer.to),
      amount: transfer.amount,
    }));
  }
}
