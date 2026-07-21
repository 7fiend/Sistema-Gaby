import type { Request, Response } from 'express';
import { z } from 'zod';
import { CATEGORY_KINDS, type CategoryCreateInput, type CategoryUpdateInput } from '@gaby/shared';
import type { GetCatalogs } from '../../../application/use-cases/catalog/GetCatalogs.js';
import type { CategoryUseCases } from '../../../application/use-cases/catalog/CategoryUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export const categoriesQuerySchema = z.object({
  kind: z.enum(CATEGORY_KINDS).optional(),
});

/** Controllers delgados: parsean → caso de uso → envelope { data } (AD-03). */
export class CatalogController {
  constructor(
    private readonly getCatalogs: GetCatalogs,
    private readonly categoryUseCases: CategoryUseCases,
  ) {}

  units = async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.getCatalogs.listUnits() });
  };

  categories = async (req: Request, res: Response): Promise<void> => {
    const { kind } = validatedQuery<z.infer<typeof categoriesQuerySchema>>(req);
    res.json({ data: await this.getCatalogs.listCategories(kind) });
  };

  suppliers = async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.getCatalogs.listSuppliers() });
  };

  createCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryUseCases.create(req.body as CategoryCreateInput, authUser(req));
    res.status(201).json({ data: category });
  };

  updateCategory = async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryUseCases.update(
      req.params.id as string,
      req.body as CategoryUpdateInput,
      authUser(req),
    );
    res.json({ data: category });
  };

  deactivateCategory = async (req: Request, res: Response): Promise<void> => {
    await this.categoryUseCases.deactivate(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };
}
