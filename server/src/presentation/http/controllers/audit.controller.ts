import type { Request, Response } from 'express';
import type { AuditQuery } from '@gaby/shared';
import type { AuditUseCases } from '../../../application/use-cases/audit/AuditUseCases.js';
import { validatedQuery } from '../middleware/validate.js';

export class AuditController {
  constructor(private readonly audit: AuditUseCases) {}

  list = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.audit.list(validatedQuery<AuditQuery>(req)) });
  };
}
