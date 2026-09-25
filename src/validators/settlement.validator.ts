import { z } from 'zod';

import { CommonSchema } from './common.validator';

/** Recording and undoing "A paid B ₦X". */
export class SettlementSchema {
  static params = z.object({
    groupId: CommonSchema.objectId,
    settlementId: CommonSchema.objectId,
  });

  static create = z
    .object({
      from: CommonSchema.objectId,
      to: CommonSchema.objectId,
      amount: CommonSchema.koboAmount,
      note: z
        .string()
        .trim()
        .max(200, 'note must be at most 200 characters')
        .optional(),
      date: CommonSchema.pastOrPresentDate.optional(),
    })
    .refine((data) => data.from !== data.to, {
      message: 'A person cannot settle up with themselves',
      path: ['to'],
    });

  static list = CommonSchema.pagination;
}

export type SettlementParams = z.infer<typeof SettlementSchema.params>;
export type CreateSettlementInput = z.infer<typeof SettlementSchema.create>;
export type ListSettlementsInput = z.infer<typeof SettlementSchema.list>;
