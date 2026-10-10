import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { EMPLOYEE_GROUP_LABELS, employeeSchema, type EmployeeInput } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { employeesApi, type Employee } from './api';

const emptyValues: EmployeeInput = {
  fullName: '',
  group: 'AUXILIARY',
  fixedShift: null,
  fixedWeekendRest: false,
  displayOrder: 0,
};

function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  nextOrder: number;
}) {
  const queryClient = useQueryClient();
  const form = useForm<EmployeeInput>({ resolver: zodResolver(employeeSchema), defaultValues: emptyValues });

  useEffect(() => {
    if (!open) return;
    form.reset(
      employee
        ? {
            fullName: employee.fullName,
            group: employee.group,
            fixedShift: employee.fixedShift,
            fixedWeekendRest: employee.fixedWeekendRest,
            displayOrder: employee.displayOrder,
          }
        : { ...emptyValues, displayOrder: nextOrder },
    );
  }, [open, employee, nextOrder, form]);

  const mutation = useMutation({
    mutationFn: (values: EmployeeInput) =>
      employee ? employeesApi.update(employee.id, values) : employeesApi.create(values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success(employee ? 'Empleada actualizada' : 'Empleada agregada');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Error al guardar la empleada'),
  });

  const { errors } = form.formState;
  const group = form.watch('group');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{employee ? `Editar ${employee.fullName}` : 'Nueva empleada'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid grid-cols-2 gap-3" noValidate>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="e-name">Nombre</Label>
            <Input id="e-name" autoFocus {...form.register('fullName')} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-group">Grupo</Label>
            <select
              id="e-group"
              {...form.register('group')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="AUXILIARY">Auxiliar (se genera sola)</option>
              <option value="KITCHEN">Cocina (se llena a mano)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-order">Orden en la grilla</Label>
            <Input id="e-order" type="number" min={0} className="tnum" {...form.register('displayOrder')} />
          </div>
          {group === 'AUXILIARY' && (
            <>
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="e-shift">Turno fijo</Label>
                <select
                  id="e-shift"
                  {...form.register('fixedShift', { setValueAs: (v: string | null) => (v ? v : null) })}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">Ninguno — rota entre turnos</option>
                  <option value="M">M (siempre el de la mañana)</option>
                  <option value="T">T</option>
                  <option value="C">C</option>
                </select>
              </div>
              <label className="col-span-2 flex items-start gap-2 text-sm">
                <input type="checkbox" {...form.register('fixedWeekendRest')} className="mt-0.5 size-4 accent-primary" />
                <span>
                  Descansa fijo los fines de semana
                  <span className="block text-xs text-muted-foreground">
                    Ocupa el cupo de descanso del sábado y domingo: las demás auxiliares descansan entre semana.
                  </span>
                </span>
              </label>
            </>
          )}
          <DialogFooter className="col-span-2 mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {employee ? 'Guardar cambios' : 'Agregar empleada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeesTab() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const { data: employees, isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => employeesApi.list() });

  const deactivate = useMutation({
    mutationFn: (id: string) => employeesApi.deactivate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      toast.success('Empleada desactivada');
    },
    onError: (e) => toast.error(e instanceof ApiRequestError ? e.message : 'Error al desactivar'),
  });

  const list = employees ?? [];
  const nextOrder = list.reduce((max, e) => Math.max(max, e.displayOrder), 0) + 1;

  const columns: Column<Employee>[] = [
    { header: 'Orden', className: 'w-16', cell: (e) => <span className="tnum text-muted-foreground">{e.displayOrder}</span> },
    { header: 'Nombre', cell: (e) => <span className="font-medium">{e.fullName}</span> },
    { header: 'Grupo', cell: (e) => EMPLOYEE_GROUP_LABELS[e.group] },
    {
      header: 'Reglas',
      cell: (e) =>
        e.group === 'KITCHEN' ? (
          <span className="text-muted-foreground">Se llena a mano</span>
        ) : (
          <span className="text-muted-foreground">
            {[
              e.fixedShift ? `Siempre ${e.fixedShift}` : 'Rota T/C',
              e.fixedWeekendRest ? 'descansa fines de semana' : 'descansos de 2 días entre semana',
            ].join(' · ')}
          </span>
        ),
    },
    {
      header: '',
      className: 'w-10 text-right',
      cell: (e) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Desactivar"
          onClick={(ev) => {
            ev.stopPropagation();
            if (confirm(`¿Desactivar a ${e.fullName}? Ya no aparecerá en los horarios nuevos.`)) deactivate.mutate(e.id);
          }}
        >
          <Trash2 className="size-4 text-muted-foreground" />
        </Button>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={{ items: list, total: list.length, page: 1, pageSize: list.length || 1, totalPages: 1 }}
        isLoading={isLoading}
        page={1}
        onPageChange={() => {}}
        onRowClick={(e) => {
          setEditing(e);
          setFormOpen(true);
        }}
        emptyMessage="Todavía no hay empleadas — agrega el personal para poder generar el horario"
        toolbar={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Nueva empleada
          </Button>
        }
      />
      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} nextOrder={nextOrder} />
    </>
  );
}
