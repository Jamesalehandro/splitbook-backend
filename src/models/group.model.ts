import {
  Schema,
  model,
  type HydratedDocument,
  type InferSchemaType,
} from 'mongoose';

export const GROUP_ROLES = ['admin', 'member'] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

/**
 * Embedded rather than a collection of its own: a group has a handful of
 * members, and every read of a group needs them.
 */
const memberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: GROUP_ROLES, required: true, default: 'member' },
    joinedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const groupSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 200, default: '' },
    currency: { type: String, required: true, default: 'NGN' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [memberSchema], default: [] },

    /** Soft delete: the history stays, the group disappears from every route. */
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

// "My groups" — every list and every membership check starts here.
groupSchema.index({ 'members.user': 1, isDeleted: 1 });

export type Group = InferSchemaType<typeof groupSchema>;
export type GroupDocument = HydratedDocument<Group>;
export type GroupMember = Group['members'][number];
export const GroupModel = model<Group>('Group', groupSchema);
