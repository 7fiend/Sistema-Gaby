import type { BackupsQuery, BackupStatus, BackupType, Paginated } from '@gaby/shared';

export interface BackupRow {
  id: string;
  filename: string;
  /** Bytes del archivo comprimido. Prisma lo guarda como BigInt; se convierte aquí porque nunca se acerca a Number.MAX_SAFE_INTEGER y JSON no serializa BigInt. */
  sizeBytes: number;
  type: BackupType;
  status: BackupStatus;
  error: string | null;
  createdById: string | null;
  createdBy: string | null;
  createdAt: Date;
}

export interface BackupCreateInput {
  filename: string;
  type: BackupType;
  createdById: string | null;
}

export interface BackupCompleteInput {
  sizeBytes: number;
}

/** Persistencia de metadatos de respaldos (RF-13.2). A diferencia de audit_logs/reports, SÍ admite UPDATE (estado) y DELETE (retención). */
export interface IBackupRepository {
  create(input: BackupCreateInput): Promise<BackupRow>;
  markCompleted(id: string, input: BackupCompleteInput): Promise<BackupRow>;
  markFailed(id: string, error: string): Promise<BackupRow>;
  list(query: BackupsQuery): Promise<Paginated<BackupRow>>;
  findById(id: string): Promise<BackupRow | null>;
  /** Completados más antiguos que los `keep` más recientes (para retención). */
  findOldestCompleted(keep: number): Promise<BackupRow[]>;
  delete(id: string): Promise<void>;
}
