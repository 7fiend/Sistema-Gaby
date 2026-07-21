import type { Request, Response } from 'express';
import type { AlertsQuery, DashboardQuery } from '@gaby/shared';
import type { DashboardUseCases } from '../../../application/use-cases/dashboard/DashboardUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class DashboardController {
  constructor(private readonly dashboard: DashboardUseCases) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const { date } = validatedQuery<DashboardQuery>(req);
    res.json({ data: await this.dashboard.summary(date) });
  };

  alerts = async (req: Request, res: Response): Promise<void> => {
    const { limit } = validatedQuery<AlertsQuery>(req);
    res.json({ data: await this.dashboard.listAlerts(limit) });
  };

  markAlertRead = async (req: Request, res: Response): Promise<void> => {
    await this.dashboard.markAlertRead(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };
}
