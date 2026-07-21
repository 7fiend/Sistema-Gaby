import type { Request, Response } from 'express';
import type {
  AdjustmentInput,
  EntryInput,
  MovementsQuery,
  ProductInput,
  ProductsQuery,
  RoutineConsumptionInput,
} from '@gaby/shared';
import type { InventoryUseCases } from '../../../application/use-cases/inventory/InventoryUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class InventoryController {
  constructor(private readonly inventory: InventoryUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.inventory.listProducts(validatedQuery<ProductsQuery>(req)) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.inventory.getProduct(req.params.id as string) });
  };

  movements = async (req: Request, res: Response): Promise<void> => {
    const q = validatedQuery<MovementsQuery>(req);
    res.json({
      data: await this.inventory.listMovements(req.params.id as string, q.page, q.pageSize),
    });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const product = await this.inventory.createProduct(req.body as ProductInput, authUser(req));
    res.status(201).json({ data: product });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.inventory.updateProduct(
        req.params.id as string,
        req.body as Partial<ProductInput>,
        authUser(req),
      ),
    });
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    await this.inventory.deactivateProduct(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };

  entry = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json({
      data: await this.inventory.registerEntry(req.body as EntryInput, authUser(req)),
    });
  };

  adjustment = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json({
      data: await this.inventory.registerAdjustment(req.body as AdjustmentInput, authUser(req)),
    });
  };

  routineConsumption = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json({
      data: await this.inventory.registerRoutineConsumption(
        req.body as RoutineConsumptionInput,
        authUser(req),
      ),
    });
  };
}
