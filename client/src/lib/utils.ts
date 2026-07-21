import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formato regional (Fase 4 §2.3): COP sin decimales, punto de miles. */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Peso con coma decimal: 44,980 kg */
export function formatWeight(kg: number, decimals = 3): string {
  return `${new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(kg)} kg`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date(date));
}

/**
 * Fechas "puras" (columnas date: producción, ventas, gastos) — se formatean
 * en UTC para no correrse un día al convertir a América/Bogotá.
 */
export function formatDateOnly(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date));
}

/** Fecha y hora (auditoría, respaldos): 10/07/2026, 04:26 p. m. */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date(date));
}

/** Fecha local de hoy en formato YYYY-MM-DD (para inputs type="date"). */
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

/** Tamaño de archivo legible: 1536 → "1,5 KB" (respaldos). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(value)} ${units[i]}`;
}

/** Cantidad con hasta 3 decimales y coma decimal (sin unidad). */
export function formatQty(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3 }).format(n);
}
