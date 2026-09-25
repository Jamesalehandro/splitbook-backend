import type { RequestHandler } from 'express';

/**
 * Strips MongoDB operators out of request bodies — protection against NoSQL
 * injection.
 *
 * The attack: a login body of `{ "email": { "$ne": null } }` would, if it
 * reached `UserModel.findOne({ email })` unchanged, match the FIRST user in the
 * database. Zod already refuses anything that is not a string there, so this is
 * a second lock on the same door, for any field a schema might one day forget.
 *
 * Written here rather than using `express-mongo-sanitize`, which reassigns
 * `req.query` — a getter-only property in Express 5, so that package throws on
 * every request. `req.query` needs no cleaning anyway: Express 5's default
 * query parser never builds nested objects, so `?email[$ne]=x` arrives as a
 * harmless literal key.
 */
export class SanitizeMiddleware {
  /** Keys MongoDB would read as an operator (`$gt`) or a nested path (`a.b`). */
  private static isDangerousKey(key: string): boolean {
    return key.startsWith('$') || key.includes('.');
  }

  private static clean(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => SanitizeMiddleware.clean(item));
    }

    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [key, inner] of Object.entries(value)) {
        if (!SanitizeMiddleware.isDangerousKey(key)) {
          out[key] = SanitizeMiddleware.clean(inner);
        }
      }
      return out;
    }

    return value;
  }

  static mongo: RequestHandler = (req, _res, next) => {
    if (req.body !== undefined) {
      req.body = SanitizeMiddleware.clean(req.body);
    }
    next();
  };
}
