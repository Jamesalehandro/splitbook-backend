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

describe('expenses', () => {
  let app: Server;
  let ada: TestUser;
  let tolu: TestUser;
  let chidi: TestUser;
  let outsider: TestUser;
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
    outsider = await registerUser({ app, name: 'Outsider' });
    groupId = await createGroup({ app, admin: ada, members: [tolu, chidi] });
  });

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  describe('recording', () => {
    it('splits ₦100 three ways as 3334 / 3333 / 3333 kobo and stores the shares', async () => {
      const response = await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 10_000, splitType: 'equal', participants: [ada.id, tolu.id, chidi.id] },
      }).expect(201);

      const { expense } = response.body.data;
      expect(expense.shares.map((share: { amount: number }) => share.amount)).toEqual([3334, 3333, 3333]);
      expect(expense.paidBy).toMatchObject({ id: ada.id, name: 'Ada' });
      expect(expense.shares[0].user).toMatchObject({ id: ada.id, name: 'Ada' });
      expect(expense.category).toBe('other');
    });

    it('rejects exact shares that do not sum to the total', async () => {
      const response = await addExpense({
        app,
        groupId,
        as: ada,
        body: {
          amount: 1_500_000,
          splitType: 'exact',
          shares: [
            { user: ada.id, amount: 500_000 },
            { user: tolu.id, amount: 900_000 },
          ],
        },
      }).expect(400);

      expect(response.body.message).toBe('Shares must add up to the total amount');
      expect(response.body.errors[0].field).toBe('shares');
    });

    it('rejects a participant who is not in the group', async () => {
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 10_000, splitType: 'equal', participants: [ada.id, outsider.id] },
      }).expect(400);
    });

    it('rejects a float amount, a zero amount, and a future date', async () => {
      const base = { splitType: 'equal', participants: [ada.id] };

      await addExpense({ app, groupId, as: ada, body: { ...base, amount: 100.5 } }).expect(400);
      await addExpense({ app, groupId, as: ada, body: { ...base, amount: 0 } }).expect(400);
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { ...base, amount: 100, date: '2099-01-01' },
      }).expect(400);
    });

    it('lets the payer be someone who is not a participant', async () => {
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 20_000, paidBy: ada.id, splitType: 'equal', participants: [tolu.id, chidi.id] },
      }).expect(201);

      expect(await getNets({ app, groupId, as: ada })).toEqual({
        [ada.id]: 20_000,
        [tolu.id]: -10_000,
        [chidi.id]: -10_000,
      });
    });
  });

  describe('editing and deleting', () => {
    it('recalculates balances after an edit', async () => {
      const created = await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 30_000, splitType: 'equal', participants: [ada.id, tolu.id, chidi.id] },
      }).expect(201);
      const expenseId = created.body.data.expense.id as string;

      // Amount changes, split stays equal — the shares follow automatically.
      await request(app)
        .patch(`/api/v1/groups/${groupId}/expenses/${expenseId}`)
        .set(authHeader(ada))
        .send({ amount: 60_000 })
        .expect(200);

      expect(await getNets({ app, groupId, as: ada })).toEqual({
        [ada.id]: 40_000,
        [tolu.id]: -20_000,
        [chidi.id]: -20_000,
      });
    });

    it('requires new shares when an exact expense changes amount', async () => {
      const created = await addExpense({
        app,
        groupId,
        as: ada,
        body: {
          amount: 1_000,
          splitType: 'exact',
          shares: [
            { user: ada.id, amount: 400 },
            { user: tolu.id, amount: 600 },
          ],
        },
      }).expect(201);

      await request(app)
        .patch(`/api/v1/groups/${groupId}/expenses/${created.body.data.expense.id as string}`)
        .set(authHeader(ada))
        .send({ amount: 2_000 })
        .expect(400);
    });

    it('restores the prior balances when an expense is deleted', async () => {
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 30_000, splitType: 'equal', participants: [ada.id, tolu.id, chidi.id] },
      }).expect(201);
      const before = await getNets({ app, groupId, as: ada });

      const second = await addExpense({
        app,
        groupId,
        as: tolu,
        body: { amount: 9_000, splitType: 'equal', participants: [ada.id, tolu.id, chidi.id] },
      }).expect(201);
      expect(await getNets({ app, groupId, as: ada })).not.toEqual(before);

      await request(app)
        .delete(`/api/v1/groups/${groupId}/expenses/${second.body.data.expense.id as string}`)
        .set(authHeader(tolu))
        .expect(200);

      expect(await getNets({ app, groupId, as: ada })).toEqual(before);
    });

    it('stops a member deleting someone else’s expense, but lets the admin', async () => {
      const created = await addExpense({
        app,
        groupId,
        as: tolu,
        body: { amount: 1_000, splitType: 'equal', participants: [tolu.id, chidi.id] },
      }).expect(201);
      const path = `/api/v1/groups/${groupId}/expenses/${created.body.data.expense.id as string}`;

      await request(app).delete(path).set(authHeader(chidi)).expect(403);
      await request(app).patch(path).set(authHeader(chidi)).send({ description: 'Mine now' }).expect(403);

      await request(app).delete(path).set(authHeader(ada)).expect(200);
      await request(app).get(path).set(authHeader(ada)).expect(404);
    });

    it('404s for an expense from another group', async () => {
      const otherGroup = await createGroup({ app, admin: outsider });
      const created = await addExpense({
        app,
        groupId: otherGroup,
        as: outsider,
        body: { amount: 1_000, splitType: 'equal', participants: [outsider.id] },
      }).expect(201);

      await request(app)
        .get(`/api/v1/groups/${groupId}/expenses/${created.body.data.expense.id as string}`)
        .set(authHeader(ada))
        .expect(404);
    });
  });

  describe('listing', () => {
    beforeEach(async () => {
      const everyone = [ada.id, tolu.id, chidi.id];
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { description: 'Dinner at Kilimanjaro', amount: 9_000, category: 'food', splitType: 'equal', participants: everyone, date: '2026-09-01' },
      }).expect(201);
      await addExpense({
        app,
        groupId,
        as: tolu,
        body: { description: 'Uber to Lekki', amount: 3_000, category: 'transport', splitType: 'equal', participants: everyone, date: '2026-09-10' },
      }).expect(201);
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { description: 'Suya dinner', amount: 6_000, category: 'food', splitType: 'equal', participants: everyone, date: '2026-09-20' },
      }).expect(201);
    });

    it('lists newest first with pagination meta', async () => {
      const response = await request(app)
        .get(`/api/v1/groups/${groupId}/expenses`)
        .query({ limit: 2 })
        .set(authHeader(chidi))
        .expect(200);

      expect(response.body.data.map((e: { description: string }) => e.description)).toEqual([
        'Suya dinner',
        'Uber to Lekki',
      ]);
      expect(response.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    });

    it('searches part of a word, case-insensitively', async () => {
      const response = await request(app)
        .get(`/api/v1/groups/${groupId}/expenses`)
        .query({ search: 'DIN' })
        .set(authHeader(ada))
        .expect(200);

      expect(response.body.meta.total).toBe(2);
    });

    it('filters by category, payer and an inclusive date range', async () => {
      const byCategory = await request(app)
        .get(`/api/v1/groups/${groupId}/expenses`)
        .query({ category: 'transport' })
        .set(authHeader(ada))
        .expect(200);
      expect(byCategory.body.meta.total).toBe(1);

      const byPayer = await request(app)
        .get(`/api/v1/groups/${groupId}/expenses`)
        .query({ paidBy: ada.id })
        .set(authHeader(ada))
        .expect(200);
      expect(byPayer.body.meta.total).toBe(2);

      const byDate = await request(app)
        .get(`/api/v1/groups/${groupId}/expenses`)
        .query({ from: '2026-09-01', to: '2026-09-10' })
        .set(authHeader(ada))
        .expect(200);
      expect(byDate.body.meta.total).toBe(2);
    });
  });
});
