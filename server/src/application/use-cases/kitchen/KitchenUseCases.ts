import type { IProductionRepository } from '../../../domain/repositories/IProductionRepository.js';

/** Caso de uso de solo lectura para el monitor de cocina (RF-11). */
export class KitchenUseCases {
  constructor(private readonly orders: IProductionRepository) {}

  summary(date?: Date) {
    return this.orders.kitchenSummary(date ?? new Date());
  }
}
