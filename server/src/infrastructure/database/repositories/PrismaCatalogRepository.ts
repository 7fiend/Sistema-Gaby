import type { PrismaClient } from '@prisma/client';
import type { CategoryCreateInput, CategoryKind } from '@gaby/shared';
import type {
  CategoryDTO,
  ICatalogRepository,
  SupplierDTO,
  UnitDTO,
} from '../../../domain/repositories/ICatalogRepository.js';

export class PrismaCatalogRepository implements ICatalogRepository {
  constructor(private readonly db: PrismaClient) {}

  async listUnits(): Promise<UnitDTO[]> {
    const units = await this.db.unit.findMany({ orderBy: { name: 'asc' } });
    return units.map((u) => ({
      id: u.id,
      name: u.name,
      abbreviation: u.abbreviation,
      kind: u.kind as UnitDTO['kind'],
      factorToBase: u.factorToBase.toNumber(),
    }));
  }

  async listCategories(kind?: CategoryKind): Promise<CategoryDTO[]> {
    const categories = await this.db.category.findMany({
      where: { isActive: true, ...(kind && { kind }) },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
    return categories.map((c) => ({
      id: c.id,
      kind: c.kind as CategoryDTO['kind'],
      name: c.name,
      isActive: c.isActive,
    }));
  }

  async createCategory(input: CategoryCreateInput): Promise<CategoryDTO> {
    const c = await this.db.category.create({ data: { kind: input.kind, name: input.name } });
    return { id: c.id, kind: c.kind as CategoryDTO['kind'], name: c.name, isActive: c.isActive };
  }

  async updateCategory(id: string, name: string): Promise<CategoryDTO> {
    const c = await this.db.category.update({ where: { id }, data: { name } });
    return { id: c.id, kind: c.kind as CategoryDTO['kind'], name: c.name, isActive: c.isActive };
  }

  async setCategoryActive(id: string, isActive: boolean): Promise<void> {
    await this.db.category.update({ where: { id }, data: { isActive } });
  }

  async listSuppliers(): Promise<SupplierDTO[]> {
    const suppliers = await this.db.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      contact: s.contact,
      phone: s.phone,
      email: s.email,
      isActive: s.isActive,
    }));
  }
}
