import { z } from 'zod';
import { paginationSchema } from './common.js';
import { BACKUP_TYPES } from '../types/enums.js';

export const backupsQuerySchema = paginationSchema.extend({
  type: z.enum(BACKUP_TYPES).optional(),
});
export type BackupsQuery = z.infer<typeof backupsQuerySchema>;

/** Confirmación fuerte: el usuario debe escribir la palabra exacta antes de restaurar. */
export const RESTORE_CONFIRMATION_WORD = 'RESTAURAR';
export const backupRestoreSchema = z.object({
  confirmation: z.literal(RESTORE_CONFIRMATION_WORD, {
    errorMap: () => ({ message: `Escribe "${RESTORE_CONFIRMATION_WORD}" para confirmar` }),
  }),
});
export type BackupRestoreInput = z.infer<typeof backupRestoreSchema>;

export interface BackupRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  type: (typeof BACKUP_TYPES)[number];
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}
