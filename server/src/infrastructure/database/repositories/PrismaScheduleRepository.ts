import type { Prisma, PrismaClient } from '@prisma/client';
import type { EmployeeInput, ShiftCode } from '@gaby/shared';
import type {
  EmployeeDTO,
  IScheduleRepository,
  SaveGeneratedParams,
  ScheduleDTO,
} from '../../../domain/repositories/IScheduleRepository.js';

const scheduleInclude = {
  createdBy: { select: { fullName: true } },
  assignments: { select: { employeeId: true, date: true, code: true } },
} as const;

type ScheduleRow = Prisma.ShiftScheduleGetPayload<{ include: typeof scheduleInclude }>;
type EmployeeRow = Prisma.EmployeeGetPayload<object>;

function toEmployee(e: EmployeeRow): EmployeeDTO {
  return {
    id: e.id,
    fullName: e.fullName,
    group: e.group,
    fixedShift: e.fixedShift === 'D' ? null : e.fixedShift,
    fixedWeekendRest: e.fixedWeekendRest,
    displayOrder: e.displayOrder,
    isActive: e.isActive,
  };
}

function toSchedule(s: ScheduleRow): ScheduleDTO {
  return {
    id: s.id,
    year: s.year,
    month: s.month,
    status: s.status,
    nextRestEmployeeId: s.nextRestEmployeeId,
    publishedAt: s.publishedAt,
    createdBy: s.createdBy.fullName,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    // @db.Date llega como medianoche UTC: el día del mes sale de getUTCDate
    assignments: s.assignments.map((a) => ({ employeeId: a.employeeId, day: a.date.getUTCDate(), code: a.code })),
  };
}

const employeeOrder: Prisma.EmployeeOrderByWithRelationInput[] = [{ displayOrder: 'asc' }, { fullName: 'asc' }];

export class PrismaScheduleRepository implements IScheduleRepository {
  constructor(private readonly db: PrismaClient) {}

  async listEmployees(includeInactive: boolean): Promise<EmployeeDTO[]> {
    const rows = await this.db.employee.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: employeeOrder,
    });
    return rows.map(toEmployee);
  }

  async findEmployee(id: string): Promise<EmployeeDTO | null> {
    const e = await this.db.employee.findUnique({ where: { id } });
    return e ? toEmployee(e) : null;
  }

  async findEmployeesByIds(ids: string[]): Promise<EmployeeDTO[]> {
    if (ids.length === 0) return [];
    const rows = await this.db.employee.findMany({ where: { id: { in: ids } }, orderBy: employeeOrder });
    return rows.map(toEmployee);
  }

  async createEmployee(input: EmployeeInput): Promise<EmployeeDTO> {
    const e = await this.db.employee.create({
      data: {
        fullName: input.fullName,
        group: input.group,
        fixedShift: input.fixedShift,
        fixedWeekendRest: input.fixedWeekendRest,
        displayOrder: input.displayOrder,
      },
    });
    return toEmployee(e);
  }

  async updateEmployee(id: string, input: Partial<EmployeeInput>): Promise<EmployeeDTO> {
    const e = await this.db.employee.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined && { fullName: input.fullName }),
        ...(input.group !== undefined && { group: input.group }),
        ...(input.fixedShift !== undefined && { fixedShift: input.fixedShift }),
        ...(input.fixedWeekendRest !== undefined && { fixedWeekendRest: input.fixedWeekendRest }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
      },
    });
    return toEmployee(e);
  }

  async setEmployeeActive(id: string, isActive: boolean): Promise<void> {
    await this.db.employee.update({ where: { id }, data: { isActive } });
  }

  async findSchedule(year: number, month: number): Promise<ScheduleDTO | null> {
    const s = await this.db.shiftSchedule.findUnique({
      where: { year_month: { year, month } },
      include: scheduleInclude,
    });
    return s ? toSchedule(s) : null;
  }

  async findScheduleById(id: string): Promise<ScheduleDTO | null> {
    const s = await this.db.shiftSchedule.findUnique({ where: { id }, include: scheduleInclude });
    return s ? toSchedule(s) : null;
  }

  async saveGenerated(p: SaveGeneratedParams): Promise<ScheduleDTO> {
    return this.db.$transaction(async (tx) => {
      const schedule = await tx.shiftSchedule.upsert({
        where: { year_month: { year: p.year, month: p.month } },
        update: { nextRestEmployeeId: p.nextRestEmployeeId },
        create: {
          year: p.year,
          month: p.month,
          createdById: p.userId,
          nextRestEmployeeId: p.nextRestEmployeeId,
        },
      });
      // Regenerar solo pisa a las empleadas generadas: lo llenado a mano de cocina se queda
      await tx.shiftAssignment.deleteMany({
        where: { scheduleId: schedule.id, employeeId: { in: p.employeeIds } },
      });
      await tx.shiftAssignment.createMany({
        data: p.assignments.map((a) => ({
          scheduleId: schedule.id,
          employeeId: a.employeeId,
          date: new Date(Date.UTC(p.year, p.month - 1, a.day)),
          code: a.code,
        })),
      });
      const full = await tx.shiftSchedule.findUniqueOrThrow({
        where: { id: schedule.id },
        include: scheduleInclude,
      });
      return toSchedule(full);
    });
  }

  async setAssignment(scheduleId: string, employeeId: string, date: Date, code: ShiftCode | null): Promise<void> {
    const where = { scheduleId_employeeId_date: { scheduleId, employeeId, date } };
    if (code === null) {
      await this.db.shiftAssignment.deleteMany({ where: { scheduleId, employeeId, date } });
      return;
    }
    await this.db.shiftAssignment.upsert({
      where,
      update: { code },
      create: { scheduleId, employeeId, date, code },
    });
  }

  async publish(id: string): Promise<ScheduleDTO> {
    const s = await this.db.shiftSchedule.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      include: scheduleInclude,
    });
    return toSchedule(s);
  }
}
