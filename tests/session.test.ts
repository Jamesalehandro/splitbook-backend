import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { SessionModel } from '../src/models/session.model';

import { clearTestDb, closeTestDb, connectTestDb } from './helpers/db';
import { authHeader, registerUser, type TestUser } from './helpers/factories';
import { startTestServer, stopTestServer } from './helpers/server';

describe('sessions', () => {
  let app: Server;

  const IDLE_MINUTES = 60;

  beforeAll(async () => {
    await connectTestDb();
    app = startTestServer();
  });

  beforeEach(clearTestDb);

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  interface AgeSessionsParams {
    userId: string;
    minutes: number;
  }

  async function ageSessions({
    userId,
    minutes,
  }: AgeSessionsParams): Promise<void> {
    await SessionModel.updateMany(
      { userId },
      { $set: { lastActivityAt: new Date(Date.now() - minutes * 60_000) } },
    );
  }

  async function loginAgain(user: TestUser): Promise<TestUser> {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', 'second-device')
      .send({ email: user.email, password: user.password })
      .expect(200);

    return { ...user, token: response.body.data.token as string };
  }

  describe('logout', () => {
    it('ends this session only', async () => {
      const user = await registerUser({ app });
      const otherDevice = await loginAgain(user);

      await request(app)
        .post('/api/v1/auth/logout')
        .set(authHeader(user))
        .expect(204);

      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(401);
      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(otherDevice))
        .expect(200);
    });

    it('401s a second logout with the same token', async () => {
      const user = await registerUser({ app });

      await request(app)
        .post('/api/v1/auth/logout')
        .set(authHeader(user))
        .expect(204);
      await request(app)
        .post('/api/v1/auth/logout')
        .set(authHeader(user))
        .expect(401);
    });
  });

  describe('idle timeout', () => {
    it(`rejects a session idle for more than ${IDLE_MINUTES} minutes`, async () => {
      const user = await registerUser({ app });

      await ageSessions({ userId: user.id, minutes: IDLE_MINUTES + 1 });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(401);
      expect(response.body.message).toContain(
        `${IDLE_MINUTES} minutes of inactivity`,
      );
    });

    it('accepts a session used just inside the window', async () => {
      const user = await registerUser({ app });

      await ageSessions({ userId: user.id, minutes: IDLE_MINUTES - 1 });

      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(200);
    });

    it('extends the window on every authenticated request', async () => {
      const user = await registerUser({ app });

      for (let step = 0; step < 3; step += 1) {
        await ageSessions({ userId: user.id, minutes: IDLE_MINUTES - 1 });
        await request(app)
          .get('/api/v1/auth/me')
          .set(authHeader(user))
          .expect(200);
      }

      const session = await SessionModel.findOne({ userId: user.id });
      expect(Date.now() - session!.lastActivityAt.getTime()).toBeLessThan(
        5_000,
      );
    });

    it('does not resurrect an expired session', async () => {
      const user = await registerUser({ app });

      await ageSessions({ userId: user.id, minutes: IDLE_MINUTES + 5 });
      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(401);

      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(401);
    });

    it('reports the idle deadline on /auth/me', async () => {
      const user = await registerUser({ app });

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(200);

      const idleExpiresAt = new Date(
        response.body.data.session.idleExpiresAt,
      ).getTime();
      expect(
        Math.abs(idleExpiresAt - (Date.now() + IDLE_MINUTES * 60_000)),
      ).toBeLessThan(5_000);
    });
  });

  describe('session list', () => {
    it('lists active sessions, marks the current one, and never exposes the jti', async () => {
      const user = await registerUser({ app });
      await loginAgain(user);

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set(authHeader(user))
        .expect(200);

      const sessions = response.body.data.sessions as Array<
        Record<string, unknown>
      >;
      expect(response.body.data.total).toBe(2);
      expect(sessions.filter((session) => session['current'])).toHaveLength(1);
      expect(sessions.map((session) => session['userAgent'])).toContain(
        'second-device',
      );
      expect(sessions.every((session) => session['jti'] === undefined)).toBe(
        true,
      );
    });

    it('leaves out logged-out sessions', async () => {
      const user = await registerUser({ app });
      const otherDevice = await loginAgain(user);
      await request(app)
        .post('/api/v1/auth/logout')
        .set(authHeader(otherDevice))
        .expect(204);

      const response = await request(app)
        .get('/api/v1/auth/sessions')
        .set(authHeader(user))
        .expect(200);
      expect(response.body.data.total).toBe(1);
    });
  });

  describe('revoking one session', () => {
    it('logs that device out and leaves this one alone', async () => {
      const user = await registerUser({ app });
      const otherDevice = await loginAgain(user);

      const list = await request(app)
        .get('/api/v1/auth/sessions')
        .set(authHeader(user))
        .expect(200);
      const target = (
        list.body.data.sessions as Array<{ id: string; current: boolean }>
      ).find((session) => !session.current)!;

      await request(app)
        .delete(`/api/v1/auth/sessions/${target.id}`)
        .set(authHeader(user))
        .expect(204);

      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(otherDevice))
        .expect(401);
      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(user))
        .expect(200);
    });

    it("404s on someone else's session, and leaves it alive", async () => {
      const ada = await registerUser({ app });
      const tolu = await registerUser({ app });

      const toluSessions = await request(app)
        .get('/api/v1/auth/sessions')
        .set(authHeader(tolu))
        .expect(200);
      const toluSessionId = toluSessions.body.data.sessions[0].id as string;

      await request(app)
        .delete(`/api/v1/auth/sessions/${toluSessionId}`)
        .set(authHeader(ada))
        .expect(404);

      await request(app)
        .get('/api/v1/auth/me')
        .set(authHeader(tolu))
        .expect(200);
    });

    it('400s on a malformed id', async () => {
      const user = await registerUser({ app });
      await request(app)
        .delete('/api/v1/auth/sessions/not-an-id')
        .set(authHeader(user))
        .expect(400);
    });
  });
});
