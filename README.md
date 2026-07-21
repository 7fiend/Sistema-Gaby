# 🍲 Sistema Gaby — ERP para Restaurante

Sistema ERP local (offline-first) para administrar la operación diaria de un restaurante:
**recetas con costeo automático, inventario con báscula, producción diaria, monitor de
cocina en tiempo real, ventas, gastos, reportes y auditoría inmutable.**

> 📋 **Estado actual y hoja de ruta:** ver [`docs/00-estado-del-proyecto.md`](docs/00-estado-del-proyecto.md)

## Inicio rápido

```powershell
npm install
copy server\.env.example server\.env    # editar DATABASE_URL y los secretos JWT (ver abajo)
npm run db:migrate
npm run db:seed
npm run dev
```

| | URL |
|---|---|
| Aplicación (admin) | http://localhost:5173 |
| Bodega (kiosco) | http://localhost:5173/bodega |
| Cocina (kiosco) | http://localhost:5173/cocina |
| API | http://localhost:3000/api/v1 |

**Usuarios de prueba** (contraseña `Gaby2026*`): `admin` · `bodega` · `cocina` · `auditor`

**Requisitos:** Node.js 20+, PostgreSQL 16 local (cliente `psql`/`pg_dump` instalado si vas a
usar Respaldos). Guía paso a paso para una instalación completamente limpia:
[`docs/16-guia-instalacion.md`](docs/16-guia-instalacion.md).

## Variables de entorno

`server/.env.example` y `client/.env.example` traen cada variable comentada. Ninguno de los dos
`.env` reales se versiona. Las que casi siempre hay que tocar al instalar en un equipo nuevo:

| Variable | Dónde | Qué es |
|---|---|---|
| `DATABASE_URL` | `server/.env` | Cadena de conexión a PostgreSQL (usuario, contraseña, host, BD) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | `server/.env` | Secretos de firma de sesión — generar uno propio, nunca reusar el de otro entorno |
| `PG_BIN` | `server/.env` | Carpeta `bin` de PostgreSQL, para que Respaldos encuentre `pg_dump`/`psql` |
| `VITE_API_URL` | `client/.env.production` (solo si aplica) | URL de la API, solo si el cliente se sirve desde un host distinto — ver [migración](docs/16-guia-migracion.md) |

## Estructura

```
client/     Frontend — React 19, Vite, Tailwind v4, shadcn/ui, React Query, Socket.IO
server/     Backend — Express 5, Prisma, Clean Architecture (domain/application/infrastructure/presentation)
shared/     Contrato compartido — esquemas Zod, tipos, eventos, permisos
database/   schema.prisma, migraciones, seed
docs/       Documentación por fase (análisis → arquitectura → ... → manuales de usuario)
scripts/    Pruebas E2E (scripts/test-*.mts) y el orquestador run-e2e.mts
server/tests/  Pruebas unitarias e integración (Vitest)
uploads/    Archivos subidos (reportes exportados)               [git-ignored]
backups/    Respaldos de PostgreSQL (.sql.gz)                    [git-ignored]
```

## Módulos

- **Administrador** (`/admin`): dashboard, producción, recetas, inventario, ventas, gastos,
  reportes, usuarios, auditoría, respaldos, configuración.
  Manual: [`docs/16-manual-admin.md`](docs/16-manual-admin.md)
- **Bodega** (`/bodega`): orden del día y entrega de ingredientes validada por báscula (±tolerancia).
  Manual: [`docs/16-manual-bodega.md`](docs/16-manual-bodega.md)
- **Cocina** (`/cocina`): monitor kiosco con la producción del día en tiempo real.
  Manual: [`docs/16-manual-cocina.md`](docs/16-manual-cocina.md)

Los tres módulos comparten el mismo backend; el acceso a cada uno depende del rol del usuario
(matriz completa en [`docs/01-analisis-funcional.md`](docs/01-analisis-funcional.md) §2).

## Comandos

```powershell
npm run dev              # server (:3000) + client (:5173) en paralelo, con recarga automática
npm run typecheck        # TypeScript en los 3 workspaces (sin emitir)
npm run build             # build de producción de client/ (shared/server no necesitan build)
npm run db:migrate        # aplica migraciones pendientes de Prisma
npm run db:seed           # datos de prueba (idempotente, se puede correr varias veces)
npm run db:studio         # explorador visual de la base de datos

npm test                  # unit + integración (Vitest, server/) — requiere BD de prueba, no el dev server
npm run test:e2e          # las 8 suites E2E de negocio en un solo comando — requiere `npm run dev` corriendo
```

Detalle de pruebas (BD de prueba dedicada, cómo correr una suite suelta, qué cubre cada una):
[`docs/14-pruebas.md`](docs/14-pruebas.md).

## Documentación

Cada fase de construcción tiene su propio documento en `docs/` con qué se construyó, decisiones
tomadas y cómo se verificó. El estado maestro (`docs/00`) es siempre el punto de partida.

| Doc | Contenido |
|---|---|
| [`00-estado-del-proyecto.md`](docs/00-estado-del-proyecto.md) | Estado maestro: qué está hecho, qué falta, convenciones, notas operativas |
| [`01-analisis-funcional.md`](docs/01-analisis-funcional.md) | Requisitos funcionales/de negocio, matriz de permisos |
| [`02-arquitectura.md`](docs/02-arquitectura.md) | Decisiones de arquitectura (monorepo, Clean Architecture, tiempo real) |
| [`03-modelo-de-datos.md`](docs/03-modelo-de-datos.md) | Modelo de datos completo |
| [`04-diseno-ui-ux.md`](docs/04-diseno-ui-ux.md) | Design system, tokens, mockups |
| `05` – `15` | Un documento por entrega técnica (backend, frontend, auth, tiempo real, cada módulo de negocio, reportes, auditoría/respaldos, pruebas, optimización) |
| `16-manual-*.md` | Manuales de usuario final por módulo (admin, bodega, cocina) |
| [`16-guia-instalacion.md`](docs/16-guia-instalacion.md) | Instalación completa en un PC nuevo, desde cero |
| [`16-guia-migracion.md`](docs/16-guia-migracion.md) | Mover la app a un servidor de red local o VPS |

## Producción / despliegue

Para producción local (un solo puerto, sin depender de Vite corriendo), ver
[`docs/16-guia-instalacion.md`](docs/16-guia-instalacion.md) §"Modo producción". Para mover la
instalación a otro equipo en la red o a un VPS, ver
[`docs/16-guia-migracion.md`](docs/16-guia-migracion.md).
