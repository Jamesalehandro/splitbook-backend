import { z } from 'zod';

import { CommonSchema } from './common.validator';

/** Registration, login, password change and session management. */
export class AuthSchema {
  static register = z.object({
    name: CommonSchema.personName,
    email: CommonSchema.email,
    password: CommonSchema.password,
  });

  static login = z.object({
    email: CommonSchema.email,
    password: z.string().min(1, 'password is required'),
  });

  static changePassword = z
    .object({
      currentPassword: z.string().min(1, 'currentPassword is required'),
      newPassword: CommonSchema.password,
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
      message: 'newPassword must be different from currentPassword',
      path: ['newPassword'],
    });

  static sessionParams = z.object({
    sessionId: CommonSchema.objectId,
  });
}

export type RegisterInput = z.infer<typeof AuthSchema.register>;
export type LoginInput = z.infer<typeof AuthSchema.login>;
export type ChangePasswordInput = z.infer<typeof AuthSchema.changePassword>;
export type SessionParams = z.infer<typeof AuthSchema.sessionParams>;
