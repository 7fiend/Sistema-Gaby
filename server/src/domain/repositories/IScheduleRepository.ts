import type { EmployeeGroup, EmployeeInput, ScheduleStatus, ShiftCode } from '@gaby/shared';

export interface EmployeeDTO {
  id: string;
  fullName: string;
  group: EmployeeGroup;
  fixedShift: Exclude<ShiftCode, 'D'> | null;
  fixedWeekendRest: boolean;
  displayOrder: number;
  isActive: boolean;
}

/** Una celda de la grilla; `day` es el día del mes (1–31). */
export interface ScheduleAssignmentDTO {
  employeeId: string;
  day: number;
  code: ShiftCode;
}

export interface ScheduleDTO {
  id: string;
  year: number;
  month: number;
  status: ScheduleStatus;
  nextRestEmployeeId: string | null;
  publishedAt: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  assignments: ScheduleAssignmentDTO[];
}

export interface SaveGeneratedParams {
  year: number;
  month: number;
  userId: string;
  /** Empleadas que generó el algoritmo: solo sus celdas se reemplazan (cocina se conserva). */
  employeeIds: string[];
  assignments: ScheduleAssignmentDTO[];
  nextRestEmployeeId: string | null;
}

export interface IScheduleRepository {
  listEmployees(includeInactive: boolean): Promise<EmployeeDTO[]>;
  findEmployee(id: string): Promise<EmployeeDTO | null>;
  findEmployeesByIds(ids: string[]): Promise<EmployeeDTO[]>;
  createEmployee(input: EmployeeInput): Promise<EmployeeDTO>;
  updateEmployee(id: string, input: Partial<EmployeeInput>): Promise<EmployeeDTO>;
  setEmployeeActive(id: string, isActive: boolean): Promise<void>;

  findSchedule(year: number, month: number): Promise<ScheduleDTO | null>;
  findScheduleById(id: string): Promise<ScheduleDTO | null>;
  /** Crea el horario del mes o, si ya existe en borrador, reemplaza las celdas generadas (atómico). */
  saveGenerated(params: SaveGeneratedParams): Promise<ScheduleDTO>;
  /** Fija una celda; code null la vacía. */
  setAssignment(scheduleId: string, employeeId: string, date: Date, code: ShiftCode | null): Promise<void>;
  publish(id: string): Promise<ScheduleDTO>;
}
