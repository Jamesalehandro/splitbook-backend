import type { RequestHandler } from 'express';

import { requireUser } from '../middleware/authenticate';
import { requireGroup } from '../middleware/groupAccess';
import { ExpenseService } from '../services/expense.service';
import { created, success } from '../utils/response';
import type { ExpenseParams, ListExpensesInput } from '../validators/expense.validator';

/** POST /api/v1/groups/:groupId/expenses */
export const create: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { group } = requireGroup(req);

  const expense = await ExpenseService.create({ group, user, input: req.body });
  created({ res, data: { expense }, message: 'Expense created successfully' });
};

/** GET /api/v1/groups/:groupId/expenses?search=&category=&paidBy=&from=&to=&page=&limit= */
export const list: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const query = req.query as unknown as ListExpensesInput;

  const { items, meta } = await ExpenseService.list({ group, query });
  success({ res, data: items, meta });
};

/** GET /api/v1/groups/:groupId/expenses/:expenseId */
export const getOne: RequestHandler = async (req, res) => {
  const { group } = requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  const expense = await ExpenseService.getOne({ group, expenseId });
  success({ res, data: { expense } });
};

/** PATCH /api/v1/groups/:groupId/expenses/:expenseId */
export const update: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { group, membership } = requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  const expense = await ExpenseService.update({
    group,
    user,
    membership,
    expenseId,
    input: req.body,
  });
  success({ res, data: { expense }, message: 'Expense updated successfully' });
};

/** DELETE /api/v1/groups/:groupId/expenses/:expenseId */
export const remove: RequestHandler = async (req, res) => {
  const user = requireUser(req);
  const { group, membership } = requireGroup(req);
  const { expenseId } = req.params as unknown as ExpenseParams;

  await ExpenseService.remove({ group, user, membership, expenseId });
  success({ res, message: 'Expense deleted successfully' });
};
