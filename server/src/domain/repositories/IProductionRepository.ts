import type {
  KitchenSummary,
  Paginated,
  ProductionCreateInput,
  ProductionQuery,
  ProductionStatus,
  RequirementStatus,
} from '@gaby/shared';

export interface ProductionListItem {
  id: string;
  orderNumber: string;
  date: Date;
  status: ProductionStatus;
  notes: string | null;
  createdBy: string;
  recipesCount: number;
  totalPortions: number;
  /** Suma de snapshots de costo de los items (0 mientras es borrador). */
  totalCostSnapshot: number;
  confirmedAt: Date | null;
  createdAt: Date;
}

export interface ProductionOrderItemDetail {
  id: string;
  recipeId: string;
  recipeName: string;
  versionNumber: number;
  portions: number;
  costPerPortionSnapshot: number;
  totalCostSnapshot: number;
}

export interface RequirementDetail {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  unitAbbreviation: string;
  /** false → entrega por conteo (RF-05.6), sin panel de báscula. */
  isWeighable: boolean;
  requiredQuantity: number;
  deliveredQuantity: number;
  status: RequirementStatus;
  toleranceApplied: number;
}

export interface ProductionDetail extends ProductionListItem {
  items: ProductionOrderItemDetail[];
  requirements: RequirementDetail[];
}

/** Línea de disponibilidad: requerido vs stock actual (RF-04.3). */
export interface AvailabilityLine {
  productId: string;
  productName: string;
  productCode: string;
  unitAbbreviation: string;
  required: number;
  available: number;
  /** max(0, required − available) — 0 si alcanza. */
  missing: number;
}

export interface IProductionRepository {
  list(query: ProductionQuery): Promise<Paginated<ProductionListItem>>;
  findById(id: string): Promise<ProductionDetail | null>;

  /**
   * Crea la orden en DRAFT con orderNumber secuencial ("OP-2026-####") y
   * los items apuntando a la versión VIGENTE de cada receta. Atómico.
   */
  create(input: ProductionCreateInput, userId: string): Promise<ProductionDetail>;

  /**
   * Explosión de disponibilidad SIN mutar: en DRAFT calcula la explosión
   * estimada con las versiones vigentes; ya confirmada compara lo pendiente
   * de los requirements contra el stock actual.
   */
  availability(id: string): Promise<AvailabilityLine[]>;

  /**
   * DRAFT→CONFIRMED en una transacción (RN-03/RN-04): re-resuelve versiones
   * vigentes, congela snapshots de costo por item, materializa la explosión
   * consolidada en production_requirements (unidad base, tolerancia congelada
   * — override del producto o la global) y devuelve los faltantes detectados.
   */
  confirm(
    id: string,
    defaultToleranceKg: number,
  ): Promise<{ order: ProductionDetail; shortages: AvailabilityLine[] }>;

  /**
   * Transición validada con PRODUCTION_TRANSITIONS (INVALID_TRANSITION si no
   * aplica). CANCELLED exige que la orden no tenga entregas registradas.
   */
  transition(id: string, to: ProductionStatus): Promise<ProductionDetail>;

  /**
   * Agregado por receta de las órdenes activas de un día (monitor de cocina,
   * RF-11): porciones totales, % de entrega aproximado (ver docs/11) e
   * ingredientes ya escalados a esas porciones con la versión vigente.
   */
  kitchenSummary(date: Date): Promise<KitchenSummary>;
}
