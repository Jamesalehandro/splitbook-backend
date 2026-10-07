import type { RequestHandler } from 'express';

import { requireGroup } from '../middleware/groupAccess';
import { BalanceService } from '../services/balance.service';
import { success } from '../utils/response';

/** GET /api/v1/groups/:groupId/balances */
export const listBalances: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const balances = await BalanceService.getGroupBalances(group);

  success({ res, data: balances, message: 'Balances calculated' });
};

/** GET /api/v1/groups/:groupId/settle-up */
export const settleUp: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const plan = await BalanceService.getSettleUpPlan(group);

  success({
    res,
    data: plan,
    message: plan.length > 0 ? 'Settle-up plan generated' : 'Everyone is settled up',
  });
};
