import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

import { ApiError } from '../utils/error';
import { ValidationUtils } from '../utils/validation';

type RequestPart = 'body' | 'params' | 'query';

export interface ValidateParams {
  schema: ZodTypeAny;
  part?: RequestPart;
}

export class ValidationMiddleware {
  /**
   * A middleware FACTORY: called with a schema, returns the middleware.
   * That is what lets it be configured per route:
   *
   *   router.post('/', ValidationMiddleware.validate({ schema: GroupSchema.create }), handler)
   *
   * @param {ValidateParams} params
   * @param {ZodTypeAny} params.schema - The schema the request part must satisfy.
   * @param {RequestPart} params.part - Which part of the request to parse.
   */
  static validate({ schema, part = 'body' }: ValidateParams): RequestHandler {
    return (req, _res, next) => {
      const result = schema.safeParse(req[part]);

      if (!result.success) {
        return next(
          ApiError.badRequest({
            message: 'Validation failed',
            errors: ValidationUtils.toFieldErrors(result.error),
          }),
        );
      }

      // Replace the raw input with the PARSED value: defaults applied, unknown
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
}
