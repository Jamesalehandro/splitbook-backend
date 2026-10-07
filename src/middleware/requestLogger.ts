import type { RequestHandler } from 'express';

import { isTest } from '../config';

export const requestLogger: RequestHandler = (req, res, next) => {
  if (isTest) return next();

  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${durationMs}ms`,
    );
  });

  next();
};
