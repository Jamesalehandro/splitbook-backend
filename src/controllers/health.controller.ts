import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import { ResponseUtils } from '../utils/response';

export class HealthController {
  static health: RequestHandler = (_req, res) => {
    ResponseUtils.success({
      res,
      data: {
        uptime: process.uptime(),
        database:
          mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      },
      message: 'Service is up',
    });
  };
}
