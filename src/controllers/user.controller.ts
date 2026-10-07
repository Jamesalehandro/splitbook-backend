import type { RequestHandler } from 'express';

import { requireUser } from '../middleware/authenticate';
import { UserService } from '../services/user.service';
import { success } from '../utils/response';
import type { SearchUserInput } from '../validators/user.validator';

/** PATCH /api/v1/users/me */
export const updateMe: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const updated = await UserService.updateMe({ user, input: req.body });

  success({
    res,
    data: { user: updated },
    message: 'Profile updated successfully',
  });
};

/** GET /api/v1/users/search?email= */
export const search: RequestHandler = async (req, res) => {
  requireUser(req);
  const { email } = req.query as unknown as SearchUserInput;

  const user = await UserService.findByEmail(email);
  success({ res, data: { user } });
};

/** GET /api/v1/users/me/summary */
export const summary: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const result = await UserService.getSummary(user);

  success({ res, data: result, message: 'Summary generated' });
};
