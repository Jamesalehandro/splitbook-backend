import { Router } from 'express';

import { search, summary, updateMe } from '../controllers/user.controller';
import { AuthMiddleware } from '../middleware/authenticate';
import { ValidationMiddleware } from '../middleware/validate';
import { UserSchema } from '../validators/user.validator';

const router = Router();

router.use(AuthMiddleware.authenticate);

router.patch(
  '/me',
  ValidationMiddleware.validate({ schema: UserSchema.updateMe }),
  updateMe,
);

router.get('/me/summary', summary);

router.get(
  '/search',
  ValidationMiddleware.validate({ schema: UserSchema.search, part: 'query' }),
  search,
);

export default router;
