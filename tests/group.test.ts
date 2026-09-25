import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';
import { addExpense, authHeader, createGroup, registerUser, type TestUser } from './helpers/factories';
import { startTestServer, stopTestServer } from './helpers/server';

describe('groups, members and permissions', () => {
  let app: Server;
  let ada: TestUser;
  let tolu: TestUser;
  let chidi: TestUser;

  beforeAll(async () => {
    await connectTestDb();
    app = startTestServer();
  });

  beforeEach(async () => {
    await clearTestDb();
    ada = await registerUser({ app, name: 'Ada' });
    tolu = await registerUser({ app, name: 'Tolu' });
    chidi = await registerUser({ app, name: 'Chidi' });
  });

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  it('makes the creator the admin', async () => {
    const groupId = await createGroup({ app, admin: ada });

    const response = await request(app).get(`/api/v1/groups/${groupId}`).set(authHeader(ada)).expect(200);

    expect(response.body.data.myRole).toBe('admin');
    expect(response.body.data.group.members).toHaveLength(1);
    expect(response.body.data.group.members[0].user.name).toBe('Ada');
    expect(response.body.data.group.currency).toBe('NGN');
  });

  it('lists only my groups, with pagination meta', async () => {
    await createGroup({ app, admin: ada, name: 'Flat 4B' });
    await createGroup({ app, admin: ada, name: 'Lagos trip' });
    await createGroup({ app, admin: tolu, name: 'Tolu only' });

    const response = await request(app)
      .get('/api/v1/groups')
      .query({ limit: 1 })
      .set(authHeader(ada))
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it('searches my groups by name, treating the search as text, not a regex', async () => {
    await createGroup({ app, admin: ada, name: 'Flat 4B' });
    await createGroup({ app, admin: ada, name: 'Lagos trip' });

    const found = await request(app).get('/api/v1/groups').query({ search: 'lag' }).set(authHeader(ada)).expect(200);
    expect(found.body.data.map((g: { name: string }) => g.name)).toEqual(['Lagos trip']);

    await request(app).get('/api/v1/groups').query({ search: '(a+)+$' }).set(authHeader(ada)).expect(200);
  });

  it('403s a non-member on every group route', async () => {
    const groupId = await createGroup({ app, admin: ada });

    const routes: Array<[string, string]> = [
      ['get', `/api/v1/groups/${groupId}`],
      ['get', `/api/v1/groups/${groupId}/expenses`],
      ['get', `/api/v1/groups/${groupId}/balances`],
      ['get', `/api/v1/groups/${groupId}/settle-up`],
      ['get', `/api/v1/groups/${groupId}/settlements`],
      ['post', `/api/v1/groups/${groupId}/expenses`],
    ];

    for (const [method, path] of routes) {
      const response = await (method === 'get'
        ? request(app).get(path).set(authHeader(chidi))
        : request(app).post(path).set(authHeader(chidi)).send({}));
      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(403);
    }
  });

  it('404s for a group that does not exist, and 400s for a malformed id', async () => {
    await request(app).get('/api/v1/groups/66a1b2c3d4e5f60718293a4b').set(authHeader(ada)).expect(404);
    await request(app).get('/api/v1/groups/not-an-id').set(authHeader(ada)).expect(400);
  });

  it('lets only the admin edit the group or add members', async () => {
    const groupId = await createGroup({ app, admin: ada, members: [tolu] });

    await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set(authHeader(tolu))
      .send({ name: 'Hijacked' })
      .expect(403);

    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(authHeader(tolu))
      .send({ email: chidi.email })
      .expect(403);

    const renamed = await request(app)
      .patch(`/api/v1/groups/${groupId}`)
      .set(authHeader(ada))
      .send({ name: 'Flat 4C' })
      .expect(200);
    expect(renamed.body.data.group.name).toBe('Flat 4C');
  });

  describe('adding members', () => {
    it('adds an existing user by email', async () => {
      const groupId = await createGroup({ app, admin: ada });

      const response = await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(authHeader(ada))
        .send({ email: tolu.email })
        .expect(201);

      expect(response.body.data.group.members).toHaveLength(2);
    });

    it('409s when the user is already in the group', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });

      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(authHeader(ada))
        .send({ email: tolu.email })
        .expect(409);
    });

    it('404s for an email with no account', async () => {
      const groupId = await createGroup({ app, admin: ada });

      await request(app)
        .post(`/api/v1/groups/${groupId}/members`)
        .set(authHeader(ada))
        .send({ email: 'nobody@example.com' })
        .expect(404);
    });
  });

  describe('removing members', () => {
    it('409s when removing a member with a non-zero balance', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 10_000, splitType: 'equal', participants: [ada.id, tolu.id] },
      }).expect(201);

      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${tolu.id}`)
        .set(authHeader(ada))
        .expect(409);

      // Leaving is held to the same rule.
      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${tolu.id}`)
        .set(authHeader(tolu))
        .expect(409);
    });

    it('lets a settled member leave', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });

      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${tolu.id}`)
        .set(authHeader(tolu))
        .expect(200);

      await request(app).get(`/api/v1/groups/${groupId}`).set(authHeader(tolu)).expect(403);
    });

    it('stops a member removing someone else', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu, chidi] });

      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${chidi.id}`)
        .set(authHeader(tolu))
        .expect(403);
    });

    it('stops the admin leaving their own group', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });

      await request(app)
        .delete(`/api/v1/groups/${groupId}/members/${ada.id}`)
        .set(authHeader(ada))
        .expect(409);
    });
  });

  describe('deleting a group', () => {
    it('409s while balances are outstanding, then soft-deletes once settled', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });
      await addExpense({
        app,
        groupId,
        as: ada,
        body: { amount: 10_000, splitType: 'equal', participants: [ada.id, tolu.id] },
      }).expect(201);

      await request(app).delete(`/api/v1/groups/${groupId}`).set(authHeader(ada)).expect(409);

      await request(app)
        .post(`/api/v1/groups/${groupId}/settlements`)
        .set(authHeader(tolu))
        .send({ from: tolu.id, to: ada.id, amount: 5_000 })
        .expect(201);

      await request(app).delete(`/api/v1/groups/${groupId}`).set(authHeader(ada)).expect(200);
      await request(app).get(`/api/v1/groups/${groupId}`).set(authHeader(ada)).expect(404);
    });

    it('is admin-only', async () => {
      const groupId = await createGroup({ app, admin: ada, members: [tolu] });
      await request(app).delete(`/api/v1/groups/${groupId}`).set(authHeader(tolu)).expect(403);
    });
  });
});
