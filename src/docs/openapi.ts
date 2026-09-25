/**
 * The spec served at /api/docs.
 *
 * Hand-written rather than generated: the zod schemas describe what we accept,
 * but the parts worth documenting here are the ones a generator cannot infer —
 * that every amount is kobo, why a member cannot leave while owing money, and
 * which role may do what.
 */

const errorResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string' },
    data: { type: 'object', nullable: true, example: null },
    errors: {
      type: 'array',
      description: 'Only on validation failures',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
} as const;

function withError(description: string) {
  return { description, content: { 'application/json': { schema: errorResponse } } };
}

function jsonBody(schema: Record<string, unknown>) {
  return { required: true, content: { 'application/json': { schema } } };
}

const objectId = { type: 'string', pattern: '^[a-f\\d]{24}$', example: '66a1b2c3d4e5f60718293a4b' };
const kobo = { type: 'integer', minimum: 1, description: 'Kobo. ₦15,000.00 = 1500000', example: 1500000 };

const groupIdParam = { name: 'groupId', in: 'path', required: true, schema: objectId };
const pageParams = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];

/** The responses every route under /groups/:groupId can give. */
const groupErrors = {
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': withError('Not a member of this group, or not allowed to do this'),
  '404': withError('Group not found (or deleted)'),
};

const secured = [{ bearerAuth: [] }];

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'SplitBook API',
    version: '1.0.0',
    description: [
      'Record shared expenses in groups, see who owes whom, and settle up with the fewest payments.',
      '',
      '**Flow:** register → create a group → add members → record expenses → view balances → settle up.',
      '',
      '**Amounts are integer kobo** everywhere, in and out. ₦1 = 100 kobo, so ₦15,000.00 is `1500000`.',
      'Floats are rejected.',
      '',
      '**Balances are never stored.** They are recomputed from expenses and settlements on every read,',
      'so they are correct after any add, edit or delete. A positive `net` means the group owes that',
      'person; negative means they owe the group. The nets of a group always sum to 0.',
      '',
      '**Roles:** the group creator is its admin (edit/delete the group, add/remove members, edit/delete',
      'any expense). Members can view the group, add expenses, edit/delete their own, and record',
      'settlements they are part of. Non-members get 403.',
      '',
      '**Every response** has the shape `{ success, message, data }`, plus `meta` on paginated lists',
      'and `errors[]` on validation failures.',
      '',
      '**Auth:** send `Authorization: Bearer <token>` on every route except register and login.',
      'Each token belongs to a server-side session that ends on logout, on a password change made',
      'from another device, or after `idleTimeoutMinutes` (returned at login) with no requests.',
    ].join('\n'),
  },
  servers: [{ url: '/api/v1', description: 'This server' }],
  tags: [
    { name: 'Health' },
    { name: 'Auth', description: 'Register, login, logout, sessions, password' },
    { name: 'Users', description: 'Profile, user search, dashboard summary' },
    { name: 'Groups', description: 'Groups and members' },
    { name: 'Expenses', description: 'Record, edit, delete, search' },
    { name: 'Balances', description: 'Net balances and the settle-up plan' },
    { name: 'Settlements', description: 'Recording "A paid B ₦X"' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    responses: {
      Unauthorized: withError('Missing or invalid token, or its session has ended'),
      ValidationFailed: withError('Validation failed — `errors` lists each offending field'),
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Liveness check',
        responses: { '200': { description: 'Service is up' } },
      },
    },

    // ── Auth ────────────────────────────────────────────────────────────────
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account and get a token',
        requestBody: jsonBody({
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 50, example: 'Ada Obi' },
            email: { type: 'string', format: 'email', example: 'ada@example.com' },
            password: { type: 'string', minLength: 8, example: 'password123' },
          },
        }),
        responses: {
          '201': { description: 'Account created; `data` has `user`, `token`, `expiresAt`' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          '409': withError('Email already registered'),
          '429': withError('Too many attempts from this address'),
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and get a token',
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'ada@example.com' },
            password: { type: 'string', example: 'password123' },
          },
        }),
        responses: {
          '200': { description: 'Token issued' },
          '401': withError('Invalid email or password — the same message either way'),
          '429': withError('Too many attempts from this address'),
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'End this session',
        description:
          'Revokes the session behind the token that made the request. Other devices stay logged in.',
        security: secured,
        responses: {
          '204': { description: 'Logged out; the token no longer works' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'The current user and session',
        security: secured,
        responses: {
          '200': {
            description:
              '`{ user, session: { id, lastActivityAt, idleExpiresAt, expiresAt } }`. Every authenticated request pushes `idleExpiresAt` forward.',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/sessions': {
      get: {
        tags: ['Auth'],
        summary: 'Devices currently logged in',
        security: secured,
        responses: {
          '200': {
            description:
              '`{ sessions: [{ id, ip, userAgent, lastActivityAt, idleExpiresAt, current }], total }`, most recently used first',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/sessions/{sessionId}': {
      delete: {
        tags: ['Auth'],
        summary: 'Log out one device',
        security: secured,
        parameters: [{ name: 'sessionId', in: 'path', required: true, schema: objectId }],
        responses: {
          '204': { description: 'That session is revoked' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': withError('No active session with that id belongs to you'),
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the password',
        description:
          'Logs out every OTHER device. The token that made the request keeps working, so the client does not need to swap tokens.',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string' },
            newPassword: { type: 'string', minLength: 8, maxLength: 128 },
          },
        }),
        responses: {
          '200': { description: '`{ revokedSessions }`: how many other devices were logged out' },
          '400': withError('Validation failed, or the current password is wrong (400, not 401)'),
          '401': { $ref: '#/components/responses/Unauthorized' },
          '429': withError('Too many attempts from this address'),
        },
      },
    },

    // ── Users ───────────────────────────────────────────────────────────────
    '/users/me': {
      patch: {
        tags: ['Users'],
        summary: 'Update my name',
        description: 'Passwords are changed at `POST /auth/change-password`; sending one here is a 400.',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 50 },
          },
        }),
        responses: {
          '200': { description: '`{ user }`' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/users/search': {
      get: {
        tags: ['Users'],
        summary: 'Find a user by exact email, to add them to a group',
        security: secured,
        parameters: [{ name: 'email', in: 'query', required: true, schema: { type: 'string', format: 'email' } }],
        responses: {
          '200': { description: '`{ user: { id, name, email } }`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '404': withError('No account uses that email'),
        },
      },
    },
    '/users/me/summary': {
      get: {
        tags: ['Users'],
        summary: 'Dashboard: totals owed / owing across groups, and recent activity',
        security: secured,
        responses: {
          '200': {
            description:
              '`{ youOwe, youAreOwed, net, groups: [{ id, name, currency, net }], recentActivity: [...] }` — all kobo',
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },

    // ── Groups ──────────────────────────────────────────────────────────────
    '/groups': {
      post: {
        tags: ['Groups'],
        summary: 'Create a group (you become its admin)',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 60, example: 'Flat 4B' },
            description: { type: 'string', maxLength: 200, example: 'Rent, food and utilities' },
            currency: { type: 'string', enum: ['NGN'], default: 'NGN' },
          },
        }),
        responses: {
          '201': { description: 'Group created' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      get: {
        tags: ['Groups'],
        summary: 'My groups',
        security: secured,
        parameters: [{ name: 'search', in: 'query', schema: { type: 'string' } }, ...pageParams],
        responses: {
          '200': { description: 'Paginated; each item adds `memberCount` and `myRole`' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/groups/{groupId}': {
      parameters: [groupIdParam],
      get: {
        tags: ['Groups'],
        summary: 'Group detail with members',
        security: secured,
        responses: { '200': { description: '`{ group, myRole }`' }, ...groupErrors },
      },
      patch: {
        tags: ['Groups'],
        summary: 'Rename / edit description (admin)',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          properties: { name: { type: 'string' }, description: { type: 'string' } },
        }),
        responses: {
          '200': { description: 'Updated' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          ...groupErrors,
        },
      },
      delete: {
        tags: ['Groups'],
        summary: 'Delete the group (admin; only when every balance is 0)',
        security: secured,
        responses: {
          '200': { description: 'Deleted (soft)' },
          ...groupErrors,
          '409': withError('Balances are not all 0 yet'),
        },
      },
    },
    '/groups/{groupId}/members': {
      parameters: [groupIdParam],
      post: {
        tags: ['Groups'],
        summary: 'Add a member by email or userId (admin)',
        description: 'The person must already have an account. Send exactly one of `email` or `userId`.',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email', example: 'tolu@example.com' },
            userId: objectId,
          },
        }),
        responses: {
          '201': { description: 'Added; returns the updated group' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          ...groupErrors,
          '409': withError('Already a member'),
        },
      },
    },
    '/groups/{groupId}/members/{userId}': {
      parameters: [groupIdParam, { name: 'userId', in: 'path', required: true, schema: objectId }],
      delete: {
        tags: ['Groups'],
        summary: 'Remove a member (admin) or leave (your own id)',
        description: 'Only at a net balance of exactly 0. The admin cannot leave.',
        security: secured,
        responses: {
          '200': { description: 'Removed' },
          ...groupErrors,
          '409': withError('Member still owes or is owed money, or is the admin'),
        },
      },
    },

    // ── Expenses ────────────────────────────────────────────────────────────
    '/groups/{groupId}/expenses': {
      parameters: [groupIdParam],
      post: {
        tags: ['Expenses'],
        summary: 'Record an expense',
        description: [
          'The split input depends on `splitType`:',
          '- `equal` — `participants: [userId]`',
          '- `exact` — `shares: [{ user, amount }]` in kobo, summing exactly to `amount`',
          '- `percentage` — `shares: [{ user, percent }]`, summing to 100 (up to 2 decimals)',
          '',
          'Leftover kobo from rounding goes one at a time to participants in the order sent:',
          '₦100.00 split 3 ways is 3334, 3333, 3333. `paidBy` defaults to you and need not be a participant.',
        ].join('\n'),
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          required: ['description', 'amount', 'splitType', 'date'],
          properties: {
            description: { type: 'string', maxLength: 100, example: 'Dinner at Kilimanjaro' },
            amount: kobo,
            category: {
              type: 'string',
              enum: ['food', 'transport', 'rent', 'utilities', 'entertainment', 'other'],
              default: 'other',
            },
            paidBy: objectId,
            splitType: { type: 'string', enum: ['equal', 'exact', 'percentage'] },
            participants: { type: 'array', items: objectId },
            shares: {
              type: 'array',
              items: {
                type: 'object',
                properties: { user: objectId, amount: { type: 'integer' }, percent: { type: 'number' } },
              },
            },
            date: { type: 'string', example: '2026-09-20', description: 'Not in the future' },
          },
        }),
        responses: {
          '201': { description: 'Created, with computed `shares`' },
          '400': withError('Validation failed — e.g. "Shares must add up to the total amount"'),
          ...groupErrors,
        },
      },
      get: {
        tags: ['Expenses'],
        summary: 'List, search and filter expenses',
        security: secured,
        parameters: [
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Matches description, case-insensitive' },
          {
            name: 'category',
            in: 'query',
            schema: { type: 'string', enum: ['food', 'transport', 'rent', 'utilities', 'entertainment', 'other'] },
          },
          { name: 'paidBy', in: 'query', schema: objectId },
          { name: 'from', in: 'query', schema: { type: 'string', example: '2026-09-01' } },
          { name: 'to', in: 'query', schema: { type: 'string', example: '2026-09-30' }, description: 'Inclusive' },
          ...pageParams,
        ],
        responses: { '200': { description: 'Paginated, newest first' }, ...groupErrors },
      },
    },
    '/groups/{groupId}/expenses/{expenseId}': {
      parameters: [groupIdParam, { name: 'expenseId', in: 'path', required: true, schema: objectId }],
      get: {
        tags: ['Expenses'],
        summary: 'Expense detail with shares',
        security: secured,
        responses: { '200': { description: 'The expense' }, ...groupErrors },
      },
      patch: {
        tags: ['Expenses'],
        summary: 'Edit (creator or admin)',
        description:
          'Send only what changed. Changing the amount re-splits equal and percentage expenses automatically; an exact split needs new `shares`. Changing `splitType` needs the matching `participants`/`shares`.',
        security: secured,
        requestBody: jsonBody({ type: 'object' }),
        responses: {
          '200': { description: 'Updated' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          ...groupErrors,
          '409': withError('The expense involves someone who has left the group'),
        },
      },
      delete: {
        tags: ['Expenses'],
        summary: 'Delete (creator or admin)',
        security: secured,
        responses: {
          '200': { description: 'Deleted' },
          ...groupErrors,
          '409': withError('The expense involves someone who has left the group'),
        },
      },
    },

    // ── Balances ────────────────────────────────────────────────────────────
    '/groups/{groupId}/balances': {
      parameters: [groupIdParam],
      get: {
        tags: ['Balances'],
        summary: 'Net balance per member',
        security: secured,
        responses: {
          '200': { description: '`[{ user: { id, name, email }, net, isMember }]` — net in kobo' },
          ...groupErrors,
        },
      },
    },
    '/groups/{groupId}/settle-up': {
      parameters: [groupIdParam],
      get: {
        tags: ['Balances'],
        summary: 'Who pays whom — the fewest transfers',
        security: secured,
        responses: {
          '200': { description: '`[{ from: { id, name }, to: { id, name }, amount }]`; empty when settled' },
          ...groupErrors,
        },
      },
    },

    // ── Settlements ─────────────────────────────────────────────────────────
    '/groups/{groupId}/settlements': {
      parameters: [groupIdParam],
      post: {
        tags: ['Settlements'],
        summary: 'Record a payment ("from paid to")',
        description: 'You must be `from` or `to`. No money moves — this records a payment made elsewhere.',
        security: secured,
        requestBody: jsonBody({
          type: 'object',
          required: ['from', 'to', 'amount'],
          properties: {
            from: objectId,
            to: objectId,
            amount: kobo,
            note: { type: 'string', maxLength: 200 },
            date: { type: 'string', description: 'Defaults to now' },
          },
        }),
        responses: {
          '201': { description: 'Recorded' },
          '400': { $ref: '#/components/responses/ValidationFailed' },
          ...groupErrors,
        },
      },
      get: {
        tags: ['Settlements'],
        summary: 'List payments',
        security: secured,
        parameters: pageParams,
        responses: { '200': { description: 'Paginated, newest first' }, ...groupErrors },
      },
    },
    '/groups/{groupId}/settlements/{settlementId}': {
      parameters: [groupIdParam, { name: 'settlementId', in: 'path', required: true, schema: objectId }],
      delete: {
        tags: ['Settlements'],
        summary: 'Undo a payment (whoever recorded it, or the admin)',
        security: secured,
        responses: {
          '200': { description: 'Undone' },
          ...groupErrors,
          '409': withError('The payment involves someone who has left the group'),
        },
      },
    },
  },
};
