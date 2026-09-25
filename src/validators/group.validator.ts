import { z } from 'zod';

import { CommonSchema } from './common.validator';

/** Groups and their members. */
export class GroupSchema {
  static params = z.object({
    groupId: CommonSchema.objectId,
  });

  static memberParams = GroupSchema.params.extend({
    userId: CommonSchema.objectId,
  });

  static create = z.object({
    name: z
      .string()
      .trim()
      .min(2, 'name must be at least 2 characters')
      .max(60),
    description: z
      .string()
      .trim()
      .max(200, 'description must be at most 200 characters')
      .optional(),
    currency: z.enum(['NGN']).default('NGN'),
  });

  static update = z
    .object({
      name: z
        .string()
        .trim()
        .min(2, 'name must be at least 2 characters')
        .max(60)
        .optional(),
      description: z
        .string()
        .trim()
        .max(200, 'description must be at most 200 characters')
        .optional(),
    })
    .refine(
      (data) => data.name !== undefined || data.description !== undefined,
      {
        message: 'Send a name, a description, or both',
        path: ['name'],
      },
    );

  static list = CommonSchema.pagination.extend({
    search: CommonSchema.search,
  });

  static addMember = z
    .object({
      email: CommonSchema.email.optional(),
      userId: CommonSchema.objectId.optional(),
    })
    .refine(
      (data) => (data.email === undefined) !== (data.userId === undefined),
      {
        message: 'Send either email or userId, not both',
        path: ['email'],
      },
    );
}

export type GroupParams = z.infer<typeof GroupSchema.params>;
export type MemberParams = z.infer<typeof GroupSchema.memberParams>;
export type CreateGroupInput = z.infer<typeof GroupSchema.create>;
export type UpdateGroupInput = z.infer<typeof GroupSchema.update>;
export type ListGroupsInput = z.infer<typeof GroupSchema.list>;
export type AddMemberInput = z.infer<typeof GroupSchema.addMember>;
