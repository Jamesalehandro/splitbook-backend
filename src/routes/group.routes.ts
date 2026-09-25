import { Router } from 'express';

import { BalanceController } from '../controllers/balance.controller';
import { GroupController } from '../controllers/group.controller';
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
  GroupController.create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: GroupSchema.list, part: 'query' }),
  GroupController.list,
);

const inGroup = [
  ValidationMiddleware.validate({ schema: GroupSchema.params, part: 'params' }),
  GroupAccessMiddleware.requireMember,
];

router.get('/:groupId', ...inGroup, GroupController.getOne);

router.patch(
  '/:groupId',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  ValidationMiddleware.validate({ schema: GroupSchema.update }),
  GroupController.update,
);

router.delete(
  '/:groupId',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  GroupController.remove,
);

router.post(
  '/:groupId/members',
  ...inGroup,
  GroupAccessMiddleware.requireAdmin,
  ValidationMiddleware.validate({ schema: GroupSchema.addMember }),
  GroupController.addMember,
);

router.delete(
  '/:groupId/members/:userId',
  ValidationMiddleware.validate({
    schema: GroupSchema.memberParams,
    part: 'params',
  }),
  GroupAccessMiddleware.requireMember,
  GroupController.removeMember,
);

router.get('/:groupId/balances', ...inGroup, BalanceController.list);
router.get('/:groupId/settle-up', ...inGroup, BalanceController.settleUp);

router.use('/:groupId/expenses', ...inGroup, expenseRoutes);
router.use('/:groupId/settlements', ...inGroup, settlementRoutes);

export default router;
