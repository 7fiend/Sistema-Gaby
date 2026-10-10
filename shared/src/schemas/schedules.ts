import { z } from 'zod';
import { EMPLOYEE_GROUPS, SHIFT_CODES } from '../types/enums.js';

/** Fase 19: empleada del horario (crear/editar). No es una cuenta de usuario. */
export const employeeSchema = z.object({
  fullName: z.string().trim().min(2, 'Mínimo 2 caracteres').max(80),
  group: z.enum(EMPLOYEE_GROUPS),
  /** Turno que hace siempre que trabaja (ej. auxiliar administrativa → M). */
  fixedShift: z.enum(SHIFT_CODES).exclude(['D']).nullable().default(null),
  /** Descansa todos los sábados y domingos. */
  fixedWeekendRest: z.boolean().default(false),
  displayOrder: z.coerce.number().int().min(0).default(0),
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

const year = z.coerce.number().int().min(2024).max(2100);
const month = z.coerce.number().int().min(1).max(12);

export const scheduleMonthQuerySchema = z.object({ year, month });
export type ScheduleMonthQuery = z.infer<typeof scheduleMonthQuerySchema>;

/** Genera (o regenera, solo en borrador) el horario de un mes. */
export const scheduleGenerateSchema = z.object({ year, month });
export type ScheduleGenerateInput = z.infer<typeof scheduleGenerateSchema>;

/** Cambia una celda; code null la deja vacía. */
export const shiftAssignmentUpdateSchema = z.object({
  employeeId: z.string().min(1),
  date: z.coerce.date(),
  code: z.enum(SHIFT_CODES).nullable(),
});
export type ShiftAssignmentUpdateInput = z.infer<typeof shiftAssignmentUpdateSchema>;
