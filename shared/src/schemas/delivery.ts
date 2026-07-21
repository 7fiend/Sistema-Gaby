import { z } from 'zod';
import { WEIGHT_SOURCES } from '../types/enums.js';

/** Lectura cruda de báscula, guardada como evidencia (RF-06.4). */
export const scaleReadingSchema = z.object({
  weightKg: z.number(),
  stable: z.boolean(),
  timestamp: z.number(),
});
export type ScaleReadingInput = z.infer<typeof scaleReadingSchema>;

/**
 * Registrar una entrega (RF-05): el peso/cantidad SIEMPRE viene del cliente
 * ya capturado por báscula/simulador/conteo — el servidor valida tolerancia
 * (RN-01) y decide aprobar o bloquear, nunca confía en el cliente.
 */
export const deliveryRegisterSchema = z.object({
  quantity: z.coerce.number().positive('El peso/cantidad debe ser mayor a 0'),
  mode: z.enum(['complete', 'partial']),
  source: z.enum(WEIGHT_SOURCES),
  readings: z.array(scaleReadingSchema).max(200).default([]),
});
export type DeliveryRegisterInput = z.infer<typeof deliveryRegisterSchema>;
