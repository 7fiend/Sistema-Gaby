import type { EmployeeGroup, ShiftCode } from '@gaby/shared';

/**
 * Horario mensual de empleadas (Fase 19) — dominio puro, sin Prisma.
 *
 * Reglas acordadas con el cliente (ver docs/19-horarios-empleadas.md):
 * - Solo las AUXILIARES se generan; las de cocina se llenan a mano.
 * - Cada día descansa exactamente UNA auxiliar.
 * - Una auxiliar con `fixedWeekendRest` descansa todos los sábados y domingos y,
 *   cuando trabaja, hace siempre su `fixedShift` (o M). Ocupa el cupo de descanso
 *   del fin de semana, así que las demás auxiliares descansan solo entre semana.
 * - Las demás rotan el descanso en bloques de 2 días SEGUIDOS (petición de las
 *   empleadas). Si un tramo de días hábiles sobra 1 día (5 hábiles / bloques de
 *   2), ese día se suma al último bloque del tramo (3 seguidos), y como la
 *   rotación avanza, ese día extra le toca a una distinta cada semana.
 * - En los días que trabajan, se cubren M, T y C (uno de cada uno), repartidos
 *   por quien lleva menos veces cada turno, para que quede parejo en el mes.
 */

export type WorkShift = Exclude<ShiftCode, 'D'>;
const ROLES: WorkShift[] = ['M', 'T', 'C'];

export interface ScheduleEmployee {
  id: string;
  fullName: string;
  group: EmployeeGroup;
  fixedShift: WorkShift | null;
  fixedWeekendRest: boolean;
}

export interface GeneratedAssignment {
  employeeId: string;
  day: number;
  code: ShiftCode;
}

export interface GenerateScheduleInput {
  year: number;
  /** 1–12 */
  month: number;
  /** Empleadas activas, en el orden de la grilla (también es el orden de la rotación). */
  employees: ScheduleEmployee[];
  /** Quién inicia la rotación de descansos (continuidad con el mes anterior). */
  startWithEmployeeId?: string | null;
}

export interface GenerateScheduleResult {
  assignments: GeneratedAssignment[];
  /** Quién sigue en la rotación el mes siguiente (null si no hay rotación). */
  nextRestEmployeeId: string | null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isWeekendDay(year: number, month: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Tramos de días consecutivos que cumplen `include` (ej. los días hábiles entre fines de semana). */
function contiguousRuns(totalDays: number, include: (day: number) => boolean): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  for (let day = 1; day <= totalDays; day++) {
    if (include(day)) current.push(day);
    else if (current.length) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

export function generateMonthlySchedule(input: GenerateScheduleInput): GenerateScheduleResult {
  const { year, month } = input;
  const totalDays = daysInMonth(year, month);
  const weekend = (day: number) => isWeekendDay(year, month, day);

  const auxiliaries = input.employees.filter((e) => e.group === 'AUXILIARY');
  const fixedWeekend = auxiliaries.filter((e) => e.fixedWeekendRest);
  const pool = auxiliaries.filter((e) => !e.fixedWeekendRest);

  const grid = new Map<string, Map<number, ShiftCode>>();
  for (const e of auxiliaries) grid.set(e.id, new Map());
  const codeOf = (id: string, day: number) => grid.get(id)!.get(day);
  const setCode = (id: string, day: number, code: ShiftCode) => grid.get(id)!.set(day, code);

  // 1) Descanso fijo de fin de semana; entre semana, su turno fijo.
  for (const e of fixedWeekend) {
    for (let day = 1; day <= totalDays; day++) {
      setCode(e.id, day, weekend(day) ? 'D' : (e.fixedShift ?? 'M'));
    }
  }

  // 2) Bloques de descanso de 2 días seguidos para el resto, en rotación.
  //    Si alguien ya ocupa el fin de semana, la rotación solo usa días hábiles.
  const rotationRuns = contiguousRuns(totalDays, (day) => fixedWeekend.length === 0 || !weekend(day));
  const startIndex = Math.max(0, pool.findIndex((e) => e.id === input.startWithEmployeeId));
  let rotation = startIndex;
  if (pool.length > 0) {
    for (const run of rotationRuns) {
      let lastInRun: ScheduleEmployee | null = null;
      let i = 0;
      while (i < run.length) {
        const remaining = run.length - i;
        if (remaining === 1 && lastInRun) {
          setCode(lastInRun.id, run[i]!, 'D'); // el día sobrante alarga el último bloque
          i += 1;
          continue;
        }
        const emp = pool[rotation % pool.length]!;
        for (const day of run.slice(i, i + Math.min(2, remaining))) setCode(emp.id, day, 'D');
        lastInRun = emp;
        rotation += 1;
        i += Math.min(2, remaining);
      }
    }
  }

  // 3) Turnos M/T/C para los días trabajados, balanceados por conteo.
  const counts = new Map(pool.map((e) => [e.id, { M: 0, T: 0, C: 0 } as Record<WorkShift, number>]));
  for (let day = 1; day <= totalDays; day++) {
    const covered = new Set<ShiftCode>(
      fixedWeekend.map((e) => codeOf(e.id, day)!).filter((c) => c !== 'D'),
    );
    const unassigned = pool.filter((e) => codeOf(e.id, day) !== 'D');
    for (const role of ROLES) {
      if (covered.has(role) || unassigned.length === 0) continue;
      // el de menor conteo para ese turno; en empate, el primero en orden (estable)
      const pick = unassigned.reduce((best, e) => (counts.get(e.id)![role] < counts.get(best.id)![role] ? e : best));
      setCode(pick.id, day, role);
      counts.get(pick.id)![role] += 1;
      covered.add(role);
      unassigned.splice(unassigned.indexOf(pick), 1);
    }
    // Más auxiliares trabajando que turnos: refuerzan T o C (el que menos lleve).
    for (const e of unassigned) {
      const c = counts.get(e.id)!;
      const role: WorkShift = c.T <= c.C ? 'T' : 'C';
      setCode(e.id, day, role);
      c[role] += 1;
    }
  }

  const assignments: GeneratedAssignment[] = [];
  for (const e of auxiliaries) {
    for (let day = 1; day <= totalDays; day++) {
      assignments.push({ employeeId: e.id, day, code: codeOf(e.id, day)! });
    }
  }
  return {
    assignments,
    nextRestEmployeeId: pool.length > 0 ? pool[rotation % pool.length]!.id : null,
  };
}

export interface DayWarning {
  day: number;
  message: string;
}

/**
 * Avisos de cobertura por día (no bloquean, igual que los faltantes de
 * producción): solo se revisan las auxiliares — cocina no tiene regla definida.
 */
export function validateSchedule(
  year: number,
  month: number,
  employees: ScheduleEmployee[],
  codeOf: (employeeId: string, day: number) => ShiftCode | undefined,
): DayWarning[] {
  const auxiliaries = employees.filter((e) => e.group === 'AUXILIARY');
  if (auxiliaries.length === 0) return [];
  const warnings: DayWarning[] = [];
  for (let day = 1; day <= daysInMonth(year, month); day++) {
    const codes = auxiliaries.map((e) => codeOf(e.id, day));
    const missing = auxiliaries.filter((_, i) => codes[i] === undefined);
    if (missing.length > 0) {
      warnings.push({ day, message: `Sin turno asignado: ${missing.map((e) => e.fullName).join(', ')}` });
    }
    const resting = codes.filter((c) => c === 'D').length;
    if (resting === 0) warnings.push({ day, message: 'Ninguna auxiliar descansa' });
    if (resting > 1) warnings.push({ day, message: `Descansan ${resting} auxiliares el mismo día` });
    for (const role of ROLES) {
      if (!codes.includes(role)) warnings.push({ day, message: `Nadie cubre el turno ${role}` });
    }
  }
  return warnings;
}
