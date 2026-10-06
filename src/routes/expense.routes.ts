import { Router } from 'express';

import {
  create,
  getOne,
  list,
  remove,
  update,
} from '../controllers/expense.controller';
import { ValidationMiddleware } from '../middleware/validate';
import { ExpenseSchema } from '../validators/expense.validator';

const router = Router({ mergeParams: true });

const expenseParams = ValidationMiddleware.validate({
  schema: ExpenseSchema.params,
  part: 'params',
});

router.post(
  '/',
  ValidationMiddleware.validate({ schema: ExpenseSchema.create }),
  create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: ExpenseSchema.list, part: 'query' }),
  list,
);

router.get('/:expenseId', expenseParams, getOne);

router.patch(
  '/:expenseId',
  expenseParams,
  ValidationMiddleware.validate({ schema: ExpenseSchema.update }),
  update,
);

router.delete('/:expenseId', expenseParams, remove);

export default router;
