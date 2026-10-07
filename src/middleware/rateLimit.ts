import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

import { config } from '../config';
import { ApiError } from '../utils/error';

/** Routes all limiters through our error shape instead of the library's plain text. */
function rejectWith(message: string) {
  return (
    _req: Request,
    _res: unknown,
    next: (error: ApiError) => void,
  ): void => {
    next(ApiError.tooManyRequests(message));
  };
}

function clientIp(req: Request): string {
  return ipKeyGenerator(req.ip ?? '');
}

export const authRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.auth,
  keyGenerator: clientIp,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rejectWith(
    'Too many attempts from this address. Please try again in a few minutes.',
  ),
});
