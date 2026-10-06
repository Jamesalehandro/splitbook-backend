import { Router } from 'express';

import {
  changePassword,
  listSessions,
  login,
  logout,
  me,
  register,
  revokeSession,
} from '../controllers/auth.controller';
import { AuthMiddleware } from '../middleware/authenticate';
import { RateLimitMiddleware } from '../middleware/rateLimit';
import { ValidationMiddleware } from '../middleware/validate';
import { AuthSchema } from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate({ schema: AuthSchema.register }),
  register,
);

router.post(
  '/login',
  RateLimitMiddleware.auth,
  ValidationMiddleware.validate({ schema: AuthSchema.login }),
  login,
);

router.post('/logout', AuthMiddleware.authenticate, logout);
router.get('/me', AuthMiddleware.authenticate, me);

router.get(
  '/sessions',
  AuthMiddleware.authenticate,
  listSessions,
);
router.delete(
  '/sessions/:sessionId',
  AuthMiddleware.authenticate,
  ValidationMiddleware.validate({
    schema: AuthSchema.sessionParams,
    part: 'params',
  }),
  revokeSession,
);

router.post(
  '/change-password',
  RateLimitMiddleware.auth,
  AuthMiddleware.authenticate,
  ValidationMiddleware.validate({ schema: AuthSchema.changePassword }),
  changePassword,
);

export default router;
