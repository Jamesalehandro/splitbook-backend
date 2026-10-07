import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

import { ApiError } from '../utils/error';
import { toFieldErrors } from '../utils/validation';

type RequestPart = 'body' | 'params' | 'query';

export interface ValidateParams {
  schema: ZodTypeAny;
  part?: RequestPart;
}

/**
 * A middleware factory: called with a schema, returns the middleware.
 * That is what lets it be configured per route:
 *
 *   router.post('/', validate({ schema: GroupSchema.create }), handler)
 */
export function validate({
  schema,
  part = 'body',
}: ValidateParams): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      return next(
        ApiError.badRequest({
          message: 'Validation failed',
          errors: toFieldErrors(result.error),
        }),
      );
    }

    // Replace the raw input with the parsed value: defaults applied, unknown
    // keys stripped, strings trimmed. Downstream layers only see clean data.
    if (part === 'body') {
      req.body = result.data;
    } else if (part === 'params') {
      Object.assign(req.params, result.data);
    } else {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  };
}
