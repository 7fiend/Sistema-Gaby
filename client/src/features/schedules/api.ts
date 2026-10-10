import type { EmployeeGroup, EmployeeInput, ScheduleStatus, ShiftCode } from '@gaby/shared';
import { api, downloadFile } from '@/lib/api';

export interface Employee {
  id: string;
  fullName: string;
  group: EmployeeGroup;
  fixedShift: Exclude<ShiftCode, 'D'> | null;
  fixedWeekendRest: boolean;
  displayOrder: number;
  isActive: boolean;
}

export interface ScheduleAssignment {
  employeeId: string;
  day: number;
  code: ShiftCode;
}

export interface Schedule {
  id: string;
  year: number;
  month: number;
  status: ScheduleStatus;
  publishedAt: string | null;
  createdBy: string;
  updatedAt: string;
  assignments: ScheduleAssignment[];
}

export interface DayWarning {
  day: number;
  message: string;
}

export interface ScheduleMonthView {
  year: number;
  month: number;
  schedule: Schedule | null;
  employees: Employee[];
  warnings: DayWarning[];
}

export const schedulesApi = {
  month: (year: number, month: number) =>
    api.get<ScheduleMonthView>(`/schedules?year=${year}&month=${month}`),
  generate: (year: number, month: number) =>
    api.post<ScheduleMonthView>('/schedules/generate', { year, month }),
  /** date en formato YYYY-MM-DD; code null vacía la celda. */
  setCell: (scheduleId: string, input: { employeeId: string; date: string; code: ShiftCode | null }) =>
    api.put(`/schedules/${scheduleId}/assignments`, input),
  publish: (id: string) => api.post<Schedule>(`/schedules/${id}/publish`),
  exportXlsx: (year: number, month: number) =>
    downloadFile(`/schedules/export?year=${year}&month=${month}`),
};

export const employeesApi = {
  list: (includeInactive = false) => api.get<Employee[]>(`/employees?includeInactive=${includeInactive}`),
  create: (input: EmployeeInput) => api.post<Employee>('/employees', input),
  update: (id: string, input: Partial<EmployeeInput>) => api.put<Employee>(`/employees/${id}`, input),
  deactivate: (id: string) => api.post(`/employees/${id}/deactivate`),
};
