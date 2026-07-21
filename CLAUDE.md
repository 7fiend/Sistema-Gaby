# Sistema Gaby — ERP local para restaurante

ERP offline-first (localhost) para un restaurante en Colombia: recetas con costeo,
inventario con báscula, producción diaria, cocina en tiempo real, reportes y auditoría.

## ⚡ Contexto inmediato

**Lee `docs/00-estado-del-proyecto.md` PRIMERO** — contiene el estado exacto, qué falta
(con detalle por entrega) y las convenciones. El proyecto avanza **por fases aprobadas
por el cliente**: cada fase se construye, se verifica en ejecución real (typecheck +
pruebas E2E + navegador) y se documenta en `docs/` antes de pedir aprobación para la
siguiente. **No avanzar de fase sin aprobación explícita del usuario.**

- Completado: Fases 1–16 (hoja de ruta original: 9a recetas+inventario · 9b producción+ventas+gastos · 9c dashboard+usuarios+configuración · 10 bodega+báscula · 11 módulo cocina · 12 reportes · 13 auditoría+respaldos · 14 pruebas · 15 optimización · 16 documentación) + Fase 17 (fuera de la hoja de ruta, pedida por el cliente: entrada de inventario por costo total, precio de venta editable en Recetas).
- **Sin fase siguiente definida.** Si el cliente pide trabajo nuevo, proponer la siguiente fase (18) y esperar aprobación antes de construir, igual que las anteriores.

## Comandos

```powershell
npm run dev              # server :3000 + client :5173 (tsx watch + Vite HMR)
npm run typecheck        # los 3 workspaces
npm run db:migrate       # prisma migrate dev (workspace server)
npm run db:seed          # datos de prueba (idempotente, upserts)
npm run db:studio        # explorador de BD
npm run build -w client  # build de producción del cliente (server no necesita build, corre con tsx)
npm test                 # unit + integración (Vitest, server) — requiere BD de prueba sistema_gaby_test
npm run test:e2e         # las 8 suites E2E en un solo comando (requiere npm run dev corriendo)
```
Suites E2E sueltas: `npx tsx scripts/test-9a.mts` (y `9b`/`9c`/`10`/`11`/`12`/`13`/`realtime`) —
detalle de qué cubre cada una en `docs/14-pruebas.md`.

Usuarios seed (clave `Gaby2026*`): `admin`, `bodega`, `cocina`, `auditor`.
PostgreSQL 16 local, BD `sistema_gaby`; `DATABASE_URL` en `server/.env` (no versionado, copiar de
`.env.example`). BD de pruebas separada `sistema_gaby_test` para Vitest — `server/.env.test`.

## Arquitectura (resumen — detalle en docs/02)

Monorepo npm workspaces: `client/` (React 19 + Vite + Tailwind v4 + shadcn/ui),
`server/` (Express 5 + Prisma 6 + Socket.IO), `shared/` (Zod + tipos + eventos +
permisos — **fuente única** front/back), `database/` (schema.prisma + migraciones + seed).

Backend en 4 capas: `domain` (entidades, servicios puros como costeo/FEFO, interfaces
de repositorio) → `application` (casos de uso agrupados por agregado, puertos IEventBus/
IAuditLogger/ITokenService) → `infrastructure` (Prisma, JWT, Socket.IO) → `presentation`
(rutas/controllers/middleware). DI manual en `container.ts`. **El dominio no importa nada externo.**

## Reglas inquebrantables

1. Zod de `@gaby/shared` valida en frontend Y backend — nunca duplicar esquemas.
2. Socket.IO **solo notifica** (payloads = ids); toda mutación entra por REST; eventos se publican después del commit.
3. `stock_movements`, `deliveries`, `audit_logs`, `reports` son **append-only** (triggers de BD lo bloquean); correcciones = movimientos compensatorios.
4. Caso de uso mutador = transacción + auditoría + evento. Costos históricos jamás se reescriben (snapshots).
5. El peso SIEMPRE viene de la báscula/simulador y la tolerancia se valida EN EL SERVIDOR.
6. Dinero/cantidades: `Decimal` en BD; redondeos solo con helpers de `domain/services/costing.ts`.
7. Socket.IO se adjunta al httpServer DESPUÉS de montar Express (ver comentario en `infrastructure/realtime/socket.ts`).
8. UI: español, formato es-CO (`formatCOP`/`formatWeight`/`formatDate` en `client/src/lib/utils.ts`), clase `tnum` en números, `DataTable` común, tokens de diseño de `docs/04`.
9. Antes de crear cualquier gráfico (dashboard, reportes): leer la skill `dataviz`.

## Documentación por fase

`docs/00` estado maestro · `01` análisis · `02` arquitectura · `03` datos · `04` UI/UX ·
`05` backend · `06` frontend · `07` auth · `08` tiempo real · `09a` recetas+inventario ·
`09b` producción+ventas+gastos · `09c` dashboard+usuarios+configuración · `10` bodega+báscula ·
`11` cocina · `12` reportes · `13` auditoría+respaldos · `14` pruebas · `15` optimización ·
`16` documentación (README, manuales por módulo, guías de instalación/migración/actualización) ·
`17` costeo por total + precio de venta editable · `18` menú semanal + recomendación por
inventario + rutina de aseo (fases fuera de la hoja de ruta original, pedidas por el cliente).
Cada nueva fase agrega su doc siguiendo el mismo formato (qué se construyó, decisiones, verificaciones).
