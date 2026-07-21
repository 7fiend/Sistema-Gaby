import cron from 'node-cron';
import type { GenerateExpiryAlerts } from '../../application/use-cases/system/GenerateExpiryAlerts.js';
import { logger } from '../logging/logger.js';

/** Hora local del barrido diario (el restaurante abre en la mañana). */
const DAILY_SCHEDULE = '0 6 * * *';

/**
 * Programa el barrido de lotes por vencer (entrega 9c). Además de la corrida
 * diaria, ejecuta una al arrancar: el PC del restaurante suele estar apagado
 * de madrugada y un cron puro nunca dispararía.
 */
export function startExpiryCron(job: GenerateExpiryAlerts): void {
  const run = async (trigger: string) => {
    try {
      const created = await job.execute();
      if (created > 0) {
        logger.info({ created, trigger }, 'Alertas de vencimiento generadas');
      }
    } catch (err) {
      logger.error({ err, trigger }, 'Falló el barrido de vencimientos');
    }
  };

  void run('startup');
  cron.schedule(DAILY_SCHEDULE, () => void run('cron'), { timezone: 'America/Bogota' });
  logger.info({ schedule: DAILY_SCHEDULE }, 'Cron de vencimientos programado');
}
