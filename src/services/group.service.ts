import type { FilterQuery, Types } from 'mongoose';

import {
  GroupModel,
  type Group,
  type GroupDocument,
  type GroupMember,
} from '../models/group.model';
import { UserModel, type UserDocument } from '../models/user.model';
import { ApiError } from '../utils/error';
import { PaginationUtils, type Paginated } from '../utils/pagination';
import { StringUtils } from '../utils/string';
import type {
  AddMemberInput,
  CreateGroupInput,
  ListGroupsInput,
  UpdateGroupInput,
} from '../validators/group.validator';

import { BalanceService } from './balance.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateGroupParams {
  user: UserDocument;
  input: CreateGroupInput;
}

export interface ListGroupsParams {
  user: UserDocument;
  query: ListGroupsInput;
}

/** A row of "my groups": the group plus what the list screen shows at a glance. */
export interface GroupListItem extends Record<string, unknown> {
  memberCount: number;
  myRole: string;
}

export interface UpdateGroupParams {
  group: GroupDocument;
  input: UpdateGroupInput;
}

export interface AddMemberParams {
  group: GroupDocument;
  input: AddMemberInput;
}

export interface RemoveMemberParams {
  group: GroupDocument;
  /** Who is asking. */
  actor: UserDocument;
  actorMembership: GroupMember;
  /** Who is being removed — the actor themselves when leaving. */
  targetUserId: string;
}

export interface FindMemberParams {
  group: GroupDocument;
  userId: Types.ObjectId | string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Groups and membership.
 *
 * Access control does not happen here — `GroupAccessMiddleware` has already
 * loaded the group and proved the caller is a member (or admin) before any of
 * these run. What lives here are the rules about MONEY and membership: nobody
 * leaves owing or owed, and a group is only deleted once it is square.
 */
export class GroupService {
  /** The caller's row in `group.members`, or null when they are not in it. */
  static findMember({ group, userId }: FindMemberParams): GroupMember | null {
    return group.members.find((member) => String(member.user) === String(userId)) ?? null;
  }

  /** The creator is added as admin in the same write that creates the group. */
  static async create({ user, input }: CreateGroupParams): Promise<GroupDocument> {
    return GroupModel.create({
      name: input.name,
      description: input.description ?? '',
      currency: input.currency,
      createdBy: user._id,
      members: [{ user: user._id, role: 'admin', joinedAt: new Date() }],
    });
  }

  /** "My groups" — only groups the caller is in, newest activity first. */
  static async listMine({ user, query }: ListGroupsParams): Promise<Paginated<GroupListItem>> {
    const filter: FilterQuery<Group> = {
      'members.user': user._id,
      isDeleted: false,
      ...(query.search
        ? { name: { $regex: StringUtils.escapeRegex(query.search), $options: 'i' } }
        : {}),
    };

    const [groups, total] = await Promise.all([
      GroupModel.find(filter)
        .sort({ updatedAt: -1 })
        .skip(PaginationUtils.skip(query))
        .limit(query.limit),
      GroupModel.countDocuments(filter),
    ]);

    return {
      items: groups.map((group) => ({
        ...(group.toJSON() as Record<string, unknown>),
        memberCount: group.members.length,
        myRole: GroupService.findMember({ group, userId: user._id })?.role ?? 'member',
      })),
      meta: PaginationUtils.buildMeta({ page: query.page, limit: query.limit, total }),
    };
  }

  /** Group detail, with each member's name and email filled in. */
  static async getDetail(group: GroupDocument): Promise<GroupDocument> {
    return group.populate('members.user', 'name email');
  }

  static async update({ group, input }: UpdateGroupParams): Promise<GroupDocument> {
    if (input.name !== undefined) group.name = input.name;
    if (input.description !== undefined) group.description = input.description;
    await group.save();
    return group;
  }

  /**
   * Soft delete, and only once every balance is 0 — deleting a group with
   * money outstanding would erase the only record that someone is owed.
   */
  static async remove(group: GroupDocument): Promise<void> {
    if (!(await BalanceService.isFullySettled(group))) {
      throw ApiError.conflict(
        'This group still has unsettled balances. Settle up before deleting it.',
      );
    }

    group.isDeleted = true;
    await group.save();
  }

  static async addMember({ group, input }: AddMemberParams): Promise<GroupDocument> {
    const user = input.email
      ? await UserModel.findOne({ email: input.email })
      : await UserModel.findById(input.userId);

    if (!user) {
      throw ApiError.notFound(
        'No SplitBook account uses that email. Ask them to register first, then add them.',
      );
    }

    /**
     * One atomic write, with "not already a member" in the FILTER.
     *
     * Checking first and pushing second would let two admins clicking "Add" at
     * the same moment both pass the check and add the person twice. Here the
     * second write simply matches nothing.
     */
    const result = await GroupModel.updateOne(
      { _id: group._id, isDeleted: false, 'members.user': { $ne: user._id } },
      { $push: { members: { user: user._id, role: 'member', joinedAt: new Date() } } },
    );

    if (result.modifiedCount === 0) {
      throw ApiError.conflict(`${user.name} is already in this group`);
    }

    const updated = await GroupModel.findById(group._id);
    if (!updated) {
      throw ApiError.notFound('Group not found');
    }
    return GroupService.getDetail(updated);
  }

  /**
   * Removing someone (admin) or leaving (self) — the same operation, with the
   * same money rule: only at a net balance of exactly 0.
   *
   * Without that rule, removing a member who owes ₦5,000 would leave the
   * people they owe with no one in the group to collect from.
   */
  static async removeMember({
    group,
    actor,
    actorMembership,
    targetUserId,
  }: RemoveMemberParams): Promise<void> {
    const isSelf = String(actor._id) === targetUserId;

    if (!isSelf && actorMembership.role !== 'admin') {
      throw ApiError.forbidden('Only the group admin can remove other members');
    }

    const target = GroupService.findMember({ group, userId: targetUserId });
    if (!target) {
      throw ApiError.notFound('That user is not a member of this group');
    }

    if (target.role === 'admin') {
      // The admin is the only one who can manage the group; letting them walk
      // away would leave it with nobody able to edit, add or delete.
      throw ApiError.conflict(
        'The group admin cannot leave the group. Delete the group once everyone is settled.',
      );
    }

    const net = await BalanceService.getNetFor({ group, userId: targetUserId });
    if (net !== 0) {
      throw ApiError.conflict(
        isSelf
          ? 'You cannot leave while you owe or are owed money. Settle up first.'
          : 'This member still owes or is owed money. Settle up before removing them.',
      );
    }

    await GroupModel.updateOne({ _id: group._id }, { $pull: { members: { user: target.user } } });
  }
}
