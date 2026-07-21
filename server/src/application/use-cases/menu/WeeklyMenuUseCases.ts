import type { AuthUser, WeeklyMenuSlotSetInput } from '@gaby/shared';
import type { IWeeklyMenuRepository } from '../../../domain/repositories/IWeeklyMenuRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';

/** Fase 18: menú semanal (día×tiempo de comida×categoría) + "menú de hoy" con recomendación. */
export class WeeklyMenuUseCases {
  constructor(
    private readonly repo: IWeeklyMenuRepository,
    private readonly audit: IAuditLogger,
  ) {}

  listSlots() {
    return this.repo.listSlots();
  }

  async setSlot(input: WeeklyMenuSlotSetInput, user: AuthUser) {
    await this.repo.setSlot(input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'menu.set-slot',
      resource: 'menu',
      resourceId: `${input.dayOfWeek}:${input.mealTime}:${input.categoryId}`,
      after: input,
    });
  }

  getMenuForDate(date: Date) {
    return this.repo.getMenuForDate(date);
  }
}
