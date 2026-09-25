import 'dotenv/config';

import { EnvUtils } from '../utils/env';

const MINUTE_MS = 60_000;

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: EnvUtils.numeric({ name: 'PORT', fallback: 5000 }),
  mongoUri: EnvUtils.required('MONGO_URI'),

  clientUrls: EnvUtils.list('CLIENT_URL', ['http://localhost:5173']),

  trustProxy: EnvUtils.numeric({ name: 'TRUST_PROXY', fallback: 0 }),

  jwt: {
    secret: EnvUtils.required('JWT_SECRET'),
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '1d',
  },

  session: {
    idleMs:
      EnvUtils.numeric({ name: 'SESSION_IDLE_MINUTES', fallback: 60 }) *
      MINUTE_MS,
  },

  security: {
    bcryptRounds: EnvUtils.numeric({ name: 'BCRYPT_ROUNDS', fallback: 10 }),
  },

  rateLimit: {
    windowMs:
      EnvUtils.numeric({ name: 'RATE_LIMIT_WINDOW_MINUTES', fallback: 15 }) *
      MINUTE_MS,
    auth: EnvUtils.numeric({ name: 'RATE_LIMIT_AUTH', fallback: 20 }),
  },
} as const;

export const isProduction = config.env === 'production';
export const isDevelopment = config.env === 'development';
export const isTest = config.env === 'test';
