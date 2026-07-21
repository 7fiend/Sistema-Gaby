/**
 * Contrato de báscula (docs/02-arquitectura.md §6, AD-06). El backend SIEMPRE
 * re-valida la tolerancia (RN-01) — esta capa solo captura y muestra lecturas.
 */
export interface ScaleReading {
  weightKg: number;
  stable: boolean;
  timestamp: number;
}

export type Unsubscribe = () => void;

export interface ScaleDriver {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readonly status: 'disconnected' | 'connecting' | 'connected' | 'error';
  onReading(cb: (r: ScaleReading) => void): Unsubscribe;
  tare(): Promise<void>;
}
