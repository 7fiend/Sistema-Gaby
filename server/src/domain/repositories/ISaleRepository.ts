import type { Paginated, SaleRecordInput, SalesQuery } from '@gaby/shared';

export interface SaleItemDetail {
  recipeId: string;
  recipeName: string;
  portions: number;
  unitPrice: number;
  total: number;
}

export interface SaleRecordDetail {
  id: string;
  date: Date;
  notes: string | null;
  registeredBy: string;
  totalPortions: number;
  totalAmount: number;
  items: SaleItemDetail[];
  createdAt: Date;
}

export interface ISaleRepository {
  list(query: SalesQuery): Promise<Paginated<SaleRecordDetail>>;
  /** Registro consolidado de un día exacto (o null si aún no se captura). */
  findByDate(date: Date): Promise<SaleRecordDetail | null>;
  /**
   * Crea el registro del día con sus items (total = porciones × precio,
   * calculado en servidor). CONFLICT si la fecha ya tiene registro. Atómico.
   */
  create(input: SaleRecordInput, userId: string): Promise<SaleRecordDetail>;
}
