import { z } from 'zod';

import { EXPENSE_CATEGORIES, SPLIT_TYPES } from '../models/expense.model';

import { CommonSchema } from './common.validator';

/**
 * Recording, editing and listing expenses.
 *
 * The three split types take different inputs, so the body is a
 * DISCRIMINATED UNION on `splitType` — zod reads that one field first, then
 * checks the rest against the matching shape:
 *
 *   equal       { participants: [userId, ...] }
 *   exact       { shares: [{ user, amount }] }      amounts in kobo
 *   percentage  { shares: [{ user, percent }] }     percents, up to 2 decimals
 *
 * These schemas check SHAPE. The money rules — shares sum to the total,
 * percents sum to 100 — live in `SplitService`, so they hold even for callers
 * that never pass through HTTP (the seed script, the unit tests).
 */
export class ExpenseSchema {
  static params = z.object({
    groupId: CommonSchema.objectId,
    expenseId: CommonSchema.objectId,
  });

  static equalSplit = z.object({
    splitType: z.literal('equal'),
    participants: z
      .array(CommonSchema.objectId)
      .min(1, 'choose at least one participant'),
  });

  static exactSplit = z.object({
    splitType: z.literal('exact'),
    shares: z
      .array(
        z.object({
          user: CommonSchema.objectId,
          amount: z
            .number({ invalid_type_error: 'amount must be a number of kobo' })
            .int('amount must be a whole number of kobo')
            .min(1, 'each share must be greater than 0'),
        }),
      )
      .min(1, 'add at least one share'),
  });

  static percentageSplit = z.object({
    splitType: z.literal('percentage'),
    shares: z
      .array(
        z.object({
          user: CommonSchema.objectId,
          percent: z
            .number({ invalid_type_error: 'percent must be a number' })
            .gt(0, 'each percent must be greater than 0')
            .max(100, 'percent cannot exceed 100'),
        }),
      )
      .min(1, 'add at least one share'),
  });

  static split = z.discriminatedUnion('splitType', [
    ExpenseSchema.equalSplit,
    ExpenseSchema.exactSplit,
    ExpenseSchema.percentageSplit,
  ]);

  /** Everything except the split, shared by create and the merged edit. */
  static details = z.object({
    description: z.string().trim().min(1, 'description is required').max(100),
    amount: CommonSchema.koboAmount,
    category: z.enum(EXPENSE_CATEGORIES).default('other'),
    paidBy: CommonSchema.objectId.optional(),
    date: CommonSchema.pastOrPresentDate,
  });

  static create = ExpenseSchema.details.and(ExpenseSchema.split);

  /**
   * An edit sends only what changed. `ExpenseService.update` merges it over the
   * stored expense and runs the result through `create`, so an edited expense
   * obeys exactly the same rules as a new one.
   */
  static update = z
    .object({
      description: z
        .string()
        .trim()
        .min(1, 'description is required')
        .max(100)
        .optional(),
      amount: CommonSchema.koboAmount.optional(),
      category: z.enum(EXPENSE_CATEGORIES).optional(),
      paidBy: CommonSchema.objectId.optional(),
      date: z.string().optional(),
      splitType: z.enum(SPLIT_TYPES).optional(),
      participants: z.array(z.unknown()).optional(),
      shares: z.array(z.unknown()).optional(),
    })
    .refine(
      (data) => Object.values(data).some((value) => value !== undefined),
      {
        message: 'Send at least one field to change',
        path: ['description'],
      },
    );

  static list = CommonSchema.pagination.extend({
    search: CommonSchema.search,
    category: z.enum(EXPENSE_CATEGORIES).optional(),
    paidBy: CommonSchema.objectId.optional(),
    from: CommonSchema.date.optional(),
    to: CommonSchema.date.optional(),
  });
}

export type ExpenseParams = z.infer<typeof ExpenseSchema.params>;
export type SplitInput = z.infer<typeof ExpenseSchema.split>;
export type CreateExpenseInput = z.infer<typeof ExpenseSchema.create>;
export type UpdateExpenseInput = z.infer<typeof ExpenseSchema.update>;
export type ListExpensesInput = z.infer<typeof ExpenseSchema.list>;
