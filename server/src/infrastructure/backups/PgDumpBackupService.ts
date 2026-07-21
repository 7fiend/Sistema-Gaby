import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';
import { env } from '../../config/env.js';

function binPath(name: string): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  return env.PG_BIN ? path.join(env.PG_BIN, exe) : exe;
}

/** Argumentos de conexión + contraseña por variable de entorno (nunca en argv ni en la URL cruda: pg_dump no reconoce el `?schema=` que agrega Prisma a DATABASE_URL). */
function pgConnection(): { args: string[]; env: NodeJS.ProcessEnv } {
  const url = new URL(env.DATABASE_URL);
  const args = [
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username),
    '-d', decodeURIComponent(url.pathname.slice(1)),
  ];
  return { args, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } };
}

function waitForExit(child: ReturnType<typeof spawn>, label: string): Promise<void> {
  let stderr = '';
  child.stderr?.on('data', (d: Buffer) => {
    stderr += d.toString();
  });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${label} salió con código ${code}`));
    });
  });
}

/**
 * Respaldo/restauración vía `pg_dump`/`psql` (RF-13.2). Dump en texto plano
 * (`--clean --if-exists`: incluye DROP IF EXISTS, así el mismo archivo sirve
 * para restaurar sobre una BD existente) comprimido con gzip en streaming.
 */
export class PgDumpBackupService {
  async dump(destPath: string): Promise<{ sizeBytes: number }> {
    const { args, env: pgEnv } = pgConnection();
    const child = spawn(
      binPath('pg_dump'),
      [...args, '--format=plain', '--clean', '--if-exists', '--no-owner', '--no-privileges'],
      { stdio: ['ignore', 'pipe', 'pipe'], env: pgEnv },
    );

    try {
      await Promise.all([
        pipeline(child.stdout, createGzip(), createWriteStream(destPath)),
        waitForExit(child, 'pg_dump'),
      ]);
    } catch (err) {
      await unlink(destPath).catch(() => undefined);
      throw err instanceof Error ? err : new Error(String(err));
    }

    const { size } = await stat(destPath);
    return { sizeBytes: size };
  }

  async restore(srcPath: string): Promise<void> {
    const { args, env: pgEnv } = pgConnection();
    const child = spawn(binPath('psql'), [...args, '-v', 'ON_ERROR_STOP=1'], {
      stdio: ['pipe', 'ignore', 'pipe'],
      env: pgEnv,
    });

    await Promise.all([
      pipeline(createReadStream(srcPath), createGunzip(), child.stdin),
      waitForExit(child, 'psql'),
    ]);
  }
}
