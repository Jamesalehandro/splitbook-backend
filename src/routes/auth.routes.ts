import { Router } from 'express';

import { AuthController } from '../controllers/auth.controller';
import { AuthMiddleware } from '../middleware/authenticate';
import { RateLimitMiddleware } from '../middleware/rateLimit';
import { ValidationMiddleware } from '../middleware/validate';
import { AuthSchema } from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate({ schema: AuthSchema.register }),
  AuthController.register,
);

router.post(
  '/login',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate({ schema: AuthSchema.login }),
  AuthController.login,
);

router.post('/logout', AuthMiddleware.authenticate, AuthController.logout);
router.get('/me', AuthMiddleware.authenticate, AuthController.me);

router.get(
  '/sessions',
  AuthMiddleware.authenticate,
  AuthController.listSessions,
);
router.delete(
  '/sessions/:sessionId',
  AuthMiddleware.authenticate,
  ValidationMiddleware.validate({
    schema: AuthSchema.sessionParams,
    part: 'params',
  }),
  AuthController.revokeSession,
);

router.post(
  '/change-password',
  RateLimitMiddleware.auth,
  AuthMiddleware.authenticate,
  ValidationMiddleware.validate({ schema: AuthSchema.changePassword }),
  AuthController.changePassword,
);

export default router;
