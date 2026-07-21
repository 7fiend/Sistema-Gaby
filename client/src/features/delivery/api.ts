import type { DeliveryRegisterInput, WeightSource } from '@gaby/shared';
import { api } from '@/lib/api';
import { productionApi, type ProductionOrder, type ProductionOrderDetail } from '@/features/production/api';

export interface DeliveryRecord {
  id: string;
  quantity: number;
  source: WeightSource;
  withinTolerance: boolean;
  approved: boolean;
  createdAt: string;
}

export interface DeliveryRegisterResponse {
  order: ProductionOrderDetail;
  delivery: DeliveryRecord;
  approved: boolean;
  withinTolerance: boolean;
  deltaKg: number;
}

export const deliveryApi = {
  /** Órdenes con entregas pendientes: confirmadas o ya en proceso de entrega. */
  listActive: async (): Promise<ProductionOrder[]> => {
    const [confirmed, inDelivery] = await Promise.all([
      productionApi.list({ page: 1, status: 'CONFIRMED' }),
      productionApi.list({ page: 1, status: 'IN_DELIVERY' }),
    ]);
    return [...confirmed.items, ...inDelivery.items];
  },
  register: (orderId: string, requirementId: string, input: DeliveryRegisterInput) =>
    api.post<DeliveryRegisterResponse>(
      `/production/${orderId}/requirements/${requirementId}/deliveries`,
      input,
    ),
};
