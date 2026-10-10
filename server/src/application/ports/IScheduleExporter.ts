import type { EmployeeGroup, ScheduleStatus, ShiftCode } from '@gaby/shared';

/** Datos planos del horario de un mes, listos para volcar a un archivo. */
export interface ScheduleExportData {
  year: number;
  month: number;
  status: ScheduleStatus;
  businessName: string;
  businessNit: string;
  employees: { id: string; fullName: string; group: EmployeeGroup }[];
  assignments: { employeeId: string; day: number; code: ShiftCode }[];
}

/** Puerto de exportación (la implementación con exceljs vive en infraestructura). */
export interface IScheduleExporter {
  toXlsx(data: ScheduleExportData): Promise<Buffer>;
}
