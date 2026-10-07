import type { RequestHandler } from 'express';

import { requireUser } from '../middleware/authenticate';
import { requireGroup } from '../middleware/groupAccess';
import { SettlementService } from '../services/settlement.service';
import { created, success } from '../utils/response';
import type {
  ListSettlementsInput,
  SettlementParams,
} from '../validators/settlement.validator';

/** POST /api/v1/groups/:groupId/settlements */
export const create: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { group } = requireGroup(req);

  const settlement = await SettlementService.create({ group, user, input: req.body });
  created({ res, data: { settlement }, message: 'Payment recorded successfully' });
};

/** GET /api/v1/groups/:groupId/settlements */
export const list: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const query = req.query as unknown as ListSettlementsInput;

  const { items, meta } = await SettlementService.list({ group, query });
  success({ res, data: items, meta });
};

/** DELETE /api/v1/groups/:groupId/settlements/:settlementId */
export const remove: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { group, membership } = requireGroup(req);
  const { settlementId } = req.params as unknown as SettlementParams;

  await SettlementService.remove({ group, user, membership, settlementId });
  success({ res, message: 'Payment undone successfully' });
};
