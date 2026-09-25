import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from 'mongoose';

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'rent',
  'utilities',
  'entertainment',
  'other',
] as const;

export const SPLIT_TYPES = ['equal', 'exact', 'percentage'] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

const shareSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    /**
     * Only for percentage splits: the percent the user typed. Not used for any
     * money maths — kept so the edit form can show "40%" rather than
     * reverse-engineering it from a rounded kobo amount.
     */
    percent: { type: Number, default: undefined },
  },
  { _id: false },
);

const expenseSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    /** Integer kobo. */
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'amount must be a whole number of kobo',
      },
    },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other' },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    splitType: { type: String, enum: SPLIT_TYPES, required: true },
    shares: {
      type: [shareSchema],
      required: true,
      validate: {
        validator: (shares: unknown[]) => shares.length > 0,
        message: 'an expense needs at least one share',
      },
    },
    date: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        delete ret['_id'];
        delete ret['__v'];
        delete ret['isDeleted'];
        return ret;
      },
    },
  },
);

/**
 * The expense list: one group, newest first.
 *
 * There is deliberately no `$text` index on `description`. A text index only
 * matches whole words, so typing "din" would not find "Dinner" — the search
 * uses a case-insensitive regex instead, and this index has already narrowed
 * the scan to a single group.
 */
expenseSchema.index({ group: 1, isDeleted: 1, date: -1 });

// Dashboard "recent activity" across all of a user's groups.
expenseSchema.index({ group: 1, createdAt: -1 });

export type Expense = InferSchemaType<typeof expenseSchema>;
export type ExpenseDocument = HydratedDocument<Expense>;
export const ExpenseModel = model<Expense>('Expense', expenseSchema);
