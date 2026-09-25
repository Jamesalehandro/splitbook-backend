import { connectDatabase, disconnectDatabase } from '../config/database';
import { ExpenseModel } from '../models/expense.model';
import { GroupModel, type GroupDocument } from '../models/group.model';
import { SessionModel } from '../models/session.model';
import { SettlementModel } from '../models/settlement.model';
import { UserModel } from '../models/user.model';
import { AuthService } from '../services/auth.service';
import { BalanceService } from '../services/balance.service';
import { ExpenseService } from '../services/expense.service';
import { GroupService } from '../services/group.service';
import { SettlementService } from '../services/settlement.service';
import { MoneyUtils } from '../utils/money';

/**
 * `pnpm seed` — three demo users, one group, and a few expenses, for the demo.
 *
 * Safe to re-run: it first deletes the demo users and everything they own, and
 * never touches anyone else's data. Everything is created through the real
 * services, so the seeded data obeys exactly the same rules as the API.
 */

const DEMO_PASSWORD = 'password123';
const DEMO_USERS = [
  { name: 'Ada Obi', email: 'ada@splitbook.test' },
  { name: 'Tolu Bakare', email: 'tolu@splitbook.test' },
  { name: 'Chidi Eze', email: 'chidi@splitbook.test' },
];

/** A few days ago, as YYYY-MM-DD. */
function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

async function clearDemoData(): Promise<void> {
  const users = await UserModel.find({ email: { $in: DEMO_USERS.map((user) => user.email) } });
  const userIds = users.map((user) => user._id);

  const groups = await GroupModel.find({ createdBy: { $in: userIds } });
  const groupIds = groups.map((group) => group._id);

  await Promise.all([
    ExpenseModel.deleteMany({ group: { $in: groupIds } }),
    SettlementModel.deleteMany({ group: { $in: groupIds } }),
    SessionModel.deleteMany({ userId: { $in: userIds } }),
  ]);
  await GroupModel.deleteMany({ _id: { $in: groupIds } });
  await UserModel.deleteMany({ _id: { $in: userIds } });
}

async function reload(group: GroupDocument): Promise<GroupDocument> {
  const fresh = await GroupModel.findById(group._id);
  if (!fresh) throw new Error('Seed group vanished');
  return fresh;
}

async function seed(): Promise<void> {
  await connectDatabase();
  await clearDemoData();

  const [ada, tolu, chidi] = await Promise.all(
    DEMO_USERS.map(async (user) => {
      const { user: created } = await AuthService.register({
        input: { ...user, password: DEMO_PASSWORD },
      });
      return created;
    }),
  );
  if (!ada || !tolu || !chidi) throw new Error('Could not create demo users');

  let group = await GroupService.create({
    user: ada,
    input: { name: 'Flat 4B', description: 'Rent, food and utilities', currency: 'NGN' },
  });
  await GroupService.addMember({ group, input: { email: tolu.email } });
  await GroupService.addMember({ group, input: { email: chidi.email } });
  group = await reload(group);

  const everyone = [ada.id as string, tolu.id as string, chidi.id as string];

  await ExpenseService.create({
    group,
    user: ada,
    input: {
      description: 'September rent',
      amount: 45_000_000, // ₦450,000.00
      category: 'rent',
      splitType: 'equal',
      participants: everyone,
      date: daysAgo(10),
    },
  });

  await ExpenseService.create({
    group,
    user: tolu,
    input: {
      description: 'Dinner at Kilimanjaro',
      amount: 1_500_000, // ₦15,000.00
      category: 'food',
      splitType: 'exact',
      shares: [
        { user: ada.id as string, amount: 500_000 },
        { user: chidi.id as string, amount: 1_000_000 },
      ],
      date: daysAgo(5),
    },
  });

  await ExpenseService.create({
    group,
    user: chidi,
    input: {
      description: 'Electricity (prepaid)',
      amount: 2_000_000, // ₦20,000.00
      category: 'utilities',
      splitType: 'percentage',
      shares: [
        { user: ada.id as string, percent: 40 },
        { user: tolu.id as string, percent: 30 },
        { user: chidi.id as string, percent: 30 },
      ],
      date: daysAgo(2),
    },
  });

  await SettlementService.create({
    group,
    user: tolu,
    input: { from: tolu.id as string, to: ada.id as string, amount: 5_000_000, note: 'Part of rent' },
  });

  const balances = await BalanceService.getGroupBalances(group);
  const plan = await BalanceService.getSettleUpPlan(group);

  console.log('\n[seed] demo data ready — every user logs in with password:', DEMO_PASSWORD);
  for (const user of DEMO_USERS) console.log(`  ${user.email}`);

  console.log(`\n[seed] balances in "${group.name}":`);
  for (const { user, net } of balances) console.log(`  ${user.name.padEnd(12)} ${MoneyUtils.formatKobo(net)}`);

  console.log('\n[seed] settle-up plan:');
  for (const { from, to, amount } of plan) {
    console.log(`  ${from.name} pays ${to.name} ${MoneyUtils.formatKobo(amount)}`);
  }
  console.log('');
}

seed()
  .catch((error: unknown) => {
    console.error('[seed] failed:', error);
    process.exitCode = 1;
  })
  .finally(() => void disconnectDatabase());
