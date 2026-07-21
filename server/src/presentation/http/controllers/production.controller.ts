import type { Request, Response } from 'express';
import type { ProductionCreateInput, ProductionQuery } from '@gaby/shared';
import type { ProductionUseCases } from '../../../application/use-cases/production/ProductionUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class ProductionController {
  constructor(private readonly production: ProductionUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.production.list(validatedQuery<ProductionQuery>(req)) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.production.get(req.params.id as string) });
  };

  availability = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.production.availability(req.params.id as string) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const order = await this.production.create(req.body as ProductionCreateInput, authUser(req));
    res.status(201).json({ data: order });
  };

  confirm = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.production.confirm(req.params.id as string, authUser(req)) });
  };

  cancel = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.production.transition(req.params.id as string, 'CANCELLED', authUser(req)),
    });
  };

  close = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.production.transition(req.params.id as string, 'CLOSED', authUser(req)),
    });
  };

  start = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.production.transition(req.params.id as string, 'IN_PREPARATION', authUser(req)),
    });
  };

  complete = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.production.transition(req.params.id as string, 'COMPLETED', authUser(req)),
    });
  };
}
