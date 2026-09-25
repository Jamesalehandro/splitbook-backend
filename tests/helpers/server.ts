import type { Server } from 'node:http';
import { createApp } from '../../src/app';

export function startTestServer(): Server {
  return createApp().listen(0);
}

export function stopTestServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
