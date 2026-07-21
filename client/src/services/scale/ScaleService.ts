import type { ScaleDriver, ScaleReading, Unsubscribe } from './types';

export interface ScaleServiceOptions {
  /** Lecturas consecutivas requeridas para considerar el peso estable (RF-06.4). */
  stableSamples: number;
  /** Variación máxima entre esas lecturas para considerarlas estables. */
  stableDeltaKg: number;
}

/** Envuelve un `ScaleDriver` intercambiable con la lógica de estabilidad (docs/02 §6). */
export class ScaleService {
  constructor(
    private readonly driver: ScaleDriver,
    private readonly opts: ScaleServiceOptions,
  ) {}

  get status(): ScaleDriver['status'] {
    return this.driver.status;
  }

  connect(): Promise<void> {
    return this.driver.connect();
  }

  disconnect(): Promise<void> {
    return this.driver.disconnect();
  }

  tare(): Promise<void> {
    return this.driver.tare();
  }

  /** Pass-through para el display en vivo (número fluctuando, sin filtrar). */
  onReading(cb: (r: ScaleReading) => void): Unsubscribe {
    return this.driver.onReading(cb);
  }

  /** Resuelve solo cuando hay N lecturas consecutivas dentro del delta (RF-06.4). */
  captureStableWeight(timeoutMs = 15000): Promise<ScaleReading> {
    return new Promise((resolve, reject) => {
      const buffer: ScaleReading[] = [];
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error('SCALE_TIMEOUT'));
      }, timeoutMs);

      const unsubscribe = this.driver.onReading((r) => {
        buffer.push(r);
        if (buffer.length > this.opts.stableSamples) buffer.shift();
        if (buffer.length === this.opts.stableSamples) {
          const weights = buffer.map((b) => b.weightKg);
          const spread = Math.max(...weights) - Math.min(...weights);
          if (spread <= this.opts.stableDeltaKg) {
            clearTimeout(timer);
            unsubscribe();
            resolve(buffer[buffer.length - 1] as ScaleReading);
          }
        }
      });
    });
  }
}
