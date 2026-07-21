import type { PrismaClient, Prisma } from '@prisma/client';
import type { AuditEntry, IAuditLogger } from '../../application/ports/IAuditLogger.js';
import { logger } from '../logging/logger.js';

export class PrismaAuditLogger implements IAuditLogger {
  constructor(private readonly db: PrismaClient) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          kind: entry.kind,
          userId: entry.userId ?? null,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          before: (entry.before as Prisma.InputJsonValue) ?? undefined,
          after: (entry.after as Prisma.InputJsonValue) ?? undefined,
          metadata: (entry.metadata as Prisma.InputJsonValue) ?? undefined,
        },
      });
    } catch (err) {
      // La auditoría nunca tumba la operación principal, pero el fallo
      // queda en el log del sistema para investigación.
      logger.error({ err, entry: entry.action }, 'Fallo al escribir auditoría');
    }
  }
}
