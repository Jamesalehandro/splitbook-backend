import { Router } from 'express';

import {
  create,
  getOne,
  list,
  remove,
  update,
} from '../controllers/expense.controller';
import { validate } from '../middleware/validate';
import { ExpenseSchema } from '../validators/expense.validator';

const router = Router({ mergeParams: true });

const expenseParams = validate({
  schema: ExpenseSchema.params,
  part: 'params',
});

router.post(
  '/',
  validate({ schema: ExpenseSchema.create }),
  create,
);

router.get(
  '/',
  validate({ schema: ExpenseSchema.list, part: 'query' }),
  list,
);

router.get('/:expenseId', expenseParams, getOne);

router.patch(
  '/:expenseId',
  expenseParams,
  validate({ schema: ExpenseSchema.update }),
  update,
);

router.delete('/:expenseId', expenseParams, remove);

export default router;
