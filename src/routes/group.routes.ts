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
import { AuthMiddleware } from '../middleware/authenticate';
import { GroupAccessMiddleware } from '../middleware/groupAccess';
import { ValidationMiddleware } from '../middleware/validate';
import { GroupSchema } from '../validators/group.validator';

import expenseRoutes from './expense.routes';
import settlementRoutes from './settlement.routes';

const router = Router();

router.use(AuthMiddleware.authenticate);

router.post(
  '/',
  ValidationMiddleware.validate({ schema: GroupSchema.create }),
  create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: GroupSchema.list, part: 'query' }),
  list,
);

const inGroup = [
  ValidationMiddleware.validate({ schema: GroupSchema.params, part: 'params' }),
  GroupAccessMiddleware.requireMember,
];

router.get('/:groupId', ...inGroup, getOne);

router.patch(
  '/:groupId',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  ValidationMiddleware.validate({ schema: GroupSchema.update }),
  update,
);

router.delete(
  '/:groupId',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  remove,
);

router.post(
  '/:groupId/members',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  ValidationMiddleware.validate({ schema: GroupSchema.addMember }),
  addMember,
);

router.delete(
  '/:groupId/members/:userId',
  ValidationMiddleware.validate({
    schema: GroupSchema.memberParams,
    part: 'params',
  }),
  GroupAccessMiddleware.requireMember,
  removeMember,
);

router.get('/:groupId/balances', ...inGroup, listBalances);
router.get('/:groupId/settle-up', ...inGroup, settleUp);

router.use('/:groupId/expenses', ...inGroup, expenseRoutes);
router.use('/:groupId/settlements', ...inGroup, settlementRoutes);

export default router;
