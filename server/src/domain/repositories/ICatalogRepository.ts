import type { CategoryCreateInput, CategoryKind, UnitKind } from '@gaby/shared';

/**
 * Puertos de catálogos (AD-03): el dominio define el contrato,
 * la infraestructura (Prisma) lo implementa. La lógica nunca importa Prisma.
 */

export interface UnitDTO {
  id: string;
  name: string;
  abbreviation: string;
  kind: UnitKind;
  factorToBase: number;
}

export interface CategoryDTO {
  id: string;
  kind: CategoryKind;
  name: string;
  isActive: boolean;
}

export interface SupplierDTO {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

export interface ICatalogRepository {
  listUnits(): Promise<UnitDTO[]>;
  listCategories(kind?: CategoryKind): Promise<CategoryDTO[]>;
  listSuppliers(): Promise<SupplierDTO[]>;

  /** Fase 18: CRUD de categorías (antes solo lectura — el cliente no podía crear dietas nuevas). */
  createCategory(input: CategoryCreateInput): Promise<CategoryDTO>;
  updateCategory(id: string, name: string): Promise<CategoryDTO>;
  setCategoryActive(id: string, isActive: boolean): Promise<void>;
}
