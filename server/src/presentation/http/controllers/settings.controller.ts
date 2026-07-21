import type { Request, Response } from 'express';
import type { SettingsUpdateInput } from '@gaby/shared';
import type { SettingsUseCases } from '../../../application/use-cases/settings/SettingsUseCases.js';
import { authUser } from '../middleware/auth.js';

export class SettingsController {
  constructor(private readonly settings: SettingsUseCases) {}

  get = async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.settings.get() });
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.settings.update(req.body as SettingsUpdateInput, authUser(req)) });
  };
}
