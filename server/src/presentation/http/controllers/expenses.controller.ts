import type { Request, Response } from 'express';
import type { ExpenseInput, ExpensesQuery } from '@gaby/shared';
import type { ExpenseUseCases } from '../../../application/use-cases/expenses/ExpenseUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class ExpensesController {
  constructor(private readonly expenses: ExpenseUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.expenses.list(validatedQuery<ExpensesQuery>(req)) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const expense = await this.expenses.create(req.body as ExpenseInput, authUser(req));
    res.status(201).json({ data: expense });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.expenses.update(
        req.params.id as string,
        req.body as Partial<ExpenseInput>,
        authUser(req),
      ),
    });
  };
}
