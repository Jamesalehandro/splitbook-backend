import { createApp } from './app';
import { config } from './config';
import { connectDatabase, disconnectDatabase } from './config/database';

async function bootstrap(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(
      `[server] listening on http://localhost:${config.port} (${config.env})`,
    );
    console.log(
      `[server] API docs at http://localhost:${config.port}/api/docs`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`\n[server] ${signal} received, shutting down`);

    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });

    // Don't hang forever if a connection refuses to close.
    setTimeout(() => {
      console.error('[server] forced shutdown after timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error: unknown) => {
  console.error('[server] failed to start:', error);
  process.exit(1);
});
