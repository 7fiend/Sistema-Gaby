# Fase 6 — Frontend (base)
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Completada y verificada

---

## 1. Qué se construyó

### Stack
Vite 6 · React 19 · TypeScript estricto · **Tailwind CSS v4** (config CSS-first vía `@tailwindcss/vite`) · **shadcn/ui** (estilo new-york, 9 componentes base instalados) · React Router 7 · TanStack Query 5 · Zustand 5 · React Hook Form + Zod · lucide-react · socket.io-client (se usa en Fase 8).

### Decisiones técnicas
| # | Decisión | Justificación |
|---|---|---|
| FE-01 | **Proxy de Vite** (`/api`, `/socket.io` → `:3000`) y rutas relativas en el cliente | Cero CORS en desarrollo; en producción `VITE_API_URL` permite separar hosts sin tocar código (RNF-02). |
| FE-02 | Tokens del design system como **variables CSS** (`:root` / `.dark`) mapeadas con `@theme inline` | Exactamente los valores aprobados en Fase 4; shadcn/ui los consume sin adaptación; el modo oscuro es una clase (`dark`) controlada por Zustand persistido. |
| FE-03 | `lib/api.ts`: **cliente HTTP tipado único** que desenvuelve `{ data }` y convierte `{ error }` en `ApiRequestError(code, status, details)` | Los códigos de error estables de `@gaby/shared` llegan tipados a React Query; una sola implementación de fetch en todo el frontend. |
| FE-04 | React Query = estado del servidor; Zustand = solo UI (tema) | AD-10. `staleTime` 30 s porque en Fase 8 los eventos de socket invalidan queries. |
| FE-05 | Estructura por **features** (`features/auth`, `dashboard`, `delivery`, `kitchen`, …) | Cada módulo funcional es autocontenido (Fase 2 §3.2). |
| FE-06 | Formato regional en `lib/utils.ts`: `formatCOP`, `formatWeight`, `formatDate` (es-CO, America/Bogota) | Una sola fuente para `$ 1.250.000` y `44,980 kg` (Fase 4 §2.3). |

### Pantallas montadas
- **`/admin`** — AdminLayout real: sidebar con grupos Operación/Sistema (lucide icons), topbar con toggle de tema; Dashboard provisional que **consulta la API real** (verificación de cableado).
- **`/bodega`** y **`/cocina`** — shells con su layout base; Cocina fuerza modo oscuro (Fase 4 §3.3). Contenido real en Fases 10–11.
- **`/login`** — esqueleto visual; funcional en Fase 7.
- Rutas de módulos futuros → `PlaceholderPage` con la fase en que llegan.

## 2. Verificaciones realizadas

| Prueba | Resultado |
|---|---|
| `tsc --noEmit` en client | ✅ |
| Vite sirve la app (`GET :5173` → título "Sistema Gaby") | ✅ |
| Proxy `:5173/api/v1/health` → API `:3000` | ✅ |
| Render real en Chrome (`/admin`) | ✅ Dashboard muestra "7 unidades de medida cargadas" desde PostgreSQL |
| Toggle claro/oscuro | ✅ Ambos temas idénticos al mockup de Fase 4 |
| Consola del navegador | ✅ Sin errores ni warnings |

## 3. Notas

- shadcn instaló `radix-ui`, `sonner` y `next-themes`; hubo que añadir manualmente `class-variance-authority`, `clsx` y `tailwind-merge` (la CLI los asume presentes). El `sonner.tsx` generado usa `next-themes`; se adaptará a nuestro store de tema cuando se activen los toasts (Fase 9).
- Fuente Inter: por ahora stack de sistema; los archivos woff2 self-hosted se añaden en la Fase 15 (optimización) para cumplir RNF-01 sin bloquear el desarrollo.

## 4. Cómo ejecutar

```powershell
npm run dev            # server (:3000) + client (:5173) en paralelo
# o por separado: npm run dev:server / npm run dev:client
```

Rutas: `http://localhost:5173/admin` · `/bodega` · `/cocina` · `/login`.

---

*Siguiente fase (previa aprobación): **Fase 7 — Autenticación**: login JWT con refresh rotativo en cookie httpOnly, middleware de permisos, bloqueo por intentos, guards de rutas por rol y gestión de usuarios.*
