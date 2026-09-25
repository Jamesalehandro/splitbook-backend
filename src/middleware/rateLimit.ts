import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { config } from '../config';
import { ApiError } from '../utils/error';

export class RateLimitMiddleware {
  /** Routes all limiters through our error shape instead of the library's plain text. */
  private static rejectWith(message: string) {
    return (
      _req: Request,
      _res: unknown,
      next: (error: ApiError) => void,
    ): void => {
      next(ApiError.tooManyRequests(message));
    };
  }

  private static clientIp(req: Request): string {
    return ipKeyGenerator(req.ip ?? '');
  }

  static auth = rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.auth,
    keyGenerator: RateLimitMiddleware.clientIp,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: RateLimitMiddleware.rejectWith(
      'Too many attempts from this address. Please try again in a few minutes.',
    ),
  });
}
