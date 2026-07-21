import { useEffect, useRef, useState } from 'react';
import type { ScaleService } from './ScaleService';
import type { ScaleDriver, ScaleReading } from './types';

export type ScaleColor = 'gray' | 'green' | 'red';

interface UseScaleReadingOptions {
  stableSamples: number;
  stableDeltaKg: number;
  /** Cantidad pendiente contra la que se compara el color — solo UX (RN-01: el backend re-valida). */
  pending: number;
  toleranceKg: number;
}

interface ScaleReadingState {
  reading: ScaleReading | null;
  status: ScaleDriver['status'];
  isStable: boolean;
  /** gris = fluctuando o desconectado, verde = estable y dentro de tolerancia, rojo = estable pero fuera. */
  color: ScaleColor;
  /** Últimas N lecturas usadas para decidir estabilidad — se envían como evidencia (RF-06.4). */
  buffer: ScaleReading[];
}

/** Se suscribe a un `ScaleService` y calcula el estado visual del panel de pesaje. */
export function useScaleReading(
  scale: ScaleService | null,
  opts: UseScaleReadingOptions,
): ScaleReadingState {
  const bufferRef = useRef<ScaleReading[]>([]);
  const [reading, setReading] = useState<ScaleReading | null>(null);
  const [status, setStatus] = useState<ScaleDriver['status']>(scale?.status ?? 'disconnected');

  useEffect(() => {
    bufferRef.current = [];
    setReading(null);
    if (!scale) return;
    const unsubscribe = scale.onReading((r) => {
      bufferRef.current = [...bufferRef.current, r].slice(-opts.stableSamples);
      setReading(r);
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, opts.stableSamples]);

  useEffect(() => {
    if (!scale) return;
    const poll = setInterval(() => setStatus(scale.status), 200);
    return () => clearInterval(poll);
  }, [scale]);

  const buffer = bufferRef.current;
  const isStable =
    status === 'connected' &&
    buffer.length === opts.stableSamples &&
    Math.max(...buffer.map((b) => b.weightKg)) - Math.min(...buffer.map((b) => b.weightKg)) <=
      opts.stableDeltaKg;

  const withinTolerance =
    isStable && reading !== null && Math.abs(reading.weightKg - opts.pending) <= opts.toleranceKg;

  const color: ScaleColor = !isStable ? 'gray' : withinTolerance ? 'green' : 'red';

  return { reading, status, isStable, color, buffer };
}
