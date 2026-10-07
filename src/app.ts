import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { config } from './config';
import { openApiDocument } from './docs/openapi';
import { handleError, notFound } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { sanitizeMongo } from './middleware/sanitize';
import routes from './routes/index';

export function createApp(): Express {
  const app = express();

  /**
   * How many reverse proxies sit in front of us, as a COUNT. Render adds one.
   * Without it every request appears to come from the proxy's IP, and the auth
   * rate limit would be shared by every user on the internet.
   */
  if (config.trustProxy > 0) {
    app.set('trust proxy', config.trustProxy);
  }

  // 1. Security + parsing
  app.use(helmet());
  app.use(
    cors({
      origin: [...config.clientUrls],
    }),
  );
  app.use(express.json({ limit: '10kb' }));
  app.use(sanitizeMongo);

  app.use(requestLogger);

  app.use(
    '/api/docs',
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, { customSiteTitle: 'SplitBook API' }),
  );

  app.use('/api/v1', routes);

  app.use(notFound);

  app.use(handleError);

  return app;
}
