import { Router } from 'express';

import { search, summary, updateMe } from '../controllers/user.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { UserSchema } from '../validators/user.validator';

const router = Router();

router.use(authenticate);

router.patch(
  '/me',
  validate({ schema: UserSchema.updateMe }),
  updateMe,
);

router.get('/me/summary', summary);

router.get(
  '/search',
  validate({ schema: UserSchema.search, part: 'query' }),
  search,
);

export default router;
