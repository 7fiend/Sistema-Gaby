import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@gaby/shared';
import { LoaderCircle } from 'lucide-react';
import { login } from './api';
import { useAuth, homeForRole } from '@/stores/auth';
import { ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  // Ya autenticado → a su módulo
  if (status === 'authenticated' && user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const authUser = await login(values);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? homeForRole(authUser.role), { replace: true });
    } catch (e) {
      setServerError(
        e instanceof ApiRequestError ? e.message : 'Error de conexión con el servidor',
      );
    }
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-8 shadow-sm">
        <div className="mb-7 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
            G
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight">Sistema Gaby</h1>
            <p className="text-xs text-muted-foreground">ERP de restaurante</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              {...form.register('username')}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...form.register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}

          <Button type="submit" disabled={isSubmitting} className="mt-1">
            {isSubmitting && <LoaderCircle className="size-4 animate-spin" />}
            Iniciar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
