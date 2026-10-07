import 'dotenv/config';

import { listEnv, numericEnv, requiredEnv } from '../utils/env';

const MINUTE_MS = 60_000;

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: numericEnv({ name: 'PORT', fallback: 5000 }),
  mongoUri: requiredEnv('MONGO_URI'),

  clientUrls: listEnv('CLIENT_URL', ['http://localhost:5173']),

  trustProxy: numericEnv({ name: 'TRUST_PROXY', fallback: 0 }),

  jwt: {
    secret: requiredEnv('JWT_SECRET'),
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '1d',
  },

  session: {
    idleMs:
      numericEnv({ name: 'SESSION_IDLE_MINUTES', fallback: 60 }) *
      MINUTE_MS,
  },

  security: {
    bcryptRounds: numericEnv({ name: 'BCRYPT_ROUNDS', fallback: 10 }),
  },

  rateLimit: {
    windowMs:
      numericEnv({ name: 'RATE_LIMIT_WINDOW_MINUTES', fallback: 15 }) *
      MINUTE_MS,
    auth: numericEnv({ name: 'RATE_LIMIT_AUTH', fallback: 20 }),
  },
} as const;

export const isProduction = config.env === 'production';
export const isDevelopment = config.env === 'development';
export const isTest = config.env === 'test';
