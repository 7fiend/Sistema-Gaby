import type {
  AdjustmentInput,
  EntryInput,
  Paginated,
  ProductInput,
  ProductUsageType,
  ProductsQuery,
} from '@gaby/shared';

export interface ProductListItem {
  id: string;
  code: string;
  name: string;
  category: { id: string; name: string };
  unit: { id: string; abbreviation: string };
  supplier: { id: string; name: string } | null;
  currentStock: number;
  minStock: number;
  avgCost: number;
  lastCost: number;
  location: string | null;
  isWeighable: boolean;
  toleranceKg: number | null;
  usageType: ProductUsageType;
  isActive: boolean;
}

export interface BatchItem {
  id: string;
  batchNumber: string;
  initialQuantity: number;
  remainingQuantity: number;
  unitCost: number;
  expiryDate: Date | null;
  receivedAt: Date;
}

export interface MovementItem {
  id: string;
  type: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  balanceAfter: number;
  reason: string | null;
  reference: string | null;
  batchNumber: string | null;
  userName: string;
  createdAt: Date;
}

/** Lote próximo a vencer (cron de alertas stock_expiring — entrega 9c). */
export interface ExpiringBatch {
  batchId: string;
  batchNumber: string;
  productId: string;
  productName: string;
  remainingQuantity: number;
  unitAbbreviation: string;
  expiryDate: Date;
}

export interface StockChangeResult {
  movementId: string;
  newStock: number;
  newAvgCost: number;
  /** true si el stock cruzó el mínimo hacia abajo con esta operación. */
  crossedLowStock: boolean;
}

export interface IProductRepository {
  list(query: ProductsQuery): Promise<Paginated<ProductListItem>>;
  findById(id: string): Promise<ProductListItem | null>;
  findBatches(productId: string): Promise<BatchItem[]>;
  listMovements(productId: string, page: number, pageSize: number): Promise<Paginated<MovementItem>>;
  create(input: ProductInput, initialCost?: number): Promise<ProductListItem>;
  update(id: string, input: Partial<ProductInput>): Promise<ProductListItem>;
  setActive(id: string, isActive: boolean): Promise<void>;

  /**
   * Entrada (compra): transacción atómica que crea lote, movimiento ENTRY con
   * saldo resultante, y actualiza stock + costo promedio ponderado (leído y
   * calculado DENTRO de la transacción — sin carreras).
   */
  registerEntry(input: EntryInput, userId: string): Promise<StockChangeResult>;

  /**
   * Ajuste: ADJUSTMENT_IN suma sin tocar el costo promedio; los tipos de
   * salida (merma/pérdida/vencimiento/ajuste−) consumen lotes por FEFO y
   * validan stock suficiente dentro de la transacción.
   */
  registerAdjustment(input: AdjustmentInput, userId: string): Promise<StockChangeResult>;

  /** Lotes activos con existencias cuyo vencimiento es ≤ `before` (usa el índice productId+expiryDate). */
  findExpiringBatches(before: Date): Promise<ExpiringBatch[]>;
}
