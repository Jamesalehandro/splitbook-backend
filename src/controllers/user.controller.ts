import type { RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { UserService } from '../services/user.service';
import { ResponseUtils } from '../utils/response';
import type { SearchUserInput } from '../validators/user.validator';

export class UserController {
  /** PATCH /api/v1/users/me */
  static updateMe: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const updated = await UserService.updateMe({ user, input: req.body });

    ResponseUtils.success({
      res,
      data: { user: updated },
      message: 'Profile updated successfully',
    });
  };

  /** GET /api/v1/users/search?email= */
  static search: RequestHandler = async (req, res) => {
    AuthMiddleware.requireUser(req);
    const { email } = req.query as unknown as SearchUserInput;

    const user = await UserService.findByEmail(email);
    ResponseUtils.success({ res, data: { user } });
  };

  /** GET /api/v1/users/me/summary */
  static summary: RequestHandler = async (req, res) => {
    const user = AuthMiddleware.requireUser(req);
    const summary = await UserService.getSummary(user);

    ResponseUtils.success({ res, data: summary, message: 'Summary generated' });
  };
}
