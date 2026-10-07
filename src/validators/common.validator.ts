import { z } from 'zod';

import { MAX_AMOUNT_KOBO } from '../utils/money';

export class CommonSchema {
  static objectId = z
    .string()
    .trim()
    .regex(/^[a-f\d]{24}$/i, 'must be a valid id');

  static email = z
    .string()
    .trim()
    .toLowerCase()
    .email('must be a valid email address')
    .max(200);

  static password = z
    .string()
    .min(8, 'password must be at least 8 characters')
    .max(128, 'password must be at most 128 characters');

  static personName = z
    .string()
    .trim()
    .min(2, 'name must be at least 2 characters')
    .max(50, 'name must be at most 50 characters');

  /** Integer kobo, strictly positive. `1500000` is ₦15,000.00. */
  static koboAmount = z
    .number({ invalid_type_error: 'amount must be a number of kobo' })
    .int('amount must be a whole number of kobo (₦1 = 100 kobo)')
    .min(1, 'amount must be greater than 0')
    .max(MAX_AMOUNT_KOBO, 'amount is too large');

  /**
   * A calendar date ("2026-09-20") or a full ISO timestamp.
   *
   * Parsed into a real `Date` here, so services never juggle strings.
   */
  static date = z
    .string()
    .trim()
    .refine(
      (value) =>
        /^\d{4}-\d{2}-\d{2}$/.test(value) ||
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
          value,
        ),
      'must be a date like 2026-09-20 or an ISO timestamp',
    )
    .transform((value) => new Date(value))
    .refine((value) => !Number.isNaN(value.getTime()), 'is not a real date');

  /**
   * An expense date may not be in the future.
   *
   * A little slack is allowed: "today" for someone in Lagos (UTC+1) begins an
   * hour before it does on a UTC server, and a user entering today's date just
   * after midnight should not be told it is tomorrow. 14 hours covers every
   * time zone on Earth.
   */
  static pastOrPresentDate = CommonSchema.date.refine(
    (value) => value.getTime() <= Date.now() + 14 * 60 * 60 * 1_000,
    'date cannot be in the future',
  );

  static pagination = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  });

  /** An optional search box value. An empty string means "no filter". */
  static search = z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((value) => (value ? value : undefined));
}
