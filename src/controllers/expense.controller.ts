import type { RequestHandler } from 'express';

import { AuthMiddleware } from '../middleware/authenticate';
import { GroupAccessMiddleware } from '../middleware/groupAccess';
import { ExpenseService } from '../services/expense.service';
import { ResponseUtils } from '../utils/response';
import type { ExpenseParams, ListExpensesInput } from '../validators/expense.validator';

/** POST /api/v1/groups/:groupId/expenses */
export const create: RequestHandler = async (req, res) => {
  const user = AuthMiddleware.requireUser(req);
  const { group } = GroupAccessMiddleware.requireGroup(req);

  const expense = await ExpenseService.create({ group, user, input: req.body });
  ResponseUtils.created({ res, data: { expense }, message: 'Expense created successfully' });
};

/** GET /api/v1/groups/:groupId/expenses?search=&category=&paidBy=&from=&to=&page=&limit= */
export const list: RequestHandler = async (req, res) => {
  const { group } = GroupAccessMiddleware.requireGroup(req);
  const query = req.query as unknown as ListExpensesInput;

  const { items, meta } = await ExpenseService.list({ group, query });
  ResponseUtils.success({ res, data: items, meta });
};

/** GET /api/v1/groups/:groupId/expenses/:expenseId */
export const getOne: RequestHandler = async (req, res) => {
  const { group } = GroupAccessMiddleware.requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  const expense = await ExpenseService.getOne({ group, expenseId });
  ResponseUtils.success({ res, data: { expense } });
};

/** PATCH /api/v1/groups/:groupId/expenses/:expenseId */
export const update: RequestHandler = async (req, res) => {
  const user = AuthMiddleware.requireUser(req);
  const { group, membership } = GroupAccessMiddleware.requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  const expense = await ExpenseService.update({
    group,
    user,
    membership,
    expenseId,
    input: req.body,
  });
  ResponseUtils.success({ res, data: { expense }, message: 'Expense updated successfully' });
};

/** DELETE /api/v1/groups/:groupId/expenses/:expenseId */
export const remove: RequestHandler = async (req, res) => {
  const user = AuthMiddleware.requireUser(req);
  const { group, membership } = GroupAccessMiddleware.requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  await ExpenseService.remove({ group, user, membership, expenseId });
  ResponseUtils.success({ res, message: 'Expense deleted successfully' });
};
