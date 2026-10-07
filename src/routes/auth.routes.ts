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
import { authenticate } from '../middleware/authenticate';
import { authRateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { AuthSchema } from '../validators/auth.validator';

const router = Router();

router.post(
  '/register',
  authRateLimit,
  validate({ schema: AuthSchema.register }),
  register,
);

router.post(
  '/login',
  authRateLimit,
  validate({ schema: AuthSchema.login }),
  login,
);

router.post('/logout', authenticate, logout);
router.get('/me', authenticate, me);

router.get(
  '/sessions',
  authenticate,
  listSessions,
);
router.delete(
  '/sessions/:sessionId',
  authenticate,
  validate({
    schema: AuthSchema.sessionParams,
    part: 'params',
  }),
  revokeSession,
);

router.post(
  '/change-password',
  authRateLimit,
  authenticate,
  validate({ schema: AuthSchema.changePassword }),
  changePassword,
);

export default router;
