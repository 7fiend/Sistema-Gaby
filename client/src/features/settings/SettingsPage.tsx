import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { settingsSchema, type SettingsValues } from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { settingsApi } from './api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FieldDef {
  name: keyof SettingsValues;
  label: string;
  hint: string;
  step?: string;
  type?: 'text';
}

interface SectionDef {
  title: string;
  description: string;
  fields: FieldDef[];
}

/** Agrupación visual de app_settings (mismos campos que settingsSchema). */
const SECTIONS: SectionDef[] = [
  {
    title: 'Báscula y tolerancia',
    description: 'Rigen la entrega en bodega. La tolerancia se congela por orden al confirmarla (RN-04).',
    fields: [
      { name: 'toleranceKg', label: 'Tolerancia global (kg)', hint: '± permitido entre lo pedido y lo pesado', step: '0.005' },
      { name: 'stableSamples', label: 'Lecturas estables', hint: 'Muestras seguidas para dar el peso por firme' },
      { name: 'stableDeltaKg', label: 'Delta de estabilidad (kg)', hint: 'Variación máxima entre esas muestras', step: '0.001' },
    ],
  },
  {
    title: 'Costeo',
    description: 'Valores por defecto al crear recetas.',
    fields: [
      { name: 'defaultMarginPct', label: 'Margen objetivo (%)', hint: 'Margen sugerido para recetas nuevas' },
    ],
  },
  {
    title: 'Inventario',
    description: 'Alertas de vencimiento (el barrido corre a diario y al iniciar el sistema).',
    fields: [
      { name: 'expiryAlertDays', label: 'Días de aviso de vencimiento', hint: 'Alerta si un lote vence dentro de N días' },
    ],
  },
  {
    title: 'Seguridad',
    description: 'Bloqueo de cuentas por intentos fallidos de inicio de sesión.',
    fields: [
      { name: 'maxFailedAttempts', label: 'Intentos fallidos máximos', hint: 'Al llegar aquí la cuenta se bloquea' },
      { name: 'lockMinutes', label: 'Minutos de bloqueo', hint: 'Duración del bloqueo temporal' },
    ],
  },
  {
    title: 'Respaldos',
    description: 'Programación del respaldo automático (se activa en la Fase 13).',
    fields: [
      { name: 'backupSchedule', label: 'Horario (cron)', hint: 'Ej: "0 2 * * *" = todos los días 2:00 a. m.', type: 'text' },
      { name: 'backupRetentionCount', label: 'Respaldos a conservar', hint: 'Los más antiguos se eliminan' },
    ],
  },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });

  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
    values: data,
  });

  const mutation = useMutation({
    mutationFn: (v: SettingsValues) => settingsApi.update(v),
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      toast.success('Configuración guardada');
    },
    onError: (e) =>
      toast.error(e instanceof ApiRequestError ? e.message : 'No se pudo guardar la configuración'),
  });

  const { errors, isDirty } = form.formState;

  return (
    <div className="max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Configuración</h1>
        <p className="text-sm text-muted-foreground">
          Parámetros del sistema. Cada cambio queda registrado en auditoría.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-lg border bg-card" />
      ) : (
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="grid gap-4" noValidate>
          {SECTIONS.map((section) => (
            <section key={section.title} className="rounded-lg border bg-card p-5">
              <h2 className="text-sm font-medium">{section.title}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{section.description}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div key={field.name} className="flex flex-col gap-1.5">
                    <Label htmlFor={`s-${field.name}`}>{field.label}</Label>
                    <Input
                      id={`s-${field.name}`}
                      type={field.type ?? 'number'}
                      step={field.step ?? 'any'}
                      className="tnum"
                      {...form.register(field.name)}
                    />
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                    {errors[field.name] && (
                      <p className="text-xs text-destructive">{errors[field.name]?.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
          <div className="flex items-center justify-end gap-3">
            {isDirty && <span className="text-xs text-muted-foreground">Hay cambios sin guardar</span>}
            <Button type="submit" disabled={mutation.isPending || !isDirty}>
              Guardar configuración
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
