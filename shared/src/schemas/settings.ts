import { z } from 'zod';

/**
 * Configuración editable del sistema (tabla app_settings — RF-11).
 * Nombres en camelCase para la UI; el servidor los mapea a SETTING_KEYS.
 */
export const settingsSchema = z.object({
  /** Tolerancia global de báscula en kg (RN-04). */
  toleranceKg: z.coerce.number().positive('Debe ser mayor a 0').max(5, 'Máximo 5 kg'),
  /** Lecturas estables requeridas por el ScaleService (RF-06.4). */
  stableSamples: z.coerce.number().int('Debe ser entero').min(2).max(50),
  stableDeltaKg: z.coerce.number().positive('Debe ser mayor a 0').max(1),
  defaultMarginPct: z.coerce.number().min(0).max(95, 'Máximo 95 %'),
  expiryAlertDays: z.coerce.number().int('Debe ser entero').min(1).max(60),
  maxFailedAttempts: z.coerce.number().int('Debe ser entero').min(3).max(10),
  lockMinutes: z.coerce.number().int('Debe ser entero').min(1).max(1440),
  backupSchedule: z
    .string()
    .trim()
    .regex(/^\S+ \S+ \S+ \S+ \S+$/, 'Expresión cron de 5 campos (min hora día mes díaSemana)'),
  backupRetentionCount: z.coerce.number().int('Debe ser entero').min(1).max(365),
});
export type SettingsValues = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.partial();
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
