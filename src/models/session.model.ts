import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from 'mongoose';

/**
 * One row per login. The JWT carries this row's `jti`, and a token is only
 * accepted while its row is usable — that is what makes logout, "log out that
 * device" and the idle timeout possible with a JWT, which on its own cannot be
 * revoked.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jti: { type: String, required: true, unique: true },

    lastActivityAt: { type: Date, required: true, default: () => new Date() },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },

    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret['id'] = ret['_id'];
        delete ret['_id'];
        delete ret['__v'];
        // The jti is a bearer credential in all but name — never serialise it.
        delete ret['jti'];
        return ret;
      },
    },
  },
);

// Mongo deletes a row once its token could no longer be valid anyway.
sessionSchema.index({ absoluteExpiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1, revokedAt: 1 });

export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionDocument = HydratedDocument<Session>;
export const SessionModel = model<Session>('Session', sessionSchema);
