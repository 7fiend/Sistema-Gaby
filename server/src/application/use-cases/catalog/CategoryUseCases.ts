import type { AuthUser, CategoryCreateInput, CategoryUpdateInput } from '@gaby/shared';
import type { ICatalogRepository } from '../../../domain/repositories/ICatalogRepository.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';

/** Fase 18: mutaciones de categorías (separado de GetCatalogs, que es solo lectura). */
export class CategoryUseCases {
  constructor(
    private readonly catalogRepo: ICatalogRepository,
    private readonly audit: IAuditLogger,
  ) {}

  async create(input: CategoryCreateInput, user: AuthUser) {
    const category = await this.catalogRepo.createCategory(input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'category.create',
      resource: 'categories',
      resourceId: category.id,
      after: input,
    });
    return category;
  }

  async update(id: string, input: CategoryUpdateInput, user: AuthUser) {
    const category = await this.catalogRepo.updateCategory(id, input.name);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'category.update',
      resource: 'categories',
      resourceId: id,
      after: input,
    });
    return category;
  }

  async deactivate(id: string, user: AuthUser) {
    await this.catalogRepo.setCategoryActive(id, false);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'category.deactivate',
      resource: 'categories',
      resourceId: id,
    });
  }
}
