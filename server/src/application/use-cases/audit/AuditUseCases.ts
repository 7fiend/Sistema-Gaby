import type { AuditQuery, Paginated } from '@gaby/shared';
import type { AuditLogRow, IAuditRepository } from '../../../domain/repositories/IAuditRepository.js';

/** Caso de uso de lectura de la bitácora (RF-13.1). */
export class AuditUseCases {
  constructor(private readonly audit: IAuditRepository) {}

  list(query: AuditQuery): Promise<Paginated<AuditLogRow>> {
    return this.audit.list(query);
  }
}
