/**
 * Carga `.env.test` ANTES de que cualquier módulo de la app importe
 * `config/env.ts` (que hace `import 'dotenv/config'`, cargando `.env`).
 * `dotenv` no sobrescribe variables ya definidas: `DATABASE_URL`/`NODE_ENV`
 * quedan fijas en la BD de prueba (`sistema_gaby_test`) y el resto de
 * variables (secretos JWT, PG_BIN, etc.) se heredan de `.env` normalmente.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(dir, '../.env.test') });

if (!process.env.DATABASE_URL?.includes('sistema_gaby_test')) {
  throw new Error(
    'DATABASE_URL no apunta a sistema_gaby_test — revisa server/.env.test antes de correr pruebas de integración (evita tocar la BD real por error).',
  );
}
