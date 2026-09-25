import type { Types } from 'mongoose';

import { config } from '../config';
import { SessionModel, type SessionDocument } from '../models/session.model';
import { ApiError } from '../utils/error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface CreateSessionParams {
  userId: Types.ObjectId;
  jti: string;
  absoluteExpiresAt: Date;
  context?: SessionContext | undefined;
}

export interface RevokeAllSessionsParams {
  userId: Types.ObjectId;
  /** Keep this one alive — used when the caller should stay logged in. */
  exceptJti?: string;
}

export interface RevokeSessionByIdParams {
  userId: Types.ObjectId;
  sessionId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Session lifecycle. This is where the inactivity timeout is actually
 * enforced, and where logout happens.
 */
export class SessionService {
  static async create(input: CreateSessionParams): Promise<SessionDocument> {
    return SessionModel.create({
      userId: input.userId,
      jti: input.jti,
      absoluteExpiresAt: input.absoluteExpiresAt,
      lastActivityAt: new Date(),
      ip: input.context?.ip ?? null,
      userAgent: input.context?.userAgent ?? null,
    });
  }

  /** The filter every usable session matches. Shared so `touch` and `listActive` cannot drift. */
  private static usableFilter(now: Date): Record<string, unknown> {
    return {
      revokedAt: null,
      absoluteExpiresAt: { $gt: now },
      lastActivityAt: { $gt: new Date(now.getTime() - config.session.idleMs) },
    };
  }

  /**
   * Validates a session and records the activity, in ONE atomic operation.
   *
   * Every condition that makes a session usable lives in the FILTER, not in
   * code after a read. findOne-then-check-then-update would be two round trips
   * on every authenticated request, and wrong besides: a session that crossed
   * the idle threshold between the read and the write would be resurrected by
   * the write. Here, an idle session simply does not match.
   *
   * @returns The refreshed session, or null when it is unusable for any reason.
   */
  static async touch(jti: string): Promise<SessionDocument | null> {
    const now = new Date();

    return SessionModel.findOneAndUpdate(
      { jti, ...SessionService.usableFilter(now) },
      { $set: { lastActivityAt: now } },
      { new: true },
    );
  }

  static async revoke(jti: string): Promise<void> {
    await SessionModel.updateOne({ jti, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  /**
   * "Log out that device". Scoped to the owner, so another user's session id
   * is a 404 — the same answer as an id that never existed.
   */
  static async revokeById({ userId, sessionId }: RevokeSessionByIdParams): Promise<void> {
    const result = await SessionModel.updateOne(
      { _id: sessionId, userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );

    if (result.matchedCount === 0) {
      throw ApiError.notFound('Session not found');
    }
  }

  /**
   * Kills every session for a user, optionally sparing one. Used on password
   * change: a password is usually changed because it may have leaked, and
   * leaving the other holder logged in would make the change cosmetic.
   */
  static async revokeAll({ userId, exceptJti }: RevokeAllSessionsParams): Promise<number> {
    const result = await SessionModel.updateMany(
      {
        userId,
        revokedAt: null,
        ...(exceptJti ? { jti: { $ne: exceptJti } } : {}),
      },
      { $set: { revokedAt: new Date() } },
    );

    return result.modifiedCount;
  }

  /** Sessions that are still usable right now — same conditions as `touch`. */
  static async listActive(userId: Types.ObjectId): Promise<SessionDocument[]> {
    return SessionModel.find({ userId, ...SessionService.usableFilter(new Date()) }).sort({
      lastActivityAt: -1,
    });
  }

  /** When the session will expire if the user does nothing more. */
  static idleExpiresAt(session: SessionDocument): Date {
    return new Date(session.lastActivityAt.getTime() + config.session.idleMs);
  }

  static get idleTimeoutMinutes(): number {
    return config.session.idleMs / 60_000;
  }
}
