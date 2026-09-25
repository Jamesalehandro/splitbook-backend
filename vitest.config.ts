import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://127.0.0.1:27017/splitbook-test',
      TRUST_PROXY: '0',
      CLIENT_URL: 'http://localhost:5173',

      JWT_SECRET: 'test-secret-not-used-outside-vitest',
      JWT_EXPIRES_IN: '1d',
      SESSION_IDLE_MINUTES: '60',

      BCRYPT_ROUNDS: '4',

      RATE_LIMIT_AUTH: '100000',
    },
    isolate: true,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
