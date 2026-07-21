import type { Request, Response } from 'express';
import type {
  RecipeCreateInput,
  RecipeReviseInput,
  RecipeUpdateInput,
  RecipesQuery,
} from '@gaby/shared';
import type { RecipeUseCases } from '../../../application/use-cases/recipes/RecipeUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class RecipesController {
  constructor(private readonly recipes: RecipeUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.recipes.list(validatedQuery<RecipesQuery>(req)) });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.recipes.get(req.params.id as string) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json({ data: await this.recipes.create(req.body as RecipeCreateInput, authUser(req)) });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.recipes.update(
        req.params.id as string,
        req.body as RecipeUpdateInput,
        authUser(req),
      ),
    });
  };

  revise = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.recipes.revise(
        req.params.id as string,
        req.body as RecipeReviseInput,
        authUser(req),
      ),
    });
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    await this.recipes.deactivate(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };
}
