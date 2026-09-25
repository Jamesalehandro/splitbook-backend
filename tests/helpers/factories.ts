import type { Server } from 'node:http';
import request from 'supertest';

let counter = 0;

export type AuthHeader = { Authorization: string };

export interface TestUser {
  id: string;
  name: string;
  email: string;
  password: string;
  token: string;
}

export interface RegisterUserParams {
  app: Server;
  name?: string;
}

export interface CreateGroupParams {
  app: Server;
  admin: TestUser;
  members?: TestUser[];
  name?: string;
}

export interface AddExpenseParams {
  app: Server;
  groupId: string;
  as: TestUser;
  body: Record<string, unknown>;
}

export function authHeader(user: TestUser): AuthHeader {
  return { Authorization: `Bearer ${user.token}` };
}

/** Registers a user; registration returns a token, so no separate login. */
export async function registerUser({
  app,
  name,
}: RegisterUserParams): Promise<TestUser> {
  counter += 1;
  const body = {
    name: name ?? `User ${counter}`,
    email: `user${counter}@example.com`,
    password: 'password123',
  };

  const response = await request(app)
    .post('/api/v1/auth/register')
    .send(body)
    .expect(201);

  return {
    id: response.body.data.user.id as string,
    name: body.name,
    email: body.email,
    password: body.password,
    token: response.body.data.token as string,
  };
}

/** Creates a group as `admin` and adds `members` to it. Returns the group id. */
export async function createGroup({
  app,
  admin,
  members = [],
  name = 'Flat 4B',
}: CreateGroupParams): Promise<string> {
  const created = await request(app)
    .post('/api/v1/groups')
    .set(authHeader(admin))
    .send({ name })
    .expect(201);

  const groupId = created.body.data.group.id as string;

  for (const member of members) {
    await request(app)
      .post(`/api/v1/groups/${groupId}/members`)
      .set(authHeader(admin))
      .send({ email: member.email })
      .expect(201);
  }

  return groupId;
}

/** Posts an expense and returns the raw response, for the caller to assert on. */
export function addExpense({
  app,
  groupId,
  as,
  body,
}: AddExpenseParams): request.Test {
  return request(app)
    .post(`/api/v1/groups/${groupId}/expenses`)
    .set(authHeader(as))
    .send({ description: 'Groceries', date: '2026-09-20', ...body });
}

export interface NetsParams {
  app: Server;
  groupId: string;
  as: TestUser;
}

/** The group's balances as `{ [userId]: net }`, for compact assertions. */
export async function getNets({
  app,
  groupId,
  as,
}: NetsParams): Promise<Record<string, number>> {
  const response = await request(app)
    .get(`/api/v1/groups/${groupId}/balances`)
    .set(authHeader(as))
    .expect(200);

  const nets: Record<string, number> = {};
  for (const row of response.body.data as Array<{
    user: { id: string };
    net: number;
  }>) {
    nets[row.user.id] = row.net;
  }
  return nets;
}
