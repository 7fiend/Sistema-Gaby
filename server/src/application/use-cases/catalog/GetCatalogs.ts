import type { CategoryKind } from '@gaby/shared';
import type {
  CategoryDTO,
  ICatalogRepository,
  SupplierDTO,
  UnitDTO,
} from '../../../domain/repositories/ICatalogRepository.js';

/** Caso de uso de lectura de catálogos base (unidades, categorías, proveedores). */
export class GetCatalogs {
  constructor(private readonly catalogRepo: ICatalogRepository) {}

  listUnits(): Promise<UnitDTO[]> {
    return this.catalogRepo.listUnits();
  }

  listCategories(kind?: CategoryKind): Promise<CategoryDTO[]> {
    return this.catalogRepo.listCategories(kind);
  }

  listSuppliers(): Promise<SupplierDTO[]> {
    return this.catalogRepo.listSuppliers();
  }
}
