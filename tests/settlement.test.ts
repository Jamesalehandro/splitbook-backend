import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';
import {
  addExpense,
  authHeader,
  createGroup,
  getNets,
  registerUser,
  type TestUser,
} from './helpers/factories';
import { startTestServer, stopTestServer } from './helpers/server';

describe('balances, settle-up and settlements', () => {
  let app: Server;
  let ada: TestUser;
  let tolu: TestUser;
  let chidi: TestUser;
  let groupId: string;

  beforeAll(async () => {
    await connectTestDb();
    app = startTestServer();
  });

  beforeEach(async () => {
    await clearTestDb();
    ada = await registerUser({ app, name: 'Ada' });
    tolu = await registerUser({ app, name: 'Tolu' });
    chidi = await registerUser({ app, name: 'Chidi' });
    groupId = await createGroup({ app, admin: ada, members: [tolu, chidi] });
  });

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  it('runs the full flow and ends with every balance at 0', async () => {
    const everyone = [ada.id, tolu.id, chidi.id];

    await addExpense({
      app,
      groupId,
      as: ada,
      body: {
        description: 'Rent',
        amount: 900_000,
        splitType: 'equal',
        participants: everyone,
      },
    }).expect(201);
    await addExpense({
      app,
      groupId,
      as: tolu,
      body: {
        description: 'Dinner',
        amount: 30_000,
        splitType: 'percentage',
        shares: [
          { user: ada.id, percent: 50 },
          { user: chidi.id, percent: 50 },
        ],
      },
    }).expect(201);

    const nets = await getNets({ app, groupId, as: chidi });
    expect(Object.values(nets).reduce((a, b) => a + b, 0)).toBe(0);
    // Ada paid 900,000, owes 300,000 + 15,000 -> +585,000.
    expect(nets[ada.id]).toBe(585_000);

    const plan = await request(app)
      .get(`/api/v1/groups/${groupId}/settle-up`)
      .set(authHeader(chidi))
      .expect(200);
    expect(plan.body.message).toBe('Settle-up plan generated');
    expect(plan.body.data.length).toBeLessThanOrEqual(2);

    // Everyone pays exactly what the plan says.
    for (const step of plan.body.data as Array<{
      from: { id: string };
      to: { id: string };
      amount: number;
    }>) {
      const payer = [ada, tolu, chidi].find(
        (user) => user.id === step.from.id,
      )!;
      await request(app)
        .post(`/api/v1/groups/${groupId}/settlements`)
        .set(authHeader(payer))
        .send({ from: step.from.id, to: step.to.id, amount: step.amount })
        .expect(201);
    }

    expect(await getNets({ app, groupId, as: ada })).toEqual({
      [ada.id]: 0,
      [tolu.id]: 0,
      [chidi.id]: 0,
    });

    const after = await request(app)
      .get(`/api/v1/groups/${groupId}/settle-up`)
      .set(authHeader(ada))
      .expect(200);
    expect(after.body.data).toEqual([]);
    expect(after.body.message).toBe('Everyone is settled up');
  });

  it('returns the settle-up shape the frontend expects', async () => {
    await addExpense({
      app,
      groupId,
      as: ada,
      body: {
        amount: 1_500_000,
        splitType: 'exact',
        shares: [{ user: tolu.id, amount: 1_500_000 }],
      },
    }).expect(201);

    const plan = await request(app)
      .get(`/api/v1/groups/${groupId}/settle-up`)
      .set(authHeader(ada))
      .expect(200);

    expect(plan.body.data).toEqual([
      {
        from: { id: tolu.id, name: 'Tolu' },
        to: { id: ada.id, name: 'Ada' },
        amount: 1_500_000,
      },
    ]);
  });

  it('only lets you record a payment you are part of', async () => {
    await request(app)
      .post(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(chidi))
      .send({ from: tolu.id, to: ada.id, amount: 1_000 })
      .expect(403);
  });

  it('rejects a payment to yourself, or to a non-member', async () => {
    const outsider = await registerUser({ app });

    await request(app)
      .post(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(tolu))
      .send({ from: tolu.id, to: tolu.id, amount: 1_000 })
      .expect(400);

    await request(app)
      .post(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(tolu))
      .send({ from: tolu.id, to: outsider.id, amount: 1_000 })
      .expect(400);
  });

  it('undoing a payment restores the debt; only the recorder or admin may undo', async () => {
    await addExpense({
      app,
      groupId,
      as: ada,
      body: {
        amount: 2_000,
        splitType: 'equal',
        participants: [ada.id, tolu.id],
      },
    }).expect(201);

    const recorded = await request(app)
      .post(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(tolu))
      .send({ from: tolu.id, to: ada.id, amount: 1_000, note: 'Transfer' })
      .expect(201);
    const path = `/api/v1/groups/${groupId}/settlements/${recorded.body.data.settlement.id as string}`;

    expect((await getNets({ app, groupId, as: ada }))[tolu.id]).toBe(0);

    await request(app).delete(path).set(authHeader(chidi)).expect(403);
    await request(app).delete(path).set(authHeader(tolu)).expect(200);

    expect((await getNets({ app, groupId, as: ada }))[tolu.id]).toBe(-1_000);
  });

  it('lists settlements with pagination meta', async () => {
    await request(app)
      .post(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(tolu))
      .send({ from: tolu.id, to: ada.id, amount: 1_000 })
      .expect(201);

    const response = await request(app)
      .get(`/api/v1/groups/${groupId}/settlements`)
      .set(authHeader(ada))
      .expect(200);

    expect(response.body.data[0]).toMatchObject({
      from: { name: 'Tolu' },
      to: { name: 'Ada' },
      amount: 1_000,
    });
    expect(response.body.meta.total).toBe(1);
  });

  it('builds the dashboard summary across groups', async () => {
    const trip = await createGroup({
      app,
      admin: tolu,
      members: [ada],
      name: 'Lagos trip',
    });

    // Flat: Ada is owed 2,000 by Tolu. Trip: Ada owes Tolu 500.
    await addExpense({
      app,
      groupId,
      as: ada,
      body: {
        amount: 2_000,
        splitType: 'exact',
        shares: [{ user: tolu.id, amount: 2_000 }],
      },
    }).expect(201);
    await addExpense({
      app,
      groupId: trip,
      as: tolu,
      body: {
        amount: 1_000,
        splitType: 'equal',
        participants: [ada.id, tolu.id],
      },
    }).expect(201);

    const response = await request(app)
      .get('/api/v1/users/me/summary')
      .set(authHeader(ada))
      .expect(200);
    const summary = response.body.data;

    // Kept apart, not netted: two different people are involved.
    expect(summary.youAreOwed).toBe(2_000);
    expect(summary.youOwe).toBe(500);
    expect(summary.net).toBe(1_500);
    expect(summary.groups).toHaveLength(2);
    expect(summary.recentActivity).toHaveLength(2);
    expect(summary.recentActivity[0]).toMatchObject({
      type: 'expense',
      yourShare: 500,
    });
  });
});
