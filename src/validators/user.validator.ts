import { z } from 'zod';

import { CommonSchema } from './common.validator';

/** The profile page, and finding someone to add to a group. */
export class UserSchema {
  static updateMe = z
    .object({
      name: CommonSchema.personName,
    })
    .strict('Passwords are changed at POST /auth/change-password');

  static search = z.object({
    email: CommonSchema.email,
  });
}

export type UpdateMeInput = z.infer<typeof UserSchema.updateMe>;
export type SearchUserInput = z.infer<typeof UserSchema.search>;
