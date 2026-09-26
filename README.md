# SplitBook API

The backend for SplitBook: friends, flatmates and teams record shared expenses in
groups, see exactly who owes whom, and settle up with the fewest payments.

Express 5 + TypeScript + Mongoose.

## Getting started

```bash
pnpm install
cp .env.example .env

# Generate a signing secret and paste it into JWT_SECRET:
openssl rand -hex 32

pnpm dev          # http://localhost:5000, docs at http://localhost:5000/api/docs
pnpm seed         # 3 demo users, 1 group, sample expenses (safe to re-run)
```

You need a MongoDB to point `MONGO_URI` at — a local `mongod`, or a free Atlas M0 cluster.

Demo logins after `pnpm seed` (password `password123` for all three):
`ada@splitbook.test`, `tolu@splitbook.test`, `chidi@splitbook.test`.

## Scripts

| Script           | What it does                                  |
| ---------------- | --------------------------------------------- |
| `pnpm dev`       | Run with auto-reload (nodemon + tsx)          |
| `pnpm build`     | Compile TypeScript to `dist/`                 |
| `pnpm start`     | Run the compiled build — what Render runs     |
| `pnpm typecheck` | Type-check `src` and `tests` without emitting |
| `pnpm test`      | Run every test once                           |
| `pnpm seed`      | Reset and create the demo data                |

## For the frontend team

- **Base URL:** `/api/v1`. Interactive docs at `/api/docs`; a Postman collection is in
  [postman/](postman/splitbook.postman_collection.json).
- **Auth:** `Authorization: Bearer <token>` on everything except register and login. Both log the
  user in and return `{ user, token, tokenType, expiresAt, idleTimeoutMinutes }`. See
  [Auth and sessions](#auth-and-sessions) below.
- **Money is integer kobo, both ways.** ₦15,000.00 is `1500000`. Convert naira to kobo before
  sending, and divide by 100 to display. A float is rejected with 400.
- **After any expense or settlement change**, refetch that group's `expenses`, `balances` and
  `settle-up`. Balances are computed fresh on every read, so a refetch is always correct.

### Auth and sessions

Every token belongs to a session on the server, one per login. A session ends when the first of
these happens, and from then on its token gets a 401:

| Ends the session                                       | Which sessions                 |
| ------------------------------------------------------ | ------------------------------ |
| `POST /auth/logout`                                    | This device only               |
| `DELETE /auth/sessions/:sessionId`                     | That one device                |
| `POST /auth/change-password`                           | Every device _except_ this one |
| No requests for `idleTimeoutMinutes` (default 60)      | That session                   |
| `expiresAt` passes (1 day after login), however active | That session                   |

- **Every authenticated request resets the idle clock**, so a user who keeps using the app is
  only logged out by `expiresAt`. `GET /auth/me` returns `session.idleExpiresAt` if you want to
  warn before it runs out.
- **Logout:** call `POST /auth/logout` (204), then delete the token on the client.
- **"Where you're logged in":** `GET /auth/sessions` returns each active session with `ip`,
  `userAgent`, `lastActivityAt` and `current: true` on this device's session. Pass an `id` to
  `DELETE /auth/sessions/:sessionId` to log that device out.
- **Changing the password:** `POST /auth/change-password` with `{ currentPassword, newPassword }`.
  The current token keeps working, so there is nothing to swap. A wrong `currentPassword` is a
  **400**, not a 401, so it does not log the user out. `PATCH /users/me` changes the name only,
  and rejects a password with a 400.

### Response shape

Every response has the same envelope:

```json
{ "success": true,  "message": "Expense created successfully", "data": { },
  "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }

{ "success": false, "message": "Shares must add up to the total amount", "data": null,
  "errors": [{ "field": "shares", "message": "shares are ₦4,000.00 short of ₦15,000.00" }] }
```

`meta` appears only on paginated lists; `errors` only on validation failures, with `field` as a
dotted path (`shares.0.amount`) so it can be shown under the matching input.

| Code | When                                                                             |
| ---- | -------------------------------------------------------------------------------- |
| 400  | Validation failed — bad id, bad amount, shares don't sum, wrong current password |
| 401  | Missing or invalid token, or its session ended → log the user out                |
| 403  | Not a member of the group, or not allowed (e.g. deleting someone else's expense) |
| 404  | Group, expense, user, settlement or session not found                            |
| 409  | Email taken, already in the group, removing/deleting with money outstanding      |
| 429  | Too many register, login or change-password attempts from one address            |

## Endpoints

| Method | Path                                                                         | Who                      |
| ------ | ---------------------------------------------------------------------------- | ------------------------ |
| POST   | `/auth/register`, `/auth/login`                                              | Public                   |
| POST   | `/auth/logout`, `/auth/change-password`                                      | Logged in                |
| GET    | `/auth/me`, `/auth/sessions`                                                 | Logged in                |
| DELETE | `/auth/sessions/:sessionId`                                                  | Logged in (own sessions) |
| PATCH  | `/users/me`                                                                  | Logged in                |
| GET    | `/users/search?email=`                                                       | Logged in                |
| GET    | `/users/me/summary`                                                          | Logged in                |
| POST   | `/groups`                                                                    | Logged in                |
| GET    | `/groups?search=&page=&limit=`                                               | Logged in (own groups)   |
| GET    | `/groups/:groupId`                                                           | Member                   |
| PATCH  | `/groups/:groupId`                                                           | Admin                    |
| DELETE | `/groups/:groupId`                                                           | Admin, all balances 0    |
| POST   | `/groups/:groupId/members`                                                   | Admin                    |
| DELETE | `/groups/:groupId/members/:userId`                                           | Admin, or self to leave  |
| POST   | `/groups/:groupId/expenses`                                                  | Member                   |
| GET    | `/groups/:groupId/expenses?search=&category=&paidBy=&from=&to=&page=&limit=` | Member                   |
| GET    | `/groups/:groupId/expenses/:expenseId`                                       | Member                   |
| PATCH  | `/groups/:groupId/expenses/:expenseId`                                       | Creator or admin         |
| DELETE | `/groups/:groupId/expenses/:expenseId`                                       | Creator or admin         |
| GET    | `/groups/:groupId/balances`                                                  | Member                   |
| GET    | `/groups/:groupId/settle-up`                                                 | Member                   |
| POST   | `/groups/:groupId/settlements`                                               | Member who is from or to |
| GET    | `/groups/:groupId/settlements`                                               | Member                   |
| DELETE | `/groups/:groupId/settlements/:settlementId`                                 | Recorder or admin        |
| GET    | `/health`                                                                    | Public                   |

## How the money works

### Splits

The split input depends on `splitType`. Whichever is used, the server turns it into the same
`shares: [{ user, amount }]` in kobo and saves that. Nothing downstream needs to know how a split
was entered.

| `splitType`  | Send                          | Rule                              |
| ------------ | ----------------------------- | --------------------------------- |
| `equal`      | `participants: [userId]`      | At least one participant          |
| `exact`      | `shares: [{ user, amount }]`  | Amounts sum exactly to the total  |
| `percentage` | `shares: [{ user, percent }]` | Percents sum to 100, ≤ 2 decimals |

**Rounding:** divide in kobo, round down, then hand out the leftover kobo one at a time to
participants in the order they were sent. ₦100.00 split three ways is `3334, 3333, 3333`. The
payer does not have to be a participant, and `paidBy` defaults to the caller.

### Balances are never stored

```
net(u) = Σ paid(u) − Σ share(u) + Σ settlementsSent(u) − Σ settlementsReceived(u)
```

Positive means the group owes you; negative means you owe the group. Every kobo is added to one
person and subtracted from another, so a group's nets always sum to exactly 0.

Nothing writes a balance anywhere. Every read recomputes it from the expenses and settlements. That
is why an edit or a delete can never leave a balance wrong: there is no stored balance to forget
to update. If a group ever grows to thousands of expenses, `BalanceService.getNetBalances` is the
one method to swap for an aggregation or a cached value.

### Settle-up (fewest transfers)

Greedy: match the largest debtor with the largest creditor, transfer the smaller of the two
amounts, drop whoever hits 0, and repeat. Each round zeroes at least one person, so `n` people
need at most `n − 1` transfers. Ties break by user id, so the same balances always produce the
same plan.

### Membership rules that protect the money

- A member can only leave, or be removed, at a net of exactly 0. Otherwise the people they owe
  would have nobody left in the group to collect from.
- A group can only be deleted (soft delete) once every balance is 0.
- The admin cannot leave. They are the only one who can manage the group.
- An expense or settlement that involves a former member can no longer be edited, deleted or
  undone. Doing so would move that person off 0 after they have gone.

## Security

- **Passwords:** bcrypt (cost 10, env-tunable). The hash has `select: false` and is stripped in
  `toJSON`, so it never appears in a response.
- **Sessions.** The JWT is signed with `JWT_SECRET` and expires after 1 day. It also carries a
  `jti` that names a row in the `sessions` collection, and a token is accepted only while that row
  is live. That is what makes logout real, since a JWT on its own cannot be revoked. On every
  request, `SessionService.touch` checks "not revoked, not expired, not idle" and records the
  activity in a single atomic `findOneAndUpdate`. So a session that has gone idle can never be
  revived by the request that finds it idle. Changing the password revokes every other session.
  Expired rows are removed by a TTL index. The `jti` is never serialised.
- **Login** returns the same message, and takes the same time, whether the email is unknown or the
  password is wrong. Otherwise the endpoint tells anyone which emails are registered.
- **Group-level authorization** on every `/groups/:groupId` route (`GroupAccessMiddleware`): 404 if
  the group is missing or deleted, 403 if you are not in it. Expenses and settlements are looked up
  by id _and_ group, so an id from another group simply does not match.
- **Validation** with Zod on body, params (valid ObjectId) and query. Unknown fields are stripped,
  except on `PATCH /users/me`, which rejects them so a password sent there is not silently ignored.
- **helmet**, **CORS** limited to `CLIENT_URL`, **rate limit** on register, login and
  change-password, a 10kb JSON body limit, and `SanitizeMiddleware` stripping `$`/`.` keys from
  bodies (NoSQL injection).
- Search input is regex-escaped before it reaches MongoDB (no ReDoS, no pattern injection).
- 500s return a generic message. Details go only to the server log.

## Structure

```
src/
  app.ts                 Express wiring; server.ts is the only file that opens a port
  config/                every environment variable is read here and nowhere else
  routes/                paths and middleware chains only — no logic
  middleware/            AuthMiddleware, GroupAccessMiddleware, ValidationMiddleware,
                         RateLimitMiddleware, SanitizeMiddleware, ErrorMiddleware, LoggingMiddleware
  controllers/           *Controller — HTTP in, HTTP out; never import a Model
  services/              static *Service classes; throw ApiError, know nothing about Express
    split.service.ts       pure: split input -> kobo shares
    balance.service.ts     pure maths (computeNetBalances, simplifyDebts) + loaders
    session.service.ts     create / touch / revoke sessions; where the idle timeout is enforced
  models/                Mongoose schemas and indexes only
  validators/            *Schema classes of Zod schemas; service input types infer from them
  utils/                 ApiError, ResponseUtils, JwtUtils, PasswordUtils, MoneyUtils,
                         PaginationUtils, StringUtils, ValidationUtils, EnvUtils
  docs/openapi.ts        the spec served at /api/docs
  scripts/seed.ts        demo data
tests/                   Vitest + supertest + mongodb-memory-server
postman/                 the demo flow as a Postman collection
```

The layer chain is `routes → middleware → controllers → services → models → MongoDB`, and the
rules that keep it honest:

1. A controller never imports a Model, and never contains a business rule.
2. A service never sees `req` or `res`, and never picks a status code — it throws `ApiError`.
3. No `try/catch` in controllers. Express 5 forwards a rejected promise to the error handler, and
   `ErrorMiddleware.handle` is the single place that decides what an error looks like over HTTP.
4. Validation happens at the edge, so every layer below only ever sees clean data. Money rules
   (sums, percentages) live in `SplitService`, so they hold for the seed script and tests too.

Everything is a class of **static** members, and functions take a single object parameter typed
by an interface (`SplitService.computeShares({ amount, split })`), same as GAIM Financials.

A request to record an expense passes through:

```
POST /api/v1/groups/:groupId/expenses
  AuthMiddleware.authenticate          who are you, still live?  401
  validate(GroupSchema.params)         is :groupId an id?        400
  GroupAccessMiddleware.requireMember  are you in this group?    404 / 403
  validate(ExpenseSchema.create)       is the body well-formed?  400
  ExpenseController.create             reads req, sends res
    ExpenseService.create              the rules                 400
      SplitService.computeShares       the maths                 400
      ExpenseModel.create              the write
```

## Tests

```bash
pnpm test
```

89 tests. `split.test.ts` and `balance.test.ts` are pure unit tests of the money engine, including
property tests over 300 random groups: nets always sum to 0, and the settle-up plan always zeroes
everyone in at most `n − 1` transfers. The rest run over HTTP against an in-memory MongoDB. They
cover auth, sessions (logout, idle timeout, revoking a device, change-password), 401/403/404/409,
the member and admin rules, search and filters, and the full demo flow ending at zero.

The PRD's must-haves, and where they are:

| Must-have                                | Test                               |
| ---------------------------------------- | ---------------------------------- |
| 3-way equal split of ₦100 rounds right   | `split.test.ts`, `expense.test.ts` |
| Exact shares that don't sum are rejected | `split.test.ts`, `expense.test.ts` |
| Sum of nets in a group is 0              | `balance.test.ts`                  |
| Non-member gets 403                      | `group.test.ts`                    |
| Settlement brings balances to 0          | `settlement.test.ts`               |
| Deleting an expense restores balances    | `expense.test.ts`                  |

## Deployment (Render + Atlas)

- **Build command** `pnpm install && pnpm build`, **start command** `pnpm start`.
- **Health check path** `/api/v1/health`.
- **Environment:** `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN=1d`, `SESSION_IDLE_MINUTES=60`,
  `NODE_ENV=production`, `TRUST_PROXY=1` (Render adds one proxy), and `CLIENT_URL` set to the
  Vercel URL. Several origins can be comma-separated.
- **Atlas:** allow Render's outbound IPs (or `0.0.0.0/0` for the demo).
