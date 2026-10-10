import { describe, expect, it } from 'vitest';
import type { ShiftCode } from '@gaby/shared';
import {
  daysInMonth,
  generateMonthlySchedule,
  isWeekendDay,
  validateSchedule,
  type ScheduleEmployee,
} from './shiftSchedule.js';

// Equipo real del cliente (Fase 19), en el orden de la grilla.
const TEAM: ScheduleEmployee[] = [
  { id: 'nuris', fullName: 'Nuris', group: 'KITCHEN', fixedShift: null, fixedWeekendRest: false },
  { id: 'lilibeth', fullName: 'Lilibeth', group: 'KITCHEN', fixedShift: null, fixedWeekendRest: false },
  { id: 'adriana', fullName: 'Adriana', group: 'AUXILIARY', fixedShift: null, fixedWeekendRest: false },
  { id: 'gloria', fullName: 'Gloria', group: 'AUXILIARY', fixedShift: null, fixedWeekendRest: false },
  { id: 'dunis', fullName: 'Dunis', group: 'AUXILIARY', fixedShift: null, fixedWeekendRest: false },
  { id: 'katherine', fullName: 'Katherine', group: 'AUXILIARY', fixedShift: 'M', fixedWeekendRest: true },
];

function rowOf(assignments: { employeeId: string; day: number; code: ShiftCode }[], id: string): string {
  return assignments
    .filter((a) => a.employeeId === id)
    .sort((a, b) => a.day - b.day)
    .map((a) => a.code)
    .join('');
}

function lookup(assignments: { employeeId: string; day: number; code: ShiftCode }[]) {
  const map = new Map(assignments.map((a) => [`${a.employeeId}:${a.day}`, a.code]));
  return (id: string, day: number) => map.get(`${id}:${day}`);
}

describe('calendario', () => {
  it('octubre 2026 tiene 31 días y empieza en jueves (no es fin de semana)', () => {
    expect(daysInMonth(2026, 10)).toBe(31);
    expect(isWeekendDay(2026, 10, 1)).toBe(false); // jueves
    expect(isWeekendDay(2026, 10, 3)).toBe(true); // sábado
    expect(isWeekendDay(2026, 10, 4)).toBe(true); // domingo
  });
});

describe('generateMonthlySchedule — octubre 2026 (horario aprobado por el cliente)', () => {
  const result = generateMonthlySchedule({ year: 2026, month: 10, employees: TEAM });

  it('reproduce exactamente el Excel entregado y aprobado', () => {
    expect(rowOf(result.assignments, 'adriana')).toBe('DDMTTCTCTCMDDTCTCCTCDDDMTTCTCTC');
    expect(rowOf(result.assignments, 'gloria')).toBe('TCTMDDCTCTCCTDDDMTCTCTCTMDDCTCT');
    expect(rowOf(result.assignments, 'dunis')).toBe('CTCCCTDDDMTTCCTCTMDDTCTCCCTDDDM');
    expect(rowOf(result.assignments, 'katherine')).toBe('MMDDMMMMMDDMMMMMDDMMMMMDDMMMMMD');
  });

  it('no genera nada para cocina (se llena a mano)', () => {
    expect(result.assignments.some((a) => a.employeeId === 'nuris' || a.employeeId === 'lilibeth')).toBe(false);
  });

  it('no deja avisos de cobertura', () => {
    expect(validateSchedule(2026, 10, TEAM, lookup(result.assignments))).toEqual([]);
  });

  it('las auxiliares en rotación nunca descansan en fin de semana (ese cupo es de Katherine)', () => {
    for (const a of result.assignments) {
      if (a.employeeId !== 'katherine' && a.code === 'D') {
        expect(isWeekendDay(2026, 10, a.day)).toBe(false);
      }
    }
  });

  it('los descansos de la rotación vienen en bloques de 2 o 3 días seguidos', () => {
    for (const id of ['adriana', 'gloria', 'dunis']) {
      const blocks = rowOf(result.assignments, id).match(/D+/g) ?? [];
      for (const block of blocks) expect([2, 3]).toContain(block.length);
    }
  });

  it('deja anotada quién sigue en la rotación para noviembre', () => {
    // 9 bloques en octubre (A,G,U ×3) → noviembre arranca otra vez con Adriana
    expect(result.nextRestEmployeeId).toBe('adriana');
  });
});

describe('generateMonthlySchedule — continuidad y otros equipos', () => {
  it('arranca la rotación con quien diga el mes anterior', () => {
    const nov = generateMonthlySchedule({ year: 2026, month: 11, employees: TEAM, startWithEmployeeId: 'gloria' });
    const firstRest = nov.assignments
      .filter((a) => a.code === 'D' && a.employeeId !== 'katherine')
      .sort((a, b) => a.day - b.day)[0];
    expect(firstRest?.employeeId).toBe('gloria');
  });

  it('si la empleada de continuidad ya no existe, arranca desde la primera', () => {
    const r = generateMonthlySchedule({ year: 2026, month: 11, employees: TEAM, startWithEmployeeId: 'ya-no-existe' });
    const firstRest = r.assignments
      .filter((a) => a.code === 'D' && a.employeeId !== 'katherine')
      .sort((a, b) => a.day - b.day)[0];
    expect(firstRest?.employeeId).toBe('adriana');
  });

  it('sin nadie con descanso fijo de fin de semana, la rotación cubre también sábados y domingos', () => {
    const team = TEAM.filter((e) => e.id !== 'katherine');
    const r = generateMonthlySchedule({ year: 2026, month: 10, employees: team });
    const codeOf = lookup(r.assignments);
    for (let day = 1; day <= 31; day++) {
      const resting = ['adriana', 'gloria', 'dunis'].filter((id) => codeOf(id, day) === 'D');
      expect(resting).toHaveLength(1);
    }
  });

  it('cada día descansa exactamente una en varios meses seguidos', () => {
    let start: string | null = null;
    for (const month of [10, 11, 12]) {
      const r = generateMonthlySchedule({ year: 2026, month, employees: TEAM, startWithEmployeeId: start });
      expect(validateSchedule(2026, month, TEAM, lookup(r.assignments))).toEqual([]);
      start = r.nextRestEmployeeId;
    }
  });
});

describe('validateSchedule', () => {
  it('avisa cuando dos descansan el mismo día y nadie cubre un turno', () => {
    const base = generateMonthlySchedule({ year: 2026, month: 10, employees: TEAM });
    // día 5: Gloria descansa; forzamos a Adriana (que tenía T) a descansar también
    const edited = base.assignments.map((a) =>
      a.employeeId === 'adriana' && a.day === 5 ? { ...a, code: 'D' as ShiftCode } : a,
    );
    const warnings = validateSchedule(2026, 10, TEAM, lookup(edited)).filter((w) => w.day === 5);
    expect(warnings.map((w) => w.message)).toEqual(
      expect.arrayContaining(['Descansan 2 auxiliares el mismo día', 'Nadie cubre el turno T']),
    );
  });

  it('avisa cuando a una auxiliar le falta el turno', () => {
    const warnings = validateSchedule(2026, 10, TEAM, () => undefined).filter((w) => w.day === 1);
    expect(warnings[0]?.message).toContain('Sin turno asignado');
  });
});
