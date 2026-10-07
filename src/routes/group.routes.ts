import { Router } from 'express';

import { listBalances, settleUp } from '../controllers/balance.controller';
import {
  addMember,
  create,
  getOne,
  list,
  remove,
  removeMember,
  update,
} from '../controllers/group.controller';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin, requireMember } from '../middleware/groupAccess';
import { validate } from '../middleware/validate';
import { GroupSchema } from '../validators/group.validator';

import expenseRoutes from './expense.routes';
import settlementRoutes from './settlement.routes';

const router = Router();

router.use(authenticate);

router.post(
  '/',
  validate({ schema: GroupSchema.create }),
  create,
);

router.get(
  '/',
  validate({ schema: GroupSchema.list, part: 'query' }),
  list,
);

const inGroup = [
  validate({ schema: GroupSchema.params, part: 'params' }),
  requireMember,
];

router.get('/:groupId', ...inGroup, getOne);

router.patch(
  '/:groupId',
  ...inGroup,
  requireAdmin,
  validate({ schema: GroupSchema.update }),
  update,
);

router.delete(
  '/:groupId',
  ...inGroup,
  requireAdmin,
  remove,
);

router.post(
  '/:groupId/members',
  ...inGroup,
  requireAdmin,
  validate({ schema: GroupSchema.addMember }),
  addMember,
);

router.delete(
  '/:groupId/members/:userId',
  validate({
    schema: GroupSchema.memberParams,
    part: 'params',
  }),
  requireMember,
  removeMember,
);

router.get('/:groupId/balances', ...inGroup, listBalances);
router.get('/:groupId/settle-up', ...inGroup, settleUp);

router.use('/:groupId/expenses', ...inGroup, expenseRoutes);
router.use('/:groupId/settlements', ...inGroup, settlementRoutes);

export default router;
