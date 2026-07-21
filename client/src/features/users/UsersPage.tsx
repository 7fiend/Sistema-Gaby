import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Plus, UserX } from 'lucide-react';
import {
  userCreateSchema,
  userResetPasswordSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserResetPasswordInput,
  type UserUpdateInput,
} from '@gaby/shared';
import { ApiRequestError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/stores/auth';
import { usersApi, ROLE_LABELS, type UserItem } from './api';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function useRoles() {
  return useQuery({ queryKey: ['users', 'roles'], queryFn: usersApi.roles });
}

function roleLabel(name: string): string {
  return ROLE_LABELS[name] ?? name;
}

function errorToast(e: unknown, fallback: string) {
  toast.error(e instanceof ApiRequestError ? e.message : fallback);
}

/** Alta de usuario (con contraseña inicial). */
function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    values: { username: '', fullName: '', email: '', roleId: '', password: '' },
  });
  const mutation = useMutation({
    mutationFn: (v: UserCreateInput) => usersApi.create(v),
    onSuccess: (u) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Usuario ${u.username} creado`);
      onOpenChange(false);
      form.reset();
    },
    onError: (e) => errorToast(e, 'No se pudo crear el usuario'),
  });
  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid grid-cols-2 gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-username">Usuario</Label>
            <Input id="u-username" autoFocus autoComplete="off" {...form.register('username')} />
            {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-fullname">Nombre completo</Label>
            <Input id="u-fullname" {...form.register('fullName')} />
            {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-email">Correo (opcional)</Label>
            <Input id="u-email" type="email" {...form.register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="u-role">Rol</Label>
            <select
              id="u-role"
              {...form.register('roleId')}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Selecciona…</option>
              {roles?.map((r) => (
                <option key={r.id} value={r.id}>
                  {roleLabel(r.name)}
                </option>
              ))}
            </select>
            {errors.roleId && <p className="text-xs text-destructive">{errors.roleId.message}</p>}
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="u-password">Contraseña inicial</Label>
            <Input id="u-password" type="password" autoComplete="new-password" {...form.register('password')} />
            <p className="text-xs text-muted-foreground">
              Mínimo 8 caracteres, con una mayúscula y un número.
            </p>
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>
          <DialogFooter className="col-span-2 mt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Edición: nombre, correo, rol, activo. Cambiar rol o desactivar cierra sus sesiones. */
function EditDialog({
  user,
  onOpenChange,
}: {
  user: UserItem | null;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { data: roles } = useRoles();
  const me = useAuth((s) => s.user);
  const [resetOpen, setResetOpen] = useState(false);

  const form = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    values: {
      fullName: user?.fullName ?? '',
      email: user?.email ?? '',
      roleId: user?.role.id ?? '',
      isActive: user?.isActive ?? true,
    },
  });
  const mutation = useMutation({
    mutationFn: (v: UserUpdateInput) => usersApi.update(user!.id, v),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Usuario actualizado');
      onOpenChange(false);
    },
    onError: (e) => errorToast(e, 'No se pudo actualizar el usuario'),
  });
  const { errors } = form.formState;
  const isSelf = user?.id === me?.id;

  return (
    <>
      <Dialog open={user !== null} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Editar usuario · <span className="text-muted-foreground">{user?.username}</span>
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
            className="grid grid-cols-2 gap-3"
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-fullname">Nombre completo</Label>
              <Input id="e-fullname" {...form.register('fullName')} />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-email">Correo (opcional)</Label>
              <Input id="e-email" type="email" {...form.register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-role">Rol</Label>
              <select
                id="e-role"
                disabled={isSelf}
                {...form.register('roleId')}
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
              >
                {roles?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r.name)}
                  </option>
                ))}
              </select>
              {isSelf && (
                <p className="text-xs text-muted-foreground">No puedes cambiar tu propio rol.</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="e-active">Estado</Label>
              <label
                htmlFor="e-active"
                className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm"
              >
                <input
                  id="e-active"
                  type="checkbox"
                  disabled={isSelf}
                  {...form.register('isActive')}
                  className="accent-[var(--primary)]"
                />
                Cuenta activa
              </label>
            </div>
            <p className="col-span-2 text-xs text-muted-foreground">
              Cambiar el rol o desactivar la cuenta cierra las sesiones abiertas del usuario.
            </p>
            <DialogFooter className="col-span-2 mt-1 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setResetOpen(true)}
                className="gap-1.5"
              >
                <KeyRound className="size-4" /> Restablecer contraseña
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {user && (
        <ResetPasswordDialog user={user} open={resetOpen} onOpenChange={setResetOpen} />
      )}
    </>
  );
}

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: UserItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const form = useForm<UserResetPasswordInput>({
    resolver: zodResolver(userResetPasswordSchema),
    values: { newPassword: '' },
  });
  const mutation = useMutation({
    mutationFn: (v: UserResetPasswordInput) => usersApi.resetPassword(user.id, v),
    onSuccess: () => {
      toast.success(`Contraseña de ${user.username} restablecida (la cuenta quedó desbloqueada)`);
      onOpenChange(false);
      form.reset();
    },
    onError: (e) => errorToast(e, 'No se pudo restablecer la contraseña'),
  });
  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Restablecer contraseña · {user.username}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
          className="grid gap-3"
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rp-new">Nueva contraseña</Label>
            <Input id="rp-new" type="password" autoFocus autoComplete="new-password" {...form.register('newPassword')} />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            También desbloquea la cuenta y cierra sus sesiones abiertas.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Restablecer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function statusBadge(u: UserItem) {
  if (!u.isActive) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <UserX /> Inactivo
      </Badge>
    );
  }
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date()) {
    return <Badge variant="destructive">Bloqueado</Badge>;
  }
  return <Badge variant="secondary">Activo</Badge>;
}

export function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', { page, search, includeInactive }],
    queryFn: () =>
      usersApi.list({ page, search: search || undefined, includeInactive: includeInactive || undefined }),
  });

  const columns: Column<UserItem>[] = [
    {
      header: 'Usuario',
      cell: (u) => (
        <div>
          <p className="font-medium">{u.username}</p>
          <p className="text-xs text-muted-foreground">{u.fullName}</p>
        </div>
      ),
    },
    {
      header: 'Correo',
      cell: (u) => <span className="text-muted-foreground">{u.email ?? '—'}</span>,
    },
    { header: 'Rol', cell: (u) => <Badge variant="outline">{roleLabel(u.role.name)}</Badge> },
    { header: 'Estado', cell: statusBadge },
    {
      header: 'Creado',
      cell: (u) => <span className="tnum text-muted-foreground">{formatDate(u.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Cuentas y roles del sistema. Toca un usuario para editarlo o restablecer su contraseña.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        page={page}
        onPageChange={setPage}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar por usuario o nombre…"
        onRowClick={setEditing}
        emptyMessage="No hay usuarios para esta búsqueda"
        toolbar={
          <>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => {
                  setIncludeInactive(e.target.checked);
                  setPage(1);
                }}
                className="accent-[var(--primary)]"
              />
              Incluir inactivos
            </label>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" /> Nuevo usuario
            </Button>
          </>
        }
      />

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditDialog user={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
