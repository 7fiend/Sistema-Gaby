/** Lectura tipada de app_settings con default si la clave no existe. */
export interface ISettingsRepository {
  getNumber(key: string, fallback: number): Promise<number>;
  getString(key: string, fallback: string): Promise<string>;
  /** Todas las claves con su valor JSON crudo (pantalla de configuración). */
  getAll(): Promise<Record<string, unknown>>;
  /** Upsert atómico de varias claves (PUT /settings). */
  setMany(entries: Record<string, unknown>): Promise<void>;
}
