import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from 'mongoose';

/**
 * A record that "from paid to ₦X" outside the app. No money moves here — the
 * row exists so the balances know the debt has shrunk.
 */
const settlementSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    /** The payer. */
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** The payee. */
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    /** Integer kobo. */
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: 'amount must be a whole number of kobo' },
    },
    note: { type: String, trim: true, maxlength: 200, default: '' },
    date: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        delete ret['_id'];
        delete ret['__v'];
        return ret;
      },
    },
  },
);

settlementSchema.index({ group: 1, date: -1 });
settlementSchema.index({ group: 1, createdAt: -1 });

export type Settlement = InferSchemaType<typeof settlementSchema>;
export type SettlementDocument = HydratedDocument<Settlement>;
export const SettlementModel = model<Settlement>('Settlement', settlementSchema);
