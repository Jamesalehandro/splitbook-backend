import type { ZodError } from 'zod';

import type { FieldError } from './error';

/** Turning a zod failure into the `errors[]` the response envelope carries. */
/**
 * `{ path: ['shares', 0, 'amount'], message }` -> `{ field: 'shares.0.amount', message }`,
 * so the frontend can put each message under the matching form field.
 */
export function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}
