import type { PopulateOptions } from 'mongoose';

import type { GroupDocument, GroupMember } from '../models/group.model';
import { SettlementModel, type SettlementDocument } from '../models/settlement.model';
import type { UserDocument } from '../models/user.model';
import { ApiError } from '../utils/error';
import { PaginationUtils, type Paginated } from '../utils/pagination';
import type {
  CreateSettlementInput,
  ListSettlementsInput,
} from '../validators/settlement.validator';

import { BalanceService } from './balance.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSettlementParams {
  group: GroupDocument;
  user: UserDocument;
  input: CreateSettlementInput;
}

export interface ListSettlementsParams {
  group: GroupDocument;
  query: ListSettlementsInput;
}

export interface RemoveSettlementParams {
  group: GroupDocument;
  user: UserDocument;
  membership: GroupMember;
  settlementId: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Recording "A paid B ₦X".
 *
 * The app never moves money. A settlement is a note that a payment happened
 * somewhere else (a bank transfer, cash), and its only effect is on the
 * balances: the payer's net goes up by X, the payee's goes down by X.
 */
export class SettlementService {
  private static readonly populate: PopulateOptions[] = [
    { path: 'from', select: 'name' },
    { path: 'to', select: 'name' },
    { path: 'createdBy', select: 'name' },
  ];

  static async create({ group, user, input }: CreateSettlementParams): Promise<SettlementDocument> {
    const me = String(user._id);

    // You can record a payment you made or one you received — not one between
    // two other people, which you have no way to vouch for.
    if (input.from !== me && input.to !== me) {
      throw ApiError.forbidden('You can only record a payment you made or received');
    }

    const memberIds = new Set(BalanceService.memberIds(group));
    const errors = [];
    if (!memberIds.has(input.from)) {
      errors.push({ field: 'from', message: 'the payer must be a member of this group' });
    }
    if (!memberIds.has(input.to)) {
      errors.push({ field: 'to', message: 'the payee must be a member of this group' });
    }
    if (errors.length > 0) {
      throw ApiError.badRequest({ message: 'Both people must be members of the group', errors });
    }

    const settlement = await SettlementModel.create({
      group: group._id,
      from: input.from,
      to: input.to,
      amount: input.amount,
      note: input.note ?? '',
      date: input.date ?? new Date(),
      createdBy: user._id,
    });

    return settlement.populate(SettlementService.populate);
  }

  static async list({ group, query }: ListSettlementsParams): Promise<Paginated<SettlementDocument>> {
    const filter = { group: group._id };

    const [items, total] = await Promise.all([
      SettlementModel.find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(PaginationUtils.skip(query))
        .limit(query.limit)
        .populate(SettlementService.populate),
      SettlementModel.countDocuments(filter),
    ]);

    return {
      items,
      meta: PaginationUtils.buildMeta({ page: query.page, limit: query.limit, total }),
    };
  }

  /**
   * "Undo payment". Allowed for whoever recorded it, or the group admin.
   *
   * A real delete rather than a soft one: a settlement recorded by mistake
   * never happened, and there is nothing about it worth keeping.
   */
  static async remove({ group, user, membership, settlementId }: RemoveSettlementParams): Promise<void> {
    const settlement = await SettlementModel.findOne({ _id: settlementId, group: group._id });
    if (!settlement) {
      throw ApiError.notFound('Settlement not found');
    }

    const isRecorder = String(settlement.createdBy) === String(user._id);
    if (!isRecorder && membership.role !== 'admin') {
      throw ApiError.forbidden('Only the person who recorded this payment or the group admin can undo it');
    }

    // Same reasoning as `ExpenseService.assertStillEditable`: undoing a payment
    // involving someone who has left would reopen a debt nobody can settle.
    const memberIds = new Set(BalanceService.memberIds(group));
    if (!memberIds.has(String(settlement.from)) || !memberIds.has(String(settlement.to))) {
      throw ApiError.conflict(
        'This payment involves someone who has left the group, so it can no longer be undone',
      );
    }

    await settlement.deleteOne();
  }
}
