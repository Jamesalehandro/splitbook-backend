import type { RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { UserService } from '../services/user.service';
import { ResponseUtils } from '../utils/response';
import type { SearchUserInput } from '../validators/user.validator';

/** PATCH /api/v1/users/me */
export const updateMe: RequestHandler = async (req, res) => {
  const user = AuthMiddleware.requireUser(req);
  const updated = await UserService.updateMe({ user, input: req.body });

  ResponseUtils.success({
    res,
    data: { user: updated },
    message: 'Profile updated successfully',
  });
};

/** GET /api/v1/users/search?email= */
export const search: RequestHandler = async (req, res) => {
  AuthMiddleware.requireUser(req);
  const { email } = req.query as unknown as SearchUserInput;

  const user = await UserService.findByEmail(email);
  ResponseUtils.success({ res, data: { user } });
};

/** GET /api/v1/users/me/summary */
export const summary: RequestHandler = async (req, res) => {
  const user = AuthMiddleware.requireUser(req);
  const result = await UserService.getSummary(user);

  ResponseUtils.success({ res, data: result, message: 'Summary generated' });
};
