import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/stores/auth';
import { connectSocket, disconnectSocket } from '@/lib/socket';

/** Conecta el socket cuando hay sesión y lo cierra al salir. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const status = useAuth((s) => s.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status === 'authenticated') {
      connectSocket(queryClient);
      return () => disconnectSocket();
    }
    if (status === 'anonymous') disconnectSocket();
  }, [status, queryClient]);

  return children;
}
