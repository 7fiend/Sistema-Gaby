import type { Request, Response } from 'express';
import path from 'node:path';
import type { BackupsQuery } from '@gaby/shared';
import type { BackupUseCases } from '../../../application/use-cases/backups/BackupUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class BackupsController {
  constructor(private readonly backups: BackupUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.backups.list(validatedQuery<BackupsQuery>(req)) });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json({ data: await this.backups.createManual(authUser(req)) });
  };

  // La confirmación fuerte del body ya la validó Zod (backupRestoreSchema) en la ruta.
  restore = async (req: Request, res: Response): Promise<void> => {
    await this.backups.restore(req.params.id as string, authUser(req));
    res.json({ data: { restored: true } });
  };

  download = async (req: Request, res: Response): Promise<void> => {
    const { filePath } = await this.backups.download(req.params.id as string);
    res.setHeader('Content-Type', 'application/gzip');
    res.download(filePath, path.basename(filePath));
  };
}
