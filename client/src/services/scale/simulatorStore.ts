import { create } from 'zustand';

export type SimulatorForcedStatus = 'disconnected' | 'error' | null;

/**
 * Estado compartido entre `SimulatorDriver` y `SimulatorPanel` (docs/02 §6):
 * el panel flotante controla el peso objetivo y la fluctuación; el driver
 * los lee en cada tick para generar lecturas realistas.
 */
interface SimulatorState {
  targetWeightKg: number;
  fluctuationPct: number;
  forcedStatus: SimulatorForcedStatus;
  setTarget: (kg: number) => void;
  setFluctuation: (pct: number) => void;
  setForcedStatus: (status: SimulatorForcedStatus) => void;
}

export const useSimulatorStore = create<SimulatorState>((set) => ({
  targetWeightKg: 0,
  fluctuationPct: 0.6,
  forcedStatus: null,
  setTarget: (targetWeightKg) => set({ targetWeightKg: Math.max(0, targetWeightKg) }),
  setFluctuation: (fluctuationPct) => set({ fluctuationPct: Math.max(0, fluctuationPct) }),
  setForcedStatus: (forcedStatus) => set({ forcedStatus }),
}));
