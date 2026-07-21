import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { can, type PermissionKey } from '@gaby/shared';
import { useAuth, homeForRole } from '@/stores/auth';
import { tryRefreshSession } from '@/lib/api';

/**
 * Guard de autenticación: al cargar (o recargar) la app intenta reconstruir
 * la sesión con la cookie httpOnly. El backend es la autoridad real; estos
 * guards son solo UX (evitan mostrar pantallas que la API rechazaría).
 */
export function RequireAuth({ permission }: { permission?: PermissionKey }) {
  const { user, status } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (status === 'unknown') void tryRefreshSession();
  }, [status]);

  if (status === 'unknown') {
    return (
      <div className="grid min-h-dvh place-items-center bg-background">
        <p className="text-sm text-muted-foreground">Restaurando sesión…</p>
      </div>
    );
  }

  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (permission && !can(user, permission)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  return <Outlet />;
}
