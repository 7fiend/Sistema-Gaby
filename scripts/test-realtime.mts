/** Prueba E2E del canal de tiempo real (Fase 8). Ejecutar con tsx. */
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';
let ok = 0;
let fail = 0;
const check = (name: string, cond: boolean) => {
  cond ? ok++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
};

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Gaby2026*' }),
  });
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

// 1. Sin token → rechazado
await new Promise<void>((resolve) => {
  const anon = io(`${BASE}/realtime`, { reconnection: false });
  const timer = setTimeout(() => {
    check('conexión sin token rechazada', false);
    anon.close();
    resolve();
  }, 4000);
  anon.on('connect', () => {
    clearTimeout(timer);
    check('conexión sin token rechazada', false);
    anon.close();
    resolve();
  });
  anon.on('connect_error', (err) => {
    clearTimeout(timer);
    check(`conexión sin token rechazada (${err.message})`, err.message === 'UNAUTHORIZED');
    anon.close();
    resolve();
  });
});

// 2. Con token → conecta, y 3. recibe evento del bus en room:admin
const token = await login();
await new Promise<void>((resolve) => {
  const socket = io(`${BASE}/realtime`, { auth: { token }, reconnection: false });
  const timer = setTimeout(() => {
    check('evento alert:new recibido', false);
    socket.close();
    resolve();
  }, 6000);

  socket.on('connect', () => {
    check('conexión autenticada OK', true);
    void fetch(`${BASE}/api/v1/dev/realtime-test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  socket.on('alert:new', (payload) => {
    clearTimeout(timer);
    check(
      `evento alert:new recibido ("${payload.message}")`,
      payload.message.includes('admin'),
    );
    socket.close();
    resolve();
  });

  socket.on('connect_error', (err) => {
    clearTimeout(timer);
    check(`conexión autenticada OK (error: ${err.message})`, false);
    resolve();
  });
});

console.log(`\nResultado: ${ok} PASS, ${fail} FAIL`);
// exitCode (no process.exit forzado): dar tiempo a que socket.io-client
// cierre sus handles de libuv antes de terminar — un exit() inmediato
// después de socket.close() puede pisar el cleanup y crashear en Windows
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)").
process.exitCode = fail > 0 ? 1 : 0;
