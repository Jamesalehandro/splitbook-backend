import { Router } from 'express';

import { create, list, remove } from '../controllers/settlement.controller';
import { ValidationMiddleware } from '../middleware/validate';
import { SettlementSchema } from '../validators/settlement.validator';

/** Mounted at /groups/:groupId/settlements, behind the membership check. */
const router = Router({ mergeParams: true });

router.post(
  '/',
  ValidationMiddleware.validate({ schema: SettlementSchema.create }),
  create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: SettlementSchema.list, part: 'query' }),
  list,
);

router.delete(
  '/:settlementId',
  ValidationMiddleware.validate({ schema: SettlementSchema.params, part: 'params' }),
  remove,
);

export default router;
