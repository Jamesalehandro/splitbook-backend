import type { RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { GroupAccessMiddleware } from '../middleware/groupAccess';
import { GroupService } from '../services/group.service';
import { ResponseUtils } from '../utils/response';
import type { ListGroupsInput, MemberParams } from '../validators/group.validator';

export class GroupController {
  /** POST /api/v1/groups */
  static create: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const group = await GroupService.create({ user, input: req.body });

    ResponseUtils.created({ res, data: { group }, message: 'Group created successfully' });
  };

  /** GET /api/v1/groups?search=&page=&limit= */
  static list: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const query = req.query as unknown as ListGroupsInput;

    const { items, meta } = await GroupService.listMine({ user, query });
    ResponseUtils.success({ res, data: items, meta });
  };

  /** GET /api/v1/groups/:groupId */
  static getOne: RequestHandler = async (req, res) => {
    const { group, membership } = GroupAccessMiddleware.requireGroup(req);
    const detail = await GroupService.getDetail(group);

    ResponseUtils.success({ res, data: { group: detail, myRole: membership.role } });
  };

  /** PATCH /api/v1/groups/:groupId */
  static update: RequestHandler = async (req, res) => {
    const { group } = GroupAccessMiddleware.requireGroup(req);
    const updated = await GroupService.update({ group, input: req.body });

    ResponseUtils.success({ res, data: { group: updated }, message: 'Group updated successfully' });
  };

  /** DELETE /api/v1/groups/:groupId */
  static remove: RequestHandler = async (req, res) => {
    const { group } = GroupAccessMiddleware.requireGroup(req);
    await GroupService.remove(group);

    ResponseUtils.success({ res, message: 'Group deleted successfully' });
  };

  /** POST /api/v1/groups/:groupId/members */
  static addMember: RequestHandler = async (req, res) => {
    const { group } = GroupAccessMiddleware.requireGroup(req);
    const updated = await GroupService.addMember({ group, input: req.body });

    ResponseUtils.created({ res, data: { group: updated }, message: 'Member added successfully' });
  };

  /** DELETE /api/v1/groups/:groupId/members/:userId — remove someone, or leave */
  static removeMember: RequestHandler = async (req, res) => {
    const actor = AuthMiddleware.requireUser(req);
    const { group, membership } = GroupAccessMiddleware.requireGroup(req);
    const { userId } = req.params as unknown as MemberParams;

    await GroupService.removeMember({
      group,
      actor,
      actorMembership: membership,
      targetUserId: userId,
    });

    ResponseUtils.success({
      res,
      message: String(actor._id) === userId ? 'You have left the group' : 'Member removed successfully',
    });
  };
}
