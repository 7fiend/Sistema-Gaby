/**
 * Configuración de entorno validada con Zod (RNF: falla rápido).
 * Si falta o es inválida una variable, el servidor NO arranca y dice cuál.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url({ message: 'DATABASE_URL debe ser una URL postgresql://' }),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET: mínimo 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET: mínimo 32 caracteres'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).default(7),
  UPLOADS_DIR: z.string().default('../uploads'),
  BACKUPS_DIR: z.string().default('../backups'),
  PG_BIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // Antes del logger: el logger depende de esta config
  console.error(`❌ Configuración de entorno inválida (revisa server/.env):\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;
export const isDev = env.NODE_ENV === 'development';
