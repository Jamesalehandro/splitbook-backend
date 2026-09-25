import { UserModel, type UserDocument } from '../models/user.model';
import { ApiError } from '../utils/error';
import { JwtUtils } from '../utils/jwt';
import { PasswordUtils } from '../utils/password';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
} from '../validators/auth.validator';

import { SessionService, type SessionContext } from './session.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthResult {
  user: UserDocument;
  token: string;
  expiresAt: Date;
  idleTimeoutMinutes: number;
}

export interface RegisterParams {
  input: RegisterInput;
  /** Recorded on the session row: useful when reviewing active sessions. */
  context?: SessionContext;
}

export interface LoginParams {
  credentials: LoginInput;
  context?: SessionContext;
}

export interface ChangePasswordParams {
  user: UserDocument;
  /** The session making the request. It survives; every other one is revoked. */
  currentJti: string;
  input: ChangePasswordInput;
}

interface OpenSessionParams {
  user: UserDocument;
  context?: SessionContext | undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AuthService {
  private static readonly genericLoginFailure = 'Invalid email or password';

  static async register({
    input,
    context,
  }: RegisterParams): Promise<AuthResult> {
    const existing = await UserModel.exists({ email: input.email });
    if (existing) {
      throw ApiError.conflict('An account with that email already exists');
    }

    const user = await UserModel.create({
      name: input.name,
      email: input.email,
      passwordHash: await PasswordUtils.hash(input.password),
    });

    return AuthService.openSession({ user, context });
  }

  static async login({
    credentials,
    context,
  }: LoginParams): Promise<AuthResult> {
    const user = await UserModel.findOne({ email: credentials.email }).select(
      '+passwordHash',
    );

    if (!user) {
      await PasswordUtils.burnTimingBudget();
      throw ApiError.unauthorized(AuthService.genericLoginFailure);
    }

    const passwordMatches = await PasswordUtils.verify({
      plain: credentials.password,
      hash: user.passwordHash,
    });
    if (!passwordMatches) {
      throw ApiError.unauthorized(AuthService.genericLoginFailure);
    }

    return AuthService.openSession({ user, context });
  }

  /**
   * Revokes every OTHER session, and keeps the caller's. A password is usually
   * changed because it may have leaked; leaving the other holder logged in
   * would make the change cosmetic. The caller just proved they know the
   * password, so logging them out too would only cost them a login.
   *
   * @returns How many other sessions were ended.
   */
  static async changePassword({
    user,
    currentJti,
    input,
  }: ChangePasswordParams): Promise<number> {
    const withHash = await UserModel.findById(user._id).select('+passwordHash');
    if (!withHash) {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const matches = await PasswordUtils.verify({
      plain: input.currentPassword,
      hash: withHash.passwordHash,
    });
    if (!matches) {
      throw ApiError.badRequest({
        message: 'Current password is incorrect',
        errors: [
          {
            field: 'currentPassword',
            message: 'current password is incorrect',
          },
        ],
      });
    }

    withHash.passwordHash = await PasswordUtils.hash(input.newPassword);
    withHash.passwordChangedAt = new Date();
    await withHash.save();

    return SessionService.revokeAll({
      userId: user._id,
      exceptJti: currentJti,
    });
  }

  private static async openSession({
    user,
    context,
  }: OpenSessionParams): Promise<AuthResult> {
    const { token, jti, expiresAt } = JwtUtils.issueAccessToken(
      user.id as string,
    );

    await SessionService.create({
      userId: user._id,
      jti,
      absoluteExpiresAt: expiresAt,
      context,
    });

    return {
      user,
      token,
      expiresAt,
      idleTimeoutMinutes: SessionService.idleTimeoutMinutes,
    };
  }
}
