/**
 * Orquestador de las pruebas E2E de negocio (Fase 14, RF de calidad).
 * Corre todos los scripts/test-*.mts EN ORDEN (algunos asumen estado dejado
 * por fases anteriores — ej. 9c asume que 9a/9b ya corrieron al menos una
 * vez) y agrega un resumen único con código de salida correcto para CI.
 *
 * Uso: npx tsx scripts/run-e2e.mts   (requiere `npm run dev` corriendo)
 *      npm run test:e2e              (script equivalente en package.json)
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

/** Orden documentado en CLAUDE.md — no alfabético (10/11/12/13 irían antes que 9a-9c). */
const SUITES = [
  'test-9a.mts',
  'test-9b.mts',
  'test-9c.mts',
  'test-10.mts',
  'test-11.mts',
  'test-12.mts',
  'test-13.mts',
  'test-19.mts',
  'test-realtime.mts',
];

const RESULT_LINE = /Resultado:\s*(\d+)\s*PASS,\s*(\d+)\s*FAIL/;

async function checkServer(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3000/api/v1/health');
    return res.ok;
  } catch {
    return false;
  }
}

function runSuite(file: string): Promise<{ file: string; code: number; pass: number; fail: number }> {
  return new Promise((resolve) => {
    console.log(`\n${'─'.repeat(60)}\n▶ ${file}\n${'─'.repeat(60)}`);
    // Node directo con --import tsx (en vez de `npx tsx`, shell:true): en
    // Windows, shell:true pasa por cmd.exe y corta rutas con espacios como
    // "Sistema Gaby" al reconstruir el args array — spawn sin shell evita el
    // problema por completo (CreateProcess maneja el array nativamente).
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(dir, file)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
      output += chunk.toString();
    });
    child.on('close', (code) => {
      const match = RESULT_LINE.exec(output);
      resolve({
        file,
        code: code ?? 1,
        pass: match ? Number(match[1]) : 0,
        fail: match ? Number(match[2]) : code === 0 ? 0 : 1,
      });
    });
  });
}

if (!(await checkServer())) {
  console.error(
    '\n❌ El server no responde en http://localhost:3000/api/v1/health — arranca "npm run dev" primero.',
  );
  process.exit(1);
}

const results = [];
for (const suite of SUITES) {
  results.push(await runSuite(suite));
}

console.log(`\n${'═'.repeat(60)}\nResumen E2E\n${'═'.repeat(60)}`);
let totalPass = 0;
let totalFail = 0;
let anyProcessFailed = false;
for (const r of results) {
  totalPass += r.pass;
  totalFail += r.fail;
  if (r.code !== 0) anyProcessFailed = true;
  const status = r.code === 0 ? '✅' : '❌';
  console.log(`${status} ${r.file.padEnd(20)} ${r.pass} PASS, ${r.fail} FAIL${r.code !== 0 ? ' (proceso terminó con error)' : ''}`);
}
console.log(`${'─'.repeat(60)}\nTotal: ${totalPass} PASS, ${totalFail} FAIL en ${results.length} suites`);

process.exit(anyProcessFailed || totalFail > 0 ? 1 : 0);
