# Fase 5 — Backend (núcleo)
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Completada y verificada

---

## 1. Qué se construyó

### Monorepo (npm workspaces)
```
package.json          # workspaces: shared, server, client · scripts unificados
shared/               # @gaby/shared — el contrato (AD-02, AD-09)
server/               # @gaby/server — Clean Architecture 4 capas (AD-03)
database/             # schema.prisma + migraciones + seed
uploads/  backups/    # datos locales (git-ignored)
.env.example          # plantilla; el real vive en server/.env (git-ignored)
```

### `@gaby/shared` — contrato compartido
- `types/enums.ts` — enums espejo de Prisma + **máquina de transiciones** de producción (`PRODUCTION_TRANSITIONS`).
- `permissions/` — matriz recurso×acción tipada, `PermissionKey` ("recipes:update"), helper `can()`.
- `schemas/` — Zod: `loginSchema`, `paginationSchema`, `dateRangeSchema` (crecerá por módulo).
- `events/` — catálogo tipado Socket.IO (`ServerToClientEvents`); `ClientToServerEvents` vacío **por diseño** (AD-05: el socket nunca muta).
- `constants/` — códigos de error estables, claves de configuración, defaults.

### `@gaby/server` — núcleo
- `config/env.ts` — validación Zod del entorno: si falta una variable, **no arranca** y dice cuál.
- `domain/errors/` — jerarquía `AppError` (NotFound, Validation, Conflict, Unauthorized, Forbidden, BusinessRule).
- `presentation/http/middleware/` — `errorHandler` (envelope único `{ error: { code, message, details } }`), `notFound`, `validate` (Zod de shared).
- `infrastructure/` — Prisma client único, logger pino (+ pino-http), estructura para auth/realtime/backup.
- `container.ts` — DI por composición manual tipada (sin framework: verificable por el compilador).
- **Flujo vertical de referencia (catálogos)** que fija el patrón para todos los módulos:
  `routes → validate → controller → use case → interfaz de repositorio → Prisma`.

### Base de datos (PostgreSQL 16 local)
- BD `sistema_gaby` creada; **2 migraciones aplicadas**:
  1. `init` — las 24 tablas del modelo (Fase 3).
  2. `checks_and_immutability` — 8 restricciones CHECK + **triggers `prevent_mutation()`** sobre `stock_movements`, `deliveries`, `audit_logs` y `reports`.
- **Seed ejecutado**: 4 roles + permisos, 4 usuarios, 7 unidades, 16 categorías, 3 proveedores, 19 productos con lotes, 3 recetas costeadas, configuración del sistema.

## 2. Verificaciones realizadas

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` en shared y server | ✅ Sin errores |
| `GET /api/v1/health` | ✅ `{ data: { status: "ok" } }` |
| `GET /api/v1/catalog/units` | ✅ 7 unidades con factores de conversión |
| `GET /api/v1/catalog/categories?kind=RECIPE` | ✅ Filtro validado por Zod |
| Ruta inexistente | ✅ Envelope de error `NOT_FOUND` |
| `UPDATE audit_logs` directo en SQL | ✅ **Rechazado por trigger**: "Tabla append-only: audit_logs no permite UPDATE" |

## 3. Notas de entorno

- Node 24 · npm 11 · PostgreSQL 16 (servicio `postgresql-x64-16`).
- La contraseña del usuario `postgres` **fue restablecida** (el usuario no la recordaba) mediante el procedimiento estándar (`pg_hba.conf` → trust temporal → `ALTER ROLE` → restauración). La nueva credencial vive únicamente en `server/.env` (`DATABASE_URL`), excluido de git. `pg_hba.conf` quedó restaurado; hay un respaldo en `data/pg_hba.conf.bak-gaby`.
- Advertencia conocida: Prisma 6 avisa que `package.json#prisma` se reemplaza por `prisma.config.ts` en Prisma 7 — se migrará cuando se actualice la major.

## 4. Cómo ejecutar

```powershell
npm install                # una vez
npm run db:migrate         # aplicar migraciones
npm run db:seed            # datos de prueba
npm run dev:server         # API en http://localhost:3000/api/v1
npm run db:studio          # explorador visual de la BD
```

Usuarios seed: `admin` · `bodega` · `cocina` · `auditor` — contraseña `Gaby2026*`.

## 5. Deuda registrada para fases siguientes

- Los endpoints de catálogo quedan **sin auth hasta la Fase 7** (TODO marcado en `routes/index.ts`).
- Socket.IO se monta en `main.ts` en la Fase 8 (punto de anclaje comentado).
- El decorador `withAudit` y `withTransaction` se implementan en la Fase 7/9 junto con los primeros casos de uso mutadores.

---

*Siguiente fase (previa aprobación): **Fase 6 — Frontend**: scaffolding de Vite + React 19 + Tailwind + shadcn/ui con los tokens de la Fase 4, router con las rutas de los tres módulos, apiClient tipado y layout base.*
