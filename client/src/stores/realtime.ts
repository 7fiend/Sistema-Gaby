import { create } from 'zustand';

/** Estado de la conexión en tiempo real, visible en las tres pantallas. */
export type RealtimeStatus = 'disconnected' | 'connecting' | 'connected';

interface RealtimeState {
  status: RealtimeStatus;
  setStatus: (s: RealtimeStatus) => void;
}

export const useRealtime = create<RealtimeState>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}));
