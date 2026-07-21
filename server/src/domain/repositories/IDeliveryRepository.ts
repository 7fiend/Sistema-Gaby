import type { DeliveryRegisterInput, WeightSource } from '@gaby/shared';

export interface DeliveryRecord {
  id: string;
  quantity: number;
  source: WeightSource;
  withinTolerance: boolean;
  approved: boolean;
  createdAt: Date;
}

export interface DeliveryRegisterResult {
  delivery: DeliveryRecord;
  approved: boolean;
  withinTolerance: boolean;
  /** quantity − pendiente, con signo (negativo = faltan, positivo = sobran). */
  deltaKg: number;
  productId: string;
  productName: string;
  orderNumber: string;
}

export interface IDeliveryRepository {
  /**
   * Registra un intento de entrega (RF-05): SIEMPRE crea el registro
   * append-only (aprobado o bloqueado). Si aprueba, consume stock por FEFO,
   * crea el movimiento EXIT y actualiza requirement/orden dentro de la
   * misma transacción (RN-02/RN-04/RN-05).
   */
  register(
    orderId: string,
    requirementId: string,
    input: DeliveryRegisterInput,
    userId: string,
  ): Promise<DeliveryRegisterResult>;
}
