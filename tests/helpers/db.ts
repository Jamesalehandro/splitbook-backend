import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

import { ExpenseModel } from '../../src/models/expense.model';
import { GroupModel } from '../../src/models/group.model';
import { SessionModel } from '../../src/models/session.model';
import { SettlementModel } from '../../src/models/settlement.model';
import { UserModel } from '../../src/models/user.model';

let mongod: MongoMemoryServer | null = null;

export async function connectTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  // Build indexes up front and WAIT for them — the unique email index is
  // behaviour under test, and without this it would race the first insert.
  await Promise.all([
    UserModel.init(),
    GroupModel.init(),
    ExpenseModel.init(),
    SettlementModel.init(),
    SessionModel.init(),
  ]);
}

export async function clearTestDb(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({})),
  );
}

export async function closeTestDb(): Promise<void> {
  await mongoose.disconnect();
  await mongod?.stop();
  mongod = null;
}
