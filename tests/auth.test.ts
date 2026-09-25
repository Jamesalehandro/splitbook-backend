import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';
import { authHeader, registerUser } from './helpers/factories';
import { startTestServer, stopTestServer } from './helpers/server';

describe('auth and profile', () => {
  let app: Server;

  beforeAll(async () => {
    await connectTestDb();
    app = startTestServer();
  });

  beforeEach(clearTestDb);

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  describe('register', () => {
    it('creates a user, returns a token, and never returns the password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Ada Obi', email: 'Ada@Example.com', password: 'password123' })
        .expect(201);

      expect(response.body.data.token).toBeTypeOf('string');
      expect(response.body.data.user.email).toBe('ada@example.com');
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('password123');
    });

    it('rejects a duplicate email with 409', async () => {
      const body = { name: 'Ada Obi', email: 'ada@example.com', password: 'password123' };
      await request(app).post('/api/v1/auth/register').send(body).expect(201);
      await request(app).post('/api/v1/auth/register').send(body).expect(409);
    });

    it('rejects a password under 8 characters', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ name: 'Ada Obi', email: 'ada@example.com', password: 'short' })
        .expect(400);
    });
  });

  describe('login', () => {
    it('logs in with the right password', async () => {
      const user = await registerUser({ app });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      expect(response.body.data.token).toBeTypeOf('string');
      expect(response.body.data.tokenType).toBe('Bearer');
    });

    it('gives the same answer for an unknown email and a wrong password', async () => {
      const user = await registerUser({ app });

      const wrongPassword = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'not-the-password' })
        .expect(401);

      const unknownEmail = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nobody@example.com', password: 'not-the-password' })
        .expect(401);

      expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
    });
  });

  describe('protected routes', () => {
    it('401s with no token', async () => {
      await request(app).get('/api/v1/auth/me').expect(401);
    });

    it('401s with a garbage token', async () => {
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer not.a.token')
        .expect(401);
    });

    it('returns the current user', async () => {
      const user = await registerUser({ app, name: 'Tolu Bakare' });
      const response = await request(app).get('/api/v1/auth/me').set(authHeader(user)).expect(200);

      expect(response.body.data.user.name).toBe('Tolu Bakare');
    });
  });

  describe('PATCH /users/me', () => {
    it('updates the name', async () => {
      const user = await registerUser({ app });

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set(authHeader(user))
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.data.user.name).toBe('New Name');
    });

    it('refuses a password, pointing at change-password instead', async () => {
      const user = await registerUser({ app });

      const response = await request(app)
        .patch('/api/v1/users/me')
        .set(authHeader(user))
        .send({ name: 'New Name', currentPassword: user.password, newPassword: 'a-new-password' })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain('/auth/change-password');
    });
  });

  describe('POST /auth/change-password', () => {
    it('changes the password, keeps this session, and logs out every other device', async () => {
      const user = await registerUser({ app });

      // A token from a second login — "another device".
      const other = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(200);

      const changed = await request(app)
        .post('/api/v1/auth/change-password')
        .set(authHeader(user))
        .send({ currentPassword: user.password, newPassword: 'a-new-password' })
        .expect(200);

      expect(changed.body.data.revokedSessions).toBe(1);

      await request(app).get('/api/v1/auth/me').set(authHeader(user)).expect(200);
      await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${other.body.data.token as string}`)
        .expect(401);

      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: user.password })
        .expect(401);
      await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'a-new-password' })
        .expect(200);
    });

    it('rejects a wrong current password with 400, not a logout-triggering 401', async () => {
      const user = await registerUser({ app });

      const response = await request(app)
        .post('/api/v1/auth/change-password')
        .set(authHeader(user))
        .send({ currentPassword: 'wrong-password', newPassword: 'a-new-password' })
        .expect(400);

      expect(response.body.errors[0].field).toBe('currentPassword');
      await request(app).get('/api/v1/auth/me').set(authHeader(user)).expect(200);
    });

    it('requires the current password, and a new one that differs from it', async () => {
      const user = await registerUser({ app });

      await request(app)
        .post('/api/v1/auth/change-password')
        .set(authHeader(user))
        .send({ newPassword: 'a-new-password' })
        .expect(400);

      await request(app)
        .post('/api/v1/auth/change-password')
        .set(authHeader(user))
        .send({ currentPassword: user.password, newPassword: user.password })
        .expect(400);
    });

    it('401s without a token', async () => {
      await request(app)
        .post('/api/v1/auth/change-password')
        .send({ currentPassword: 'password123', newPassword: 'a-new-password' })
        .expect(401);
    });
  });

  describe('GET /users/search', () => {
    it('finds a user by exact email and returns public fields only', async () => {
      const ada = await registerUser({ app, name: 'Ada Obi' });
      const tolu = await registerUser({ app });

      const response = await request(app)
        .get('/api/v1/users/search')
        .query({ email: ada.email })
        .set(authHeader(tolu))
        .expect(200);

      expect(response.body.data.user).toMatchObject({ id: ada.id, name: 'Ada Obi', email: ada.email });
      expect(response.body.data.user.passwordHash).toBeUndefined();
    });

    it('404s for an unknown email', async () => {
      const tolu = await registerUser({ app });
      await request(app)
        .get('/api/v1/users/search')
        .query({ email: 'nobody@example.com' })
        .set(authHeader(tolu))
        .expect(404);
    });
  });
});
