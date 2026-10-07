import type { FilterQuery, PopulateOptions } from 'mongoose';

import { ExpenseModel, type Expense, type ExpenseDocument } from '../models/expense.model';
import type { GroupDocument, GroupMember } from '../models/group.model';
import type { UserDocument } from '../models/user.model';
import { ApiError } from '../utils/error';
import {
  buildPaginationMeta,
  getSkip,
  type Paginated,
} from '../utils/pagination';
import { escapeRegex } from '../utils/string';
import { toFieldErrors } from '../utils/validation';
import {
  ExpenseSchema,
  type CreateExpenseInput,
  type ListExpensesInput,
  type SplitInput,
  type UpdateExpenseInput,
} from '../validators/expense.validator';

import { BalanceService } from './balance.service';
import { SplitService } from './split.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateExpenseParams {
  group: GroupDocument;
  user: UserDocument;
  input: CreateExpenseInput;
}

export interface ListExpensesParams {
  group: GroupDocument;
  query: ListExpensesInput;
}

export interface GetExpenseParams {
  group: GroupDocument;
  expenseId: string;
}

/** Everything needed to decide whether the caller may change an expense. */
export interface ModifyExpenseParams extends GetExpenseParams {
  user: UserDocument;
  membership: GroupMember;
}

export interface UpdateExpenseParams extends ModifyExpenseParams {
  input: UpdateExpenseInput;
}

interface AssertMembersParams {
  group: GroupDocument;
  paidBy: string;
  participants: string[];
}

interface AssertCanModifyParams {
  expense: ExpenseDocument;
  user: UserDocument;
  membership: GroupMember;
}

interface AssertStillEditableParams {
  group: GroupDocument;
  expense: ExpenseDocument;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Expenses.
 *
 * Note what is NOT here: any balance update. Adding, editing or deleting an
 * expense only changes the expense. Balances are recomputed from the history
 * on every read (see `BalanceService`), so they are correct after every change
 * by construction rather than by remembering to update them.
 */
export class ExpenseService {
  /** Names only — enough for the list and detail screens, nothing personal. */
  private static readonly populate: PopulateOptions[] = [
    { path: 'paidBy', select: 'name' },
    { path: 'shares.user', select: 'name' },
    { path: 'createdBy', select: 'name' },
  ];

  /** The payer and every participant must be CURRENT members of the group. */
  private static assertMembers({ group, paidBy, participants }: AssertMembersParams): void {
    const memberIds = new Set(BalanceService.memberIds(group));
    const errors = [];

    if (!memberIds.has(paidBy)) {
      errors.push({ field: 'paidBy', message: 'the payer must be a member of this group' });
    }

    participants.forEach((user, index) => {
      if (!memberIds.has(user)) {
        errors.push({
          field: `participants.${index}`,
          message: `user ${user} is not a member of this group`,
        });
      }
    });

    if (errors.length > 0) {
      throw ApiError.badRequest({
        message: 'Everyone on an expense must be a member of the group',
        errors,
      });
    }
  }

  /** Members may change their own expenses; the admin may change any. */
  private static assertCanModify({ expense, user, membership }: AssertCanModifyParams): void {
    const isCreator = String(expense.createdBy) === String(user._id);
    if (!isCreator && membership.role !== 'admin') {
      throw ApiError.forbidden('Only the person who added this expense or the group admin can change it');
    }
  }

  /**
   * Refuses to change an expense that involves a FORMER member.
   *
   * People can only leave at a balance of exactly 0. Editing or deleting an old
   * expense they were part of would move that 0 — leaving someone who is no
   * longer in the group owing or owed money, with no way to settle it.
   */
  private static assertStillEditable({ group, expense }: AssertStillEditableParams): void {
    const memberIds = new Set(BalanceService.memberIds(group));
    const involved = [String(expense.paidBy), ...expense.shares.map((share) => String(share.user))];

    if (involved.some((id) => !memberIds.has(id))) {
      throw ApiError.conflict(
        'This expense involves someone who has left the group, so it can no longer be changed',
      );
    }
  }

  /**
   * Rebuilds the split a stored expense was created with, from its shares.
   * Used when an edit changes the amount but not the split.
   */
  private static toSplitInput(expense: ExpenseDocument): SplitInput {
    const users = expense.shares.map((share) => String(share.user));

    switch (expense.splitType) {
      case 'equal':
        return { splitType: 'equal', participants: users };
      case 'exact':
        return {
          splitType: 'exact',
          shares: expense.shares.map((share) => ({ user: String(share.user), amount: share.amount })),
        };
      case 'percentage':
        return {
          splitType: 'percentage',
          shares: expense.shares.map((share) => ({
            user: String(share.user),
            percent: share.percent ?? 0,
          })),
        };
    }
  }

  private static async findInGroup({ group, expenseId }: GetExpenseParams): Promise<ExpenseDocument> {
    // Scoped by group IN THE QUERY. An expense id from another group simply
    // does not match, so membership of one group never reaches into another.
    const expense = await ExpenseModel.findOne({ _id: expenseId, group: group._id, isDeleted: false });
    if (!expense) {
      throw ApiError.notFound('Expense not found');
    }
    return expense;
  }

  static async create({ group, user, input }: CreateExpenseParams): Promise<ExpenseDocument> {
    const paidBy = input.paidBy ?? String(user._id);
    const shares = SplitService.computeShares({ amount: input.amount, split: input });

    ExpenseService.assertMembers({
      group,
      paidBy,
      participants: shares.map((share) => share.user),
    });

    const expense = await ExpenseModel.create({
      group: group._id,
      description: input.description,
      amount: input.amount,
      category: input.category,
      paidBy,
      splitType: input.splitType,
      shares,
      date: input.date,
      createdBy: user._id,
    });

    return expense.populate(ExpenseService.populate);
  }

  /** Search, filter and paginate — newest first. */
  static async list({ group, query }: ListExpensesParams): Promise<Paginated<ExpenseDocument>> {
    const filter: FilterQuery<Expense> = { group: group._id, isDeleted: false };

    if (query.search) {
      filter.description = { $regex: escapeRegex(query.search), $options: 'i' };
    }
    if (query.category) filter.category = query.category;
    if (query.paidBy) filter.paidBy = query.paidBy;

    if (query.from || query.to) {
      filter.date = {
        ...(query.from ? { $gte: query.from } : {}),
        // `to=2026-09-20` means "up to and including the 20th", so a bare date
        // is widened to the end of that day.
        ...(query.to ? { $lt: ExpenseService.endOfDayIfDateOnly(query.to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      ExpenseModel.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(getSkip(query))
        .limit(query.limit)
        .populate(ExpenseService.populate),
      ExpenseModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: buildPaginationMeta({ page: query.page, limit: query.limit, total }),
    };
  }

  /** A date at exactly 00:00 UTC came from "YYYY-MM-DD" — push it to the next midnight. */
  private static endOfDayIfDateOnly(date: Date): Date {
    const isMidnight =
      date.getUTCHours() === 0 &&
      date.getUTCMinutes() === 0 &&
      date.getUTCSeconds() === 0 &&
      date.getUTCMilliseconds() === 0;

    return isMidnight ? new Date(date.getTime() + 24 * 60 * 60 * 1_000) : new Date(date.getTime() + 1);
  }

  static async getOne(params: GetExpenseParams): Promise<ExpenseDocument> {
    const expense = await ExpenseService.findInGroup(params);
    return expense.populate(ExpenseService.populate);
  }

  /**
   * An edit sends only the fields that changed. They are merged over the stored
   * expense and the WHOLE result is validated as if it were new, so there is
   * exactly one set of rules for what a valid expense is.
   *
   * The split is taken either entirely from the edit or entirely from the
   * stored expense, never a mix: `{ splitType: 'exact' }` on an equal expense
   * must come with the new `shares`, and is rejected without them.
   */
  static async update({
    group,
    user,
    membership,
    expenseId,
    input,
  }: UpdateExpenseParams): Promise<ExpenseDocument> {
    const expense = await ExpenseService.findInGroup({ group, expenseId });
    ExpenseService.assertCanModify({ expense, user, membership });
    ExpenseService.assertStillEditable({ group, expense });

    const splitTouched =
      input.splitType !== undefined || input.participants !== undefined || input.shares !== undefined;

    const split = splitTouched
      ? { splitType: input.splitType ?? expense.splitType, participants: input.participants, shares: input.shares }
      : ExpenseService.toSplitInput(expense);

    const parsed = ExpenseSchema.create.safeParse({
      description: input.description ?? expense.description,
      amount: input.amount ?? expense.amount,
      category: input.category ?? expense.category,
      paidBy: input.paidBy ?? String(expense.paidBy),
      date: input.date ?? expense.date.toISOString(),
      ...split,
    });

    if (!parsed.success) {
      throw ApiError.badRequest({
        message: 'Validation failed',
        errors: toFieldErrors(parsed.error),
      });
    }

    const next = parsed.data;
    const paidBy = next.paidBy ?? String(expense.paidBy);
    const shares = SplitService.computeShares({ amount: next.amount, split: next });

    ExpenseService.assertMembers({
      group,
      paidBy,
      participants: shares.map((share) => share.user),
    });

    expense.set({
      description: next.description,
      amount: next.amount,
      category: next.category,
      paidBy,
      splitType: next.splitType,
      shares,
      date: next.date,
    });
    await expense.save();

    return expense.populate(ExpenseService.populate);
  }

  /** Soft delete — the expense drops out of every balance the moment this returns. */
  static async remove({ group, user, membership, expenseId }: ModifyExpenseParams): Promise<void> {
    const expense = await ExpenseService.findInGroup({ group, expenseId });
    ExpenseService.assertCanModify({ expense, user, membership });
    ExpenseService.assertStillEditable({ group, expense });

    expense.isDeleted = true;
    await expense.save();
  }
}
