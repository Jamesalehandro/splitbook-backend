import mongoose from 'mongoose';
import { config } from './index';

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('error', (error) => {
    console.error('[db] connection error:', error);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] disconnected');
  });

  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: 5_000,
  });

  console.log('[db] connected');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log('[db] disconnected');
}
