import type { Request, RequestHandler } from 'express';

import {
  GroupModel,
  type GroupDocument,
  type GroupMember,
} from '../models/group.model';
import { GroupService } from '../services/group.service';
import { ApiError } from '../utils/error';

import { AuthMiddleware } from './authenticate';

/** What a handler behind `requireMember` can rely on. */
export interface GroupContext {
  group: GroupDocument;
  /** The caller's own row in `group.members` — carries their role. */
  membership: GroupMember;
}

export class GroupAccessMiddleware {
  static requireMember: RequestHandler = async (req, _res, next) => {
    const user = AuthMiddleware.requireUser(req);
    const groupId = req.params['groupId'];

    const group = await GroupModel.findOne({ _id: groupId, isDeleted: false });
    if (!group) {
      throw ApiError.notFound('Group not found');
    }

    const membership = GroupService.findMember({ group, userId: user._id });
    if (!membership) {
      throw ApiError.forbidden('You are not a member of this group');
    }

    req.group = group;
    req.membership = membership;
    next();
  };

  /** Admin-only actions. Must run AFTER `requireMember`. */
  static requireAdmin: RequestHandler = (req, _res, next) => {
    const { membership } = GroupAccessMiddleware.requireGroup(req);

    if (membership.role !== 'admin') {
      throw ApiError.forbidden('Only the group admin can do that');
    }

    next();
  };

  /** Narrows `req.group` / `req.membership` for handlers behind `requireMember`. */
  static requireGroup(req: Request): GroupContext {
    if (!req.group || !req.membership) {
      throw ApiError.forbidden('You are not a member of this group');
    }
    return { group: req.group, membership: req.membership };
  }
}
