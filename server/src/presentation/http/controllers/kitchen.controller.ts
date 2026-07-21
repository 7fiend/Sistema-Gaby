import type { Request, Response } from 'express';
import type { KitchenSummaryQuery } from '@gaby/shared';
import type { KitchenUseCases } from '../../../application/use-cases/kitchen/KitchenUseCases.js';
import { validatedQuery } from '../middleware/validate.js';

export class KitchenController {
  constructor(private readonly kitchen: KitchenUseCases) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const { date } = validatedQuery<KitchenSummaryQuery>(req);
    res.json({ data: await this.kitchen.summary(date) });
  };
}
