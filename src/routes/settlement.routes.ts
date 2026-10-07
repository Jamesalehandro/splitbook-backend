import { Router } from 'express';

import { create, list, remove } from '../controllers/settlement.controller';
import { validate } from '../middleware/validate';
import { SettlementSchema } from '../validators/settlement.validator';

/** Mounted at /groups/:groupId/settlements, behind the membership check. */
const router = Router({ mergeParams: true });

router.post(
  '/',
  validate({ schema: SettlementSchema.create }),
  create,
);

router.get(
  '/',
  validate({ schema: SettlementSchema.list, part: 'query' }),
  list,
);

router.delete(
  '/:settlementId',
  validate({ schema: SettlementSchema.params, part: 'params' }),
  remove,
);

export default router;
