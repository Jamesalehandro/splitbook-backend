import type { Types } from 'mongoose';

import { ExpenseModel } from '../models/expense.model';
import { GroupModel } from '../models/group.model';
import { SettlementModel } from '../models/settlement.model';
import { UserModel, type UserDocument } from '../models/user.model';
import { ApiError } from '../utils/error';
import { MoneyUtils } from '../utils/money';
import type { UpdateMeInput } from '../validators/user.validator';

import { BalanceService } from './balance.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpdateMeParams {
  user: UserDocument;
  input: UpdateMeInput;
}

export interface GroupNet {
  id: string;
  name: string;
  currency: string;
  /** The caller's net in this group, in kobo. Positive = owed to them. */
  net: number;
}

export interface ActivityItem extends Record<string, unknown> {
  type: 'expense' | 'settlement';
  createdAt: Date;
}

interface RecentActivityParams {
  /** The caller's id, to work out their share of each expense. */
  me: string;
  groupIds: Types.ObjectId[];
}

export interface SummaryResult {
  /** Kobo the caller owes across all groups (a positive number). */
  youOwe: number;
  /** Kobo owed to the caller across all groups. */
  youAreOwed: number;
  /** youAreOwed − youOwe. */
  net: number;
  groups: GroupNet[];
  recentActivity: ActivityItem[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** The profile page, user lookup, and the cross-group dashboard. */
export class UserService {
  private static readonly RECENT_ACTIVITY_LIMIT = 10;

  /** The name only. Passwords go through `AuthService.changePassword`. */
  static async updateMe({ user, input }: UpdateMeParams): Promise<UserDocument> {
    user.name = input.name;
    await user.save();
    return user;
  }

  /** Finds the person to add to a group. Returns public fields only. */
  static async findByEmail(email: string): Promise<UserDocument> {
    const user = await UserModel.findOne({ email }).select('name email');
    if (!user) {
      throw ApiError.notFound('No SplitBook account uses that email');
    }
    return user;
  }

  /**
   * GET /users/me/summary — the dashboard.
   *
   * "You owe" and "you are owed" are kept apart rather than netted, because
   * owing Tolu ₦5,000 in one group and being owed ₦5,000 by Ada in another is
   * not "all square" — two different people are involved.
   */
  static async getSummary(user: UserDocument): Promise<SummaryResult> {
    const me = String(user._id);
    const groups = await GroupModel.find({ 'members.user': user._id, isDeleted: false }).sort({
      updatedAt: -1,
    });

    const nets = await Promise.all(groups.map((group) => BalanceService.getNetBalances(group)));

    const groupNets: GroupNet[] = groups.map((group, index) => ({
      id: group.id as string,
      name: group.name,
      currency: group.currency,
      net: nets[index]!.get(me) ?? 0,
    }));

    const youAreOwed = MoneyUtils.sum(groupNets.filter((g) => g.net > 0).map((g) => g.net));
    const youOwe = MoneyUtils.sum(groupNets.filter((g) => g.net < 0).map((g) => -g.net));

    return {
      youOwe,
      youAreOwed,
      net: youAreOwed - youOwe,
      groups: groupNets,
      recentActivity: await UserService.getRecentActivity({
        me,
        groupIds: groups.map((group) => group._id),
      }),
    };
  }

  /** The latest expenses and settlements across the caller's groups, merged by time. */
  private static async getRecentActivity({ me, groupIds }: RecentActivityParams): Promise<ActivityItem[]> {
    if (groupIds.length === 0) {
      return [];
    }

    const limit = UserService.RECENT_ACTIVITY_LIMIT;

    const [expenses, settlements] = await Promise.all([
      ExpenseModel.find({ group: { $in: groupIds }, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate([
          { path: 'group', select: 'name' },
          { path: 'paidBy', select: 'name' },
        ]),
      SettlementModel.find({ group: { $in: groupIds } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate([
          { path: 'group', select: 'name' },
          { path: 'from', select: 'name' },
          { path: 'to', select: 'name' },
        ]),
    ]);

    const items: ActivityItem[] = [
      ...expenses.map((expense) => {
        // `group` and `paidBy` were populated, but the shares were not, so a
        // share's `user` is still a plain id here.
        const myShare = expense.shares.find((share) => String(share.user) === me);
        return {
          ...(expense.toJSON() as Record<string, unknown>),
          type: 'expense' as const,
          yourShare: myShare?.amount ?? 0,
          createdAt: expense.createdAt,
        };
      }),
      ...settlements.map((settlement) => ({
        ...(settlement.toJSON() as Record<string, unknown>),
        type: 'settlement' as const,
        createdAt: settlement.createdAt,
      })),
    ];

    return items
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
