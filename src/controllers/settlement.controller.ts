import type { RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { GroupAccessMiddleware } from '../middleware/groupAccess';
import { SettlementService } from '../services/settlement.service';
import { ResponseUtils } from '../utils/response';
import type {
  ListSettlementsInput,
  SettlementParams,
} from '../validators/settlement.validator';

export class SettlementController {
  /** POST /api/v1/groups/:groupId/settlements */
  static create: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const { group } = GroupAccessMiddleware.requireGroup(req);

    const settlement = await SettlementService.create({ group, user, input: req.body });
    ResponseUtils.created({ res, data: { settlement }, message: 'Payment recorded successfully' });
  };

  /** GET /api/v1/groups/:groupId/settlements */
  static list: RequestHandler = async (req, res) => {
    const { group } = GroupAccessMiddleware.requireGroup(req);
    const query = req.query as unknown as ListSettlementsInput;

    const { items, meta } = await SettlementService.list({ group, query });
    ResponseUtils.success({ res, data: items, meta });
  };

  /** DELETE /api/v1/groups/:groupId/settlements/:settlementId */
  static remove: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const { group, membership } = GroupAccessMiddleware.requireGroup(req);
    const { settlementId } = req.params as unknown as SettlementParams;

    await SettlementService.remove({ group, user, membership, settlementId });
    ResponseUtils.success({ res, message: 'Payment undone successfully' });
  };
}
