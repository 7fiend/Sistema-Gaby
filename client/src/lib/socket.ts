import { io, type Socket } from 'socket.io-client';
import type { QueryClient } from '@tanstack/react-query';
import type { ServerToClientEvents } from '@gaby/shared';
import { useAuth } from '@/stores/auth';
import { useRealtime } from '@/stores/realtime';
import { tryRefreshSession } from './api';

type RealtimeSocket = Socket<ServerToClientEvents, Record<string, never>>;

let socket: RealtimeSocket | null = null;

/**
 * Mapa evento → claves de React Query a invalidar (AD-05):
 * el socket solo avisa; los datos SIEMPRE se re-consultan por REST.
 */
const INVALIDATIONS: Partial<Record<keyof ServerToClientEvents, string[][]>> = {
  'production:confirmed': [['production'], ['dashboard'], ['kitchen']],
  'production:status-changed': [['production'], ['dashboard'], ['kitchen']],
  'delivery:completed': [['production'], ['products'], ['dashboard'], ['kitchen']],
  'delivery:blocked': [['production'], ['alerts'], ['kitchen']],
  'stock:changed': [['products'], ['dashboard']],
  'stock:low': [['alerts'], ['dashboard']],
  'stock:expiring': [['alerts'], ['dashboard']],
  'recipe:cost-changed': [['recipes'], ['dashboard']],
  'sales:registered': [['sales'], ['dashboard']],
  'expense:created': [['expenses'], ['dashboard']],
  'alert:new': [['alerts']],
};

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export function connectSocket(queryClient: QueryClient): void {
  if (socket) return;
  const { setStatus } = useRealtime.getState();
  setStatus('connecting');

  socket = io(`${BASE_URL}/realtime`, {
    // auth como función: cada (re)conexión toma el token VIGENTE del store
    auth: (cb) => cb({ token: useAuth.getState().accessToken }),
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => setStatus('connected'));
  socket.on('disconnect', () => setStatus('disconnected'));
  socket.io.on('reconnect_attempt', () => setStatus('connecting'));

  // Token expirado al reconectar → refrescar sesión y reintentar
  socket.on('connect_error', (err) => {
    setStatus('disconnected');
    if (err.message === 'UNAUTHORIZED') {
      void tryRefreshSession().then((ok) => {
        if (ok) socket?.connect();
      });
    }
  });

  for (const [event, keys] of Object.entries(INVALIDATIONS)) {
    socket.on(event as keyof ServerToClientEvents, () => {
      for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
    });
  }
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  useRealtime.getState().setStatus('disconnected');
}

/** Suscripción puntual para UI (toasts, pantalla cocina). Devuelve unsubscribe. */
export function onSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E],
): () => void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  socket?.on(event, handler as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return () => socket?.off(event, handler as any);
}
