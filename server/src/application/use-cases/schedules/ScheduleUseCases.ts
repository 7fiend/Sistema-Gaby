import {
  SETTING_KEYS,
  type AuthUser,
  type EmployeeInput,
  type ScheduleGenerateInput,
  type ShiftAssignmentUpdateInput,
} from '@gaby/shared';
import type {
  EmployeeDTO,
  IScheduleRepository,
  ScheduleDTO,
} from '../../../domain/repositories/IScheduleRepository.js';
import type { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../domain/errors/AppError.js';
import { toDateOnlyUTC } from '../../../domain/services/production.js';
import {
  generateMonthlySchedule,
  validateSchedule,
  type DayWarning,
} from '../../../domain/services/shiftSchedule.js';
import type { IAuditLogger } from '../../ports/IAuditLogger.js';
import type { IScheduleExporter } from '../../ports/IScheduleExporter.js';

export interface ScheduleMonthView {
  year: number;
  month: number;
  schedule: ScheduleDTO | null;
  /** Activas + las inactivas que aún tienen celdas en ese mes (para no perder filas del pasado). */
  employees: EmployeeDTO[];
  warnings: DayWarning[];
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Casos de uso de horarios de empleadas (Fase 19), agrupados por agregado. */
export class ScheduleUseCases {
  constructor(
    private readonly repo: IScheduleRepository,
    private readonly exporter: IScheduleExporter,
    private readonly settings: ISettingsRepository,
    private readonly audit: IAuditLogger,
  ) {}

  // --- Empleadas -----------------------------------------------------------

  listEmployees(includeInactive: boolean) {
    return this.repo.listEmployees(includeInactive);
  }

  async createEmployee(input: EmployeeInput, user: AuthUser) {
    const employee = await this.repo.createEmployee(input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'employee.create',
      resource: 'employees',
      resourceId: employee.id,
      after: input,
    });
    return employee;
  }

  async updateEmployee(id: string, input: Partial<EmployeeInput>, user: AuthUser) {
    const before = await this.repo.findEmployee(id);
    if (!before) throw new NotFoundError('Empleada', id);
    const employee = await this.repo.updateEmployee(id, input);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'employee.update',
      resource: 'employees',
      resourceId: id,
      before,
      after: input,
    });
    return employee;
  }

  async deactivateEmployee(id: string, user: AuthUser) {
    const before = await this.repo.findEmployee(id);
    if (!before) throw new NotFoundError('Empleada', id);
    await this.repo.setEmployeeActive(id, false);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'employee.deactivate',
      resource: 'employees',
      resourceId: id,
      before: { fullName: before.fullName },
    });
  }

  // --- Horario del mes -----------------------------------------------------

  async getMonth(year: number, month: number): Promise<ScheduleMonthView> {
    const schedule = await this.repo.findSchedule(year, month);
    const active = await this.repo.listEmployees(false);
    let employees = active;
    if (schedule) {
      const activeIds = new Set(active.map((e) => e.id));
      const orphanIds = [...new Set(schedule.assignments.map((a) => a.employeeId))].filter((id) => !activeIds.has(id));
      const orphans = await this.repo.findEmployeesByIds(orphanIds);
      employees = [...active, ...orphans].sort((a, b) => a.displayOrder - b.displayOrder || a.fullName.localeCompare(b.fullName));
    }
    const codes = new Map(schedule?.assignments.map((a) => [`${a.employeeId}:${a.day}`, a.code]) ?? []);
    const warnings = schedule
      ? validateSchedule(year, month, employees, (id, day) => codes.get(`${id}:${day}`))
      : [];
    return { year, month, schedule, employees, warnings };
  }

  /** Genera el mes (o lo regenera si sigue en borrador); la rotación sigue corrida desde el mes anterior. */
  async generate(input: ScheduleGenerateInput, user: AuthUser): Promise<ScheduleMonthView> {
    const { year, month } = input;
    const existing = await this.repo.findSchedule(year, month);
    if (existing?.status === 'PUBLISHED') {
      throw new ConflictError('Ese horario ya está publicado — los cambios se hacen celda por celda.');
    }
    const employees = await this.repo.listEmployees(false);
    const generatedIds = employees.filter((e) => e.group === 'AUXILIARY').map((e) => e.id);
    if (generatedIds.length === 0) {
      throw new ValidationError('Agrega al menos una auxiliar activa antes de generar el horario.');
    }
    const prev = previousMonth(year, month);
    const previous = await this.repo.findSchedule(prev.year, prev.month);
    const result = generateMonthlySchedule({
      year,
      month,
      employees,
      startWithEmployeeId: previous?.nextRestEmployeeId ?? null,
    });
    const schedule = await this.repo.saveGenerated({
      year,
      month,
      userId: user.id,
      employeeIds: generatedIds,
      assignments: result.assignments,
      nextRestEmployeeId: result.nextRestEmployeeId,
    });
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: existing ? 'schedule.regenerate' : 'schedule.generate',
      resource: 'schedules',
      resourceId: schedule.id,
      after: { year, month, auxiliaries: generatedIds.length, continuesFrom: previous?.nextRestEmployeeId ?? null },
    });
    return this.getMonth(year, month);
  }

  /**
   * Cambia una celda. Se permite también con el horario publicado (decisión
   * del cliente: incapacidades y cambios de último momento) — por eso el antes
   * y el después quedan siempre en auditoría.
   */
  async updateAssignment(scheduleId: string, input: ShiftAssignmentUpdateInput, user: AuthUser) {
    const schedule = await this.repo.findScheduleById(scheduleId);
    if (!schedule) throw new NotFoundError('Horario', scheduleId);
    const date = toDateOnlyUTC(input.date);
    if (date.getUTCFullYear() !== schedule.year || date.getUTCMonth() + 1 !== schedule.month) {
      throw new ValidationError('La fecha no pertenece a este horario');
    }
    const employee = await this.repo.findEmployee(input.employeeId);
    if (!employee) throw new NotFoundError('Empleada', input.employeeId);

    const day = date.getUTCDate();
    const before = schedule.assignments.find((a) => a.employeeId === employee.id && a.day === day)?.code ?? null;
    if (before === input.code) return;

    await this.repo.setAssignment(schedule.id, employee.id, date, input.code);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'schedule.assignment-update',
      resource: 'schedules',
      resourceId: schedule.id,
      before: { employee: employee.fullName, day, code: before },
      after: { employee: employee.fullName, day, code: input.code },
      metadata: { year: schedule.year, month: schedule.month, status: schedule.status },
    });
  }

  async publish(id: string, user: AuthUser) {
    const schedule = await this.repo.findScheduleById(id);
    if (!schedule) throw new NotFoundError('Horario', id);
    if (schedule.status === 'PUBLISHED') throw new ConflictError('Ese horario ya está publicado');
    const published = await this.repo.publish(id);
    await this.audit.log({
      kind: 'CRUD',
      userId: user.id,
      action: 'schedule.publish',
      resource: 'schedules',
      resourceId: id,
      after: { year: schedule.year, month: schedule.month },
    });
    return published;
  }

  async exportXlsx(year: number, month: number): Promise<{ buffer: Buffer; filename: string }> {
    const view = await this.getMonth(year, month);
    if (!view.schedule) throw new NotFoundError('Horario', `${year}-${month}`);
    const [businessName, businessNit] = await Promise.all([
      this.settings.getString(SETTING_KEYS.BUSINESS_NAME, ''),
      this.settings.getString(SETTING_KEYS.BUSINESS_NIT, ''),
    ]);
    const buffer = await this.exporter.toXlsx({
      year,
      month,
      status: view.schedule.status,
      businessName,
      businessNit,
      employees: view.employees,
      assignments: view.schedule.assignments,
    });
    return { buffer, filename: `horario-${year}-${String(month).padStart(2, '0')}.xlsx` };
  }
}
