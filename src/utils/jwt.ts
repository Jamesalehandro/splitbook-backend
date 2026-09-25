import { randomUUID } from 'node:crypto';

import jwt, { type SignOptions } from 'jsonwebtoken';

import { config } from '../config';
import { ApiError } from './error';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessTokenClaims {
  /** Subject: the user id. */
  sub: string;
  /** Session id. The row it points at is what actually authorises the request. */
  jti: string;
}

export interface IssuedToken {
  token: string;
  jti: string;
  /** The token's own absolute expiry, read back out of the signed token. */
  expiresAt: Date;
}

/** What we read back off a freshly signed token. `decode` does not verify. */
interface DecodedExpiry {
  exp?: number;
}

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------

/**
 * The access token.
 *
 * A JWT alone is a signed note that says "the holder is user X, until time Y",
 * and cannot be taken back. So the token carries only an ABSOLUTE expiry, plus
 * a `jti` naming a row in the Session collection. That row is what logout
 * revokes, and what the inactivity timeout is checked against on every request
 * (see `SessionService.touch`).
 */
export class JwtUtils {
  /**
   * Mints a token and the session id it belongs to.
   *
   * `expiresAt` is decoded from the token we just signed rather than recomputed
   * from `config.jwt.expiresIn`, so the token and its session row can never
   * disagree about when the token dies.
   *
   * @param {string} userId - The user this token authenticates.
   */
  static issueAccessToken(userId: string): IssuedToken {
    const jti = randomUUID();

    const token = jwt.sign({ sub: userId }, config.jwt.secret, {
      jwtid: jti,
      expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'],
    });

    const decoded = jwt.decode(token) as DecodedExpiry | null;
    if (!decoded?.exp) {
      throw ApiError.internal('Could not determine token expiry');
    }

    return { token, jti, expiresAt: new Date(decoded.exp * 1_000) };
  }

  /**
   * Verifies signature and absolute expiry.
   *
   * Necessary but NOT sufficient — the caller must still load the session,
   * which is where revocation and the idle window are checked.
   */
  static verifyAccessToken(token: string): AccessTokenClaims {
    let payload: jwt.JwtPayload | string;

    try {
      payload = jwt.verify(token, config.jwt.secret);
    } catch {
      // Deliberately one message for every failure mode: distinguishing
      // "expired" from "malformed" from "wrong signature" tells an attacker
      // which token they nearly got right.
      throw ApiError.unauthorized('Invalid or expired token');
    }

    if (typeof payload === 'string' || !payload.sub || !payload.jti) {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    return { sub: payload.sub, jti: payload.jti };
  }
}
