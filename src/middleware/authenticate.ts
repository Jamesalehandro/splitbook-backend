import type { Request, RequestHandler } from 'express';

import type { SessionDocument } from '../models/session.model';
import { UserModel, type UserDocument } from '../models/user.model';
import { SessionService } from '../services/session.service';
import { ApiError } from '../utils/error';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authentication required');
  }

  const claims = verifyAccessToken(header.slice('Bearer '.length).trim());

  // Atomically validates and records the activity — see session.service.ts.
  // A logged-out, idle, or password-change-revoked session all land here.
  const session = await SessionService.touch(claims.jti);
  if (!session) {
    throw ApiError.unauthorized(
      `Your session has ended. Sessions end on logout or after ${SessionService.idleTimeoutMinutes} minutes of inactivity — please log in again.`,
    );
  }

  const user = await UserModel.findById(claims.sub);
  if (!user) {
    // The account went away while a token was still live.
    throw ApiError.unauthorized('Invalid or expired token');
  }

  req.user = user;
  req.authSession = session;
  next();
};

export function requireUser(req: Request): UserDocument {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }
  return req.user;
}

/** The same, for the few handlers that act on the session itself (logout, session list). */
export function requireSession(req: Request): SessionDocument {
  if (!req.authSession) {
    throw ApiError.unauthorized('Authentication required');
  }
  return req.authSession;
}
