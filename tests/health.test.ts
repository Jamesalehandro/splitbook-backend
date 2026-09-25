import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, connectTestDb } from './helpers/db';
import { startTestServer, stopTestServer } from './helpers/server';

describe('health and error handling', () => {
  let app: Server;

  beforeAll(async () => {
    await connectTestDb();
    app = startTestServer();
  });

  afterAll(async () => {
    await stopTestServer(app);
    await closeTestDb();
  });

  it('reports ok in the standard envelope', async () => {
    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.data.database).toBe('connected');
  });

  it('returns a JSON 404 for an unknown route', async () => {
    const response = await request(app).get('/api/v1/nope').expect(404);

    expect(response.body).toMatchObject({ success: false, data: null });
    expect(response.body.message).toContain('/api/v1/nope');
  });

  it('rejects an invalid body with 400 and field-level errors', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email' })
      .expect(400);

    expect(response.body.message).toBe('Validation failed');
    expect(response.body.data).toBeNull();
    expect(response.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('returns 400, not 500, for malformed JSON', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "broken"')
      .expect(400);

    expect(response.body.message).toBe('Malformed request body');
  });

  it('strips Mongo operators before they reach a query', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('serves the API documentation', async () => {
    await request(app).get('/api/docs/').expect(200);
  });
});
