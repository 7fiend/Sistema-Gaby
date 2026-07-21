import type { ScaleDriver, ScaleReading, Unsubscribe } from './types';
import { useSimulatorStore } from './simulatorStore';

const TICK_MS = 150;
/** Ruido por debajo de este umbral (kg) se considera "asentado" en esta lectura. */
const SETTLE_THRESHOLD_KG = 0.01;

/**
 * Driver de simulación (v1, docs/02 §6): no hay báscula física conectada al
 * servidor, así que en esta fase el único driver real disponible es este.
 * Se activa con `VITE_SCALE_DRIVER=simulator`; el panel flotante (`SimulatorPanel`)
 * controla el peso objetivo, la fluctuación y permite forzar desconexión/error.
 */
export class SimulatorDriver implements ScaleDriver {
  private _status: ScaleDriver['status'] = 'disconnected';
  private readonly listeners = new Set<(r: ScaleReading) => void>();
  private interval: ReturnType<typeof setInterval> | null = null;

  get status(): ScaleDriver['status'] {
    return this._status;
  }

  async connect(): Promise<void> {
    this._status = 'connecting';
    await new Promise((resolve) => setTimeout(resolve, 250));
    this.interval = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  async disconnect(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this._status = 'disconnected';
  }

  async tare(): Promise<void> {
    useSimulatorStore.getState().setTarget(0);
  }

  onReading(cb: (r: ScaleReading) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private tick(): void {
    const { targetWeightKg, fluctuationPct, forcedStatus } = useSimulatorStore.getState();

    if (forcedStatus === 'disconnected') {
      this._status = 'disconnected';
      return;
    }
    if (forcedStatus === 'error') {
      this._status = 'error';
      return;
    }
    this._status = 'connected';

    const noiseRange = targetWeightKg * (fluctuationPct / 100);
    const noise = noiseRange > 0 ? (Math.random() * 2 - 1) * noiseRange : 0;
    const weightKg = Math.round((targetWeightKg + noise) * 1000) / 1000;
    const stable = Math.abs(noise) <= SETTLE_THRESHOLD_KG;

    const reading: ScaleReading = { weightKg, stable, timestamp: Date.now() };
    for (const cb of this.listeners) cb(reading);
  }
}
