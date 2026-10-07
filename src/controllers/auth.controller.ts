import type { Request, RequestHandler } from 'express';

import { requireSession, requireUser } from '../middleware/authenticate';
import { AuthService, type AuthResult } from '../services/auth.service';
import {
  SessionService,
  type SessionContext,
} from '../services/session.service';
import { created, noContent, success } from '../utils/response';
import type { SessionParams } from '../validators/auth.validator';

function getSessionContext(req: Request): SessionContext {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

function tokenPayload(result: AuthResult) {
  return {
    user: result.user,
    token: result.token,
    tokenType: 'Bearer',
    expiresAt: result.expiresAt,
    idleTimeoutMinutes: result.idleTimeoutMinutes,
  };
}

/** POST /api/v1/auth/register */
export const register: RequestHandler = async (req, res) => {
  const result = await AuthService.register({
    input: req.body,
    context: getSessionContext(req),
  });

  created({
    res,
    message: 'Account created successfully',
    data: tokenPayload(result),
  });
};

/** POST /api/v1/auth/login */
export const login: RequestHandler = async (req, res) => {
  const result = await AuthService.login({
    credentials: req.body,
    context: getSessionContext(req),
  });

  success({
    res,
    message: 'Logged in successfully',
    data: tokenPayload(result),
  });
};

/** POST /api/v1/auth/logout — ends the session that made the request. */
export const logout: RequestHandler = async (req, res) => {
  const session = requireSession(req);
  await SessionService.revoke(session.jti);
  noContent({ res });
};

/** GET /api/v1/auth/me */
export const me: RequestHandler = (req, res) => {
  const user = requireUser(req);
  const session = requireSession(req);

  success({
    res,
    data: {
      user,
      session: {
        id: session.id as string,
        lastActivityAt: session.lastActivityAt,
        idleExpiresAt: SessionService.idleExpiresAt(session),
        expiresAt: session.absoluteExpiresAt,
      },
    },
  });
};

/** GET /api/v1/auth/sessions — every device currently logged in. */
export const listSessions: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const current = requireSession(req);
  const sessions = await SessionService.listActive(user._id);

  success({
    res,
    data: {
      sessions: sessions.map((item) => ({
        ...item.toJSON(),
        current: item.jti === current.jti,
        idleExpiresAt: SessionService.idleExpiresAt(item),
      })),
      total: sessions.length,
    },
  });
};

/** DELETE /api/v1/auth/sessions/:sessionId — log out one device. */
export const revokeSession: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { sessionId } = req.params as unknown as SessionParams;

  await SessionService.revokeById({ userId: user._id, sessionId });
  noContent({ res });
};

/** POST /api/v1/auth/change-password */
export const changePassword: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const session = requireSession(req);

  const revokedSessions = await AuthService.changePassword({
    user,
    currentJti: session.jti,
    input: req.body,
  });

  success({
    res,
    data: { revokedSessions },
    message: 'Password changed. Other devices have been logged out.',
  });
};
