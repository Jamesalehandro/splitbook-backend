import { Router } from 'express';

import { ExpenseController } from '../controllers/expense.controller';
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
  ExpenseController.create,
);

router.get(
  '/',
  ValidationMiddleware.validate({ schema: ExpenseSchema.list, part: 'query' }),
  ExpenseController.list,
);

router.get('/:expenseId', expenseParams, ExpenseController.getOne);

router.patch(
  '/:expenseId',
  expenseParams,
  ValidationMiddleware.validate({ schema: ExpenseSchema.update }),
  ExpenseController.update,
);

router.delete('/:expenseId', expenseParams, ExpenseController.remove);

export default router;
