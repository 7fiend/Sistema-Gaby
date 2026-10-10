import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Download, Send, TriangleAlert, Wand2 } from 'lucide-react';
import { EMPLOYEE_GROUP_LABELS, SHIFT_CODES, SHIFT_CODE_LABELS, type ShiftCode } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { cn, todayISO } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { schedulesApi, type ScheduleMonthView } from './api';
import { EmployeesTab } from './EmployeesTab';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Mismos colores que el Excel exportado (texto oscuro forzado: se lee igual en tema oscuro). */
const CELL: Record<ShiftCode, string> = {
  M: 'bg-[#F4B183] text-neutral-900',
  T: 'bg-[#F2F2F2] text-neutral-900',
  C: 'bg-[#C6E0B4] text-neutral-900',
  D: 'bg-[#BDD7EE] text-neutral-900',
};

const pad = (n: number) => String(n).padStart(2, '0');

function MonthGrid() {
  const queryClient = useQueryClient();
  const [monthValue, setMonthValue] = useState(todayISO().slice(0, 7));
  const [year, month] = monthValue.split('-').map(Number) as [number, number];
  const queryKey = ['schedules', year, month];

  const { data: view, isLoading } = useQuery({
    queryKey,
    queryFn: () => schedulesApi.month(year, month),
    enabled: !!year && !!month,
  });

  const onError = (e: unknown, fallback: string) =>
    toast.error(e instanceof ApiRequestError ? e.message : fallback);

  const generate = useMutation({
    mutationFn: () => schedulesApi.generate(year, month),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      toast.success(view?.schedule ? 'Horario regenerado' : 'Horario generado como borrador');
    },
    onError: (e) => onError(e, 'No se pudo generar el horario'),
  });

  const publish = useMutation({
    mutationFn: (id: string) => schedulesApi.publish(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      toast.success('Horario publicado');
    },
    onError: (e) => onError(e, 'No se pudo publicar'),
  });

  const setCell = useMutation({
    mutationFn: (v: { scheduleId: string; employeeId: string; day: number; code: ShiftCode | null }) =>
      schedulesApi.setCell(v.scheduleId, {
        employeeId: v.employeeId,
        date: `${year}-${pad(month)}-${pad(v.day)}`,
        code: v.code,
      }),
    // Cambio optimista: la celda se pinta ya; los avisos llegan al refrescar
    onMutate: (v) => {
      queryClient.setQueryData<ScheduleMonthView>(queryKey, (old) => {
        if (!old?.schedule) return old;
        const rest = old.schedule.assignments.filter((a) => !(a.employeeId === v.employeeId && a.day === v.day));
        const assignments = v.code ? [...rest, { employeeId: v.employeeId, day: v.day, code: v.code }] : rest;
        return { ...old, schedule: { ...old.schedule, assignments } };
      });
    },
    onError: (e) => onError(e, 'No se pudo cambiar el turno'),
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const exportXlsx = useMutation({
    mutationFn: () => schedulesApi.exportXlsx(year, month),
    onError: (e) => onError(e, 'No se pudo exportar'),
  });

  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  const weekdayOf = (day: number) => new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const schedule = view?.schedule ?? null;
  const codes = new Map(schedule?.assignments.map((a) => [`${a.employeeId}:${a.day}`, a.code]) ?? []);

  const warningsByDay = new Map<number, string[]>();
  for (const w of view?.warnings ?? []) {
    warningsByDay.set(w.day, [...(warningsByDay.get(w.day) ?? []), w.message]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="month"
          value={monthValue}
          onChange={(e) => e.target.value && setMonthValue(e.target.value)}
          className="w-auto"
          aria-label="Mes"
        />
        {schedule ? (
          <Badge
            variant="outline"
            className={cn(schedule.status === 'PUBLISHED' ? 'border-primary text-primary' : 'border-warning text-warning')}
          >
            {schedule.status === 'PUBLISHED' ? 'Publicado' : 'Borrador'}
          </Badge>
        ) : (
          !isLoading && <Badge variant="outline">Sin generar</Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {!schedule && (
            <Button onClick={() => generate.mutate()} disabled={generate.isPending || isLoading}>
              <Wand2 className="size-4" /> Generar horario
            </Button>
          )}
          {schedule?.status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                disabled={generate.isPending}
                onClick={() => {
                  if (
                    confirm(
                      'Se vuelven a calcular los turnos de las auxiliares (lo que hayas cambiado a mano en ellas se pierde). Las filas de cocina se conservan. ¿Continuar?',
                    )
                  )
                    generate.mutate();
                }}
              >
                <Wand2 className="size-4" /> Regenerar
              </Button>
              <Button
                disabled={publish.isPending}
                onClick={() => {
                  const extra = view?.warnings.length
                    ? `\n\nOjo: quedan ${warningsByDay.size} día(s) con avisos de cobertura.`
                    : '';
                  if (confirm(`¿Publicar el horario de este mes?${extra}`)) publish.mutate(schedule.id);
                }}
              >
                <Send className="size-4" /> Publicar
              </Button>
            </>
          )}
          {schedule && (
            <Button variant="outline" onClick={() => exportXlsx.mutate()} disabled={exportXlsx.isPending}>
              <Download className="size-4" /> Exportar Excel
            </Button>
          )}
        </div>
      </div>

      {schedule?.status === 'PUBLISHED' && (
        <p className="text-xs text-muted-foreground">
          Publicado. Puedes seguir corrigiendo celdas (incapacidades, cambios de turno) — cada cambio queda en
          auditoría con lo que había antes.
        </p>
      )}

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg border bg-card" />
      ) : view && view.employees.length === 0 ? (
        <p className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          Todavía no hay empleadas. Agrégalas en la pestaña <span className="font-medium">Empleadas</span> para poder
          generar el horario.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-36 border-b bg-card px-3 py-2 text-left font-medium">
                  Empleada
                </th>
                {days.map((day) => {
                  const wd = weekdayOf(day);
                  const weekend = wd === 0 || wd === 6;
                  return (
                    <th
                      key={day}
                      className={cn(
                        'w-9 border-b border-l px-0 py-1 text-center font-medium',
                        weekend && 'bg-muted',
                        warningsByDay.has(day) && 'text-destructive',
                      )}
                      title={warningsByDay.get(day)?.join(' · ')}
                    >
                      <div className="tnum">{day}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">{WEEKDAYS[wd]}</div>
                    </th>
                  );
                })}
                <th className="border-b border-l px-2 py-1 text-center font-medium" title="Días de descanso en el mes">
                  Desc.
                </th>
              </tr>
            </thead>
            <tbody>
              {view?.employees.map((employee) => {
                const restDays = days.filter((d) => codes.get(`${employee.id}:${d}`) === 'D').length;
                return (
                  <tr key={employee.id}>
                    <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5">
                      <div className="font-medium">{employee.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {EMPLOYEE_GROUP_LABELS[employee.group]}
                        {!employee.isActive && ' · inactiva'}
                      </div>
                    </td>
                    {days.map((day) => {
                      const code = codes.get(`${employee.id}:${day}`);
                      return (
                        <td key={day} className="h-9 border-b border-l p-0">
                          <select
                            aria-label={`${employee.fullName}, día ${day}`}
                            value={code ?? ''}
                            disabled={!schedule}
                            onChange={(e) =>
                              schedule &&
                              setCell.mutate({
                                scheduleId: schedule.id,
                                employeeId: employee.id,
                                day,
                                code: (e.target.value || null) as ShiftCode | null,
                              })
                            }
                            className={cn(
                              'h-full w-full cursor-pointer appearance-none bg-transparent text-center font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                              code && CELL[code],
                            )}
                          >
                            <option value="">—</option>
                            {SHIFT_CODES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </td>
                      );
                    })}
                    <td className="tnum border-b border-l px-2 text-center text-muted-foreground">
                      {employee.group === 'AUXILIARY' || restDays > 0 ? restDays : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {SHIFT_CODES.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className={cn('grid size-5 place-items-center rounded font-semibold', CELL[c])}>{c}</span>
            <span className="text-muted-foreground">{SHIFT_CODE_LABELS[c]}</span>
          </span>
        ))}
      </div>

      {schedule && warningsByDay.size > 0 && (
        <section className="rounded-lg border border-warning/40 bg-card p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-warning">
            <TriangleAlert className="size-4" /> {warningsByDay.size} día(s) con avisos de cobertura
          </h2>
          <ul className="flex flex-col gap-1 text-sm">
            {[...warningsByDay].map(([day, messages]) => (
              <li key={day}>
                <span className="tnum font-medium">
                  Día {day} ({WEEKDAYS[weekdayOf(day)]}):
                </span>{' '}
                <span className="text-muted-foreground">{messages.join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function SchedulesPage() {
  const [tab, setTab] = useState<'month' | 'employees'>('month');
  return (
    <div>
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarClock className="size-5" /> Horarios
        </h1>
        <p className="text-sm text-muted-foreground">
          Horario mensual de las empleadas. Las auxiliares se generan solas con las reglas acordadas; cocina se llena
          a mano. Toca cualquier celda para cambiar un turno.
        </p>
      </div>
      <div className="mb-4 flex gap-1 border-b">
        {(
          [
            ['month', 'Horario del mes'],
            ['employees', 'Empleadas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm transition-colors',
              tab === value
                ? 'border-primary font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'month' ? <MonthGrid /> : <EmployeesTab />}
    </div>
  );
}
