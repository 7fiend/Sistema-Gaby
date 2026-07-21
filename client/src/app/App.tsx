import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { router } from './router';
import { RealtimeProvider } from './RealtimeProvider';

/**
 * Estado del servidor = React Query (AD-10).
 * staleTime corto: los eventos de socket (Fase 8) invalidan queries,
 * así que no necesitamos refetch agresivo por tiempo.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <RouterProvider router={router} />
        <Toaster position="top-right" richColors />
      </RealtimeProvider>
    </QueryClientProvider>
  );
}
