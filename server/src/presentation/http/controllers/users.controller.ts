import type { Request, Response } from 'express';
import type {
  UserCreateInput,
  UserResetPasswordInput,
  UserUpdateInput,
  UsersQuery,
} from '@gaby/shared';
import type { UserUseCases } from '../../../application/use-cases/users/UserUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class UsersController {
  constructor(private readonly users: UserUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.users.list(validatedQuery<UsersQuery>(req)) });
  };

  roles = async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.users.roles() });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const user = await this.users.create(req.body as UserCreateInput, authUser(req));
    res.status(201).json({ data: user });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.users.update(req.params.id as string, req.body as UserUpdateInput, authUser(req)),
    });
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    await this.users.deactivate(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    await this.users.resetPassword(
      req.params.id as string,
      req.body as UserResetPasswordInput,
      authUser(req),
    );
    res.json({ data: { ok: true } });
  };
}
