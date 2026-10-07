import type { RequestHandler } from 'express';

import { requireUser } from '../middleware/authenticate';
import { requireGroup } from '../middleware/groupAccess';
import { GroupService } from '../services/group.service';
import { created, success } from '../utils/response';
import type { ListGroupsInput, MemberParams } from '../validators/group.validator';

/** POST /api/v1/groups */
export const create: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const group = await GroupService.create({ user, input: req.body });

  created({ res, data: { group }, message: 'Group created successfully' });
};

/** GET /api/v1/groups?search=&page=&limit= */
export const list: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const query = req.query as unknown as ListGroupsInput;

  const { items, meta } = await GroupService.listMine({ user, query });
  success({ res, data: items, meta });
};

/** GET /api/v1/groups/:groupId */
export const getOne: RequestHandler = async (req, res) => {
  const { group, membership } = requireGroup(req);
  const detail = await GroupService.getDetail(group);

  success({ res, data: { group: detail, myRole: membership.role } });
};

/** PATCH /api/v1/groups/:groupId */
export const update: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const updated = await GroupService.update({ group, input: req.body });

  success({ res, data: { group: updated }, message: 'Group updated successfully' });
};

/** DELETE /api/v1/groups/:groupId */
export const remove: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  await GroupService.remove(group);

  success({ res, message: 'Group deleted successfully' });
};

/** POST /api/v1/groups/:groupId/members */
export const addMember: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const updated = await GroupService.addMember({ group, input: req.body });

  created({ res, data: { group: updated }, message: 'Member added successfully' });
};

/** DELETE /api/v1/groups/:groupId/members/:userId — remove someone, or leave */
export const removeMember: RequestHandler = async (req, res) => {
  const actor = requireUser(req);
  const { group, membership } = requireGroup(req);
  const { userId } = req.params as unknown as MemberParams;

  await GroupService.removeMember({
    group,
    actor,
    actorMembership: membership,
    targetUserId: userId,
  });

  success({
    res,
    message: String(actor._id) === userId ? 'You have left the group' : 'Member removed successfully',
  });
};
