import type { Request, Response } from 'express';
import { z } from 'zod';
import type { SaleRecordInput, SalesQuery } from '@gaby/shared';
import type { SalesUseCases } from '../../../application/use-cases/sales/SalesUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

/** GET /sales/day?date=YYYY-MM-DD — registro puntual de un día. */
export const saleDayQuerySchema = z.object({ date: z.coerce.date() });

export class SalesController {
  constructor(private readonly sales: SalesUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.sales.list(validatedQuery<SalesQuery>(req)) });
  };

  getDay = async (req: Request, res: Response): Promise<void> => {
    const { date } = validatedQuery<{ date: Date }>(req);
    res.json({ data: await this.sales.getByDate(date) });
  };

  register = async (req: Request, res: Response): Promise<void> => {
    const record = await this.sales.register(req.body as SaleRecordInput, authUser(req));
    res.status(201).json({ data: record });
  };
}
