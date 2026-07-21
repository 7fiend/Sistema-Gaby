import type { Request, Response } from 'express';
import type { MenuForDateQuery, WeeklyMenuSlotSetInput } from '@gaby/shared';
import type { WeeklyMenuUseCases } from '../../../application/use-cases/menu/WeeklyMenuUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

export class WeeklyMenuController {
  constructor(private readonly menu: WeeklyMenuUseCases) {}

  listSlots = async (_req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.menu.listSlots() });
  };

  setSlot = async (req: Request, res: Response): Promise<void> => {
    await this.menu.setSlot(req.body as WeeklyMenuSlotSetInput, authUser(req));
    res.json({ data: { ok: true } });
  };

  today = async (req: Request, res: Response): Promise<void> => {
    const { date } = validatedQuery<MenuForDateQuery>(req);
    res.json({ data: await this.menu.getMenuForDate(date) });
  };
}
