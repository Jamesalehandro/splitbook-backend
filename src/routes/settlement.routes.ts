import { Router } from 'express';

import { SettlementController } from '../controllers/settlement.controller';
import { ValidationMiddleware } from '../middleware/validate';
import { SettlementSchema } from '../validators/settlement.validator';

/** Mounted at /groups/:groupId/settlements, behind the membership check. */
const router = Router({ mergeParams: true });

router.post(
  '/',
  ValidationMiddleware.validate({ schema: SettlementSchema.create }),
  SettlementController.create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: SettlementSchema.list, part: 'query' }),
  SettlementController.list,
);

router.delete(
  '/:settlementId',
  ValidationMiddleware.validate({ schema: SettlementSchema.params, part: 'params' }),
  SettlementController.remove,
);

export default router;
