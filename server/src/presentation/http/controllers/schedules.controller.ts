import type { Request, Response } from 'express';
import { z } from 'zod';
import type {
  EmployeeInput,
  ScheduleGenerateInput,
  ScheduleMonthQuery,
  ShiftAssignmentUpdateInput,
} from '@gaby/shared';
import type { ScheduleUseCases } from '../../../application/use-cases/schedules/ScheduleUseCases.js';
import { authUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';

/** "false" no debe convertirse en true (z.coerce.boolean lo haría). */
export const employeesQuerySchema = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class SchedulesController {
  constructor(private readonly schedules: ScheduleUseCases) {}

  listEmployees = async (req: Request, res: Response): Promise<void> => {
    const { includeInactive } = validatedQuery<z.infer<typeof employeesQuerySchema>>(req);
    res.json({ data: await this.schedules.listEmployees(includeInactive) });
  };

  createEmployee = async (req: Request, res: Response): Promise<void> => {
    const employee = await this.schedules.createEmployee(req.body as EmployeeInput, authUser(req));
    res.status(201).json({ data: employee });
  };

  updateEmployee = async (req: Request, res: Response): Promise<void> => {
    res.json({
      data: await this.schedules.updateEmployee(req.params.id as string, req.body as Partial<EmployeeInput>, authUser(req)),
    });
  };

  deactivateEmployee = async (req: Request, res: Response): Promise<void> => {
    await this.schedules.deactivateEmployee(req.params.id as string, authUser(req));
    res.json({ data: { ok: true } });
  };

  getMonth = async (req: Request, res: Response): Promise<void> => {
    const { year, month } = validatedQuery<ScheduleMonthQuery>(req);
    res.json({ data: await this.schedules.getMonth(year, month) });
  };

  generate = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json({ data: await this.schedules.generate(req.body as ScheduleGenerateInput, authUser(req)) });
  };

  updateAssignment = async (req: Request, res: Response): Promise<void> => {
    await this.schedules.updateAssignment(
      req.params.id as string,
      req.body as ShiftAssignmentUpdateInput,
      authUser(req),
    );
    res.json({ data: { ok: true } });
  };

  publish = async (req: Request, res: Response): Promise<void> => {
    res.json({ data: await this.schedules.publish(req.params.id as string, authUser(req)) });
  };

  /** Responde el archivo binario (fuera del envelope { data }, igual que reportes y respaldos). */
  exportXlsx = async (req: Request, res: Response): Promise<void> => {
    const { year, month } = validatedQuery<ScheduleMonthQuery>(req);
    const { buffer, filename } = await this.schedules.exportXlsx(year, month);
    res.setHeader('Content-Type', XLSX_TYPE);
    res.attachment(filename);
    res.send(buffer);
  };
}
