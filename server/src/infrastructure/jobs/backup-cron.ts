import cron from 'node-cron';
import type { BackupUseCases } from '../../application/use-cases/backups/BackupUseCases.js';
import { logger } from '../logging/logger.js';

/**
 * Respaldo programado (`backup.schedule` en Configuración, RF-13.2). El
 * horario se lee una sola vez al arrancar el servidor — a diferencia del
 * cron de vencimientos, aquí NO conviene correr uno al arranque: en
 * desarrollo `tsx watch` reinicia el proceso en cada guardado y dispararía
 * un respaldo por cada cambio de archivo. Cambiar el horario en Configuración
 * aplica después de reiniciar el servidor.
 */
export function startBackupCron(job: BackupUseCases, schedule: string): void {
  if (!cron.validate(schedule)) {
    logger.error({ schedule }, 'Horario de respaldo inválido (backup.schedule) — cron no programado');
    return;
  }
  cron.schedule(
    schedule,
    () => {
      void job.createScheduled().then(
        (b) => {
          if (b.status === 'FAILED') {
            logger.error({ backupId: b.id, error: b.error }, 'Respaldo programado falló');
          } else {
            logger.info({ backupId: b.id, filename: b.filename }, 'Respaldo programado completado');
          }
        },
        (err) => logger.error({ err }, 'Falló el respaldo programado'),
      );
    },
    { timezone: 'America/Bogota' },
  );
  logger.info({ schedule }, 'Cron de respaldos programado');
}
