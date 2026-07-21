import { existsSync } from 'node:fs';
import { mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { AuthUser, BackupsQuery, BackupType, Paginated } from '@gaby/shared';
import type { BackupRow, IBackupRepository } from '../../../domain/repositories/IBackupRepository.js';
import { NotFoundError } from '../../../domain/errors/AppError.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { PgDumpBackupService } from '../../../infrastructure/backups/PgDumpBackupService.js';
import type { SettingsUseCases } from '../settings/SettingsUseCases.js';
import { env } from '../../../config/env.js';

function backupPath(filename: string): string {
  return path.resolve(env.BACKUPS_DIR, filename);
}

/** `sistema_gaby-2026-07-10T21-26-46.sql.gz` — ordenable y sin caracteres problemáticos en Windows. */
function filenameFor(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `sistema_gaby-${stamp}.sql.gz`;
}

/** Respaldos (RF-13.2): creación manual/programada, listado, descarga, restauración y retención. */
export class BackupUseCases {
  constructor(
    private readonly backups: IBackupRepository,
    private readonly service: PgDumpBackupService,
    private readonly settings: SettingsUseCases,
    private readonly audit: IAuditLogger,
  ) {}

  list(query: BackupsQuery): Promise<Paginated<BackupRow>> {
    return this.backups.list(query);
  }

  createManual(user: AuthUser): Promise<BackupRow> {
    return this.run('MANUAL', user.id);
  }

  createScheduled(): Promise<BackupRow> {
    return this.run('SCHEDULED', null);
  }

  private async run(type: BackupType, createdById: string | null): Promise<BackupRow> {
    await mkdir(env.BACKUPS_DIR, { recursive: true });
    const filename = filenameFor(new Date());
    const record = await this.backups.create({ filename, type, createdById });

    try {
      const { sizeBytes } = await this.service.dump(backupPath(filename));
      const completed = await this.backups.markCompleted(record.id, { sizeBytes });
      await this.audit.log({
        kind: 'SYSTEM',
        userId: createdById,
        action: 'backup.create',
        resource: 'backups',
        resourceId: record.id,
        after: { filename, type, sizeBytes },
      });
      await this.applyRetention();
      return completed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = await this.backups.markFailed(record.id, message);
      await this.audit.log({
        kind: 'ERROR',
        userId: createdById,
        action: 'backup.create.failed',
        resource: 'backups',
        resourceId: record.id,
        metadata: { error: message },
      });
      return failed;
    }
  }

  async restore(id: string, user: AuthUser): Promise<void> {
    const record = await this.backups.findById(id);
    if (!record || record.status !== 'COMPLETED' || !existsSync(backupPath(record.filename))) {
      throw new NotFoundError('Respaldo', id);
    }
    await this.service.restore(backupPath(record.filename));
    await this.audit.log({
      kind: 'SYSTEM',
      userId: user.id,
      action: 'backup.restore',
      resource: 'backups',
      resourceId: record.id,
      after: { filename: record.filename },
    });
  }

  async download(id: string): Promise<{ record: BackupRow; filePath: string }> {
    const record = await this.backups.findById(id);
    const filePath = record ? backupPath(record.filename) : '';
    if (!record || !existsSync(filePath)) {
      throw new NotFoundError('Respaldo', id);
    }
    return { record, filePath };
  }

  private async applyRetention(): Promise<void> {
    const { backupRetentionCount } = await this.settings.get();
    const stale = await this.backups.findOldestCompleted(backupRetentionCount);
    for (const b of stale) {
      await unlink(backupPath(b.filename)).catch(() => undefined);
      await this.backups.delete(b.id);
    }
  }
}
