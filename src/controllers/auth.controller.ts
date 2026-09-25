import type { Request, RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { AuthService, type AuthResult } from '../services/auth.service';
import {
  SessionService,
  type SessionContext,
} from '../services/session.service';
import { ResponseUtils } from '../utils/response';
import type { SessionParams } from '../validators/auth.validator';

export class AuthController {
  private static context(req: Request): SessionContext {
    return { ip: req.ip, userAgent: req.get('user-agent') };
  }

  private static tokenPayload(result: AuthResult) {
    return {
      user: result.user,
      token: result.token,
      tokenType: 'Bearer',
      expiresAt: result.expiresAt,
      idleTimeoutMinutes: result.idleTimeoutMinutes,
    };
  }

  /** POST /api/v1/auth/register */
  static register: RequestHandler = async (req, res) => {
    const result = await AuthService.register({
      input: req.body,
      context: AuthController.context(req),
    });

    ResponseUtils.created({
      res,
      message: 'Account created successfully',
      data: AuthController.tokenPayload(result),
    });
  };

  /** POST /api/v1/auth/login */
  static login: RequestHandler = async (req, res) => {
    const result = await AuthService.login({
      credentials: req.body,
      context: AuthController.context(req),
    });

    ResponseUtils.success({
      res,
      message: 'Logged in successfully',
      data: AuthController.tokenPayload(result),
    });
  };

  /** POST /api/v1/auth/logout — ends the session that made the request. */
  static logout: RequestHandler = async (req, res) => {
    const session = AuthMiddleware.requireSession(req);
    await SessionService.revoke(session.jti);
    ResponseUtils.noContent({ res });
  };

  /** GET /api/v1/auth/me */
  static me: RequestHandler = (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const session = AuthMiddleware.requireSession(req);

    ResponseUtils.success({
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
  static listSessions: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const current = AuthMiddleware.requireSession(req);
    const sessions = await SessionService.listActive(user._id);

    ResponseUtils.success({
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
  static revokeSession: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const { sessionId } = req.params as unknown as SessionParams;

    await SessionService.revokeById({ userId: user._id, sessionId });
    ResponseUtils.noContent({ res });
  };

  /** POST /api/v1/auth/change-password */
  static changePassword: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const session = AuthMiddleware.requireSession(req);

    const revokedSessions = await AuthService.changePassword({
      user,
      currentJti: session.jti,
      input: req.body,
    });

    // The caller's own session survives, so their current token keeps working.
    ResponseUtils.success({
      res,
      data: { revokedSessions },
      message: 'Password changed. Other devices have been logged out.',
    });
  };
}
