# Fase 8 — Comunicación en Tiempo Real
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Completada y verificada

---

## 1. Arquitectura (recordatorio de AD-05)

**El socket solo notifica; jamás muta.** Toda escritura entra por REST con su
autorización y validación. Los eventos llevan payloads mínimos (ids) y el cliente
re-consulta por REST vía invalidación de React Query → una sola fuente de verdad.

```
Caso de uso (tras commit) ──► IEventBus.publish(evento, payload, salas)
                                   │ (puerto de application)
                                   ▼
                     SocketIoEventBus (infrastructure)
                                   │ namespace /realtime
                     ┌─────────────┼──────────────┐
                 room:admin   room:inventory   room:kitchen
                     │             │              │
              React Query invalida las queries mapeadas por evento
```

## 2. Servidor

- **Namespace `/realtime`** con handshake autenticado: el cliente envía el **mismo JWT** de la API en `auth.token`; sin token válido la conexión se rechaza (`UNAUTHORIZED`).
- **Salas por rol**: ADMIN y AUDITOR entran a las tres salas (supervisión total); INVENTORY a `room:inventory`; KITCHEN a `room:kitchen`.
- **`IEventBus`** (puerto en `application/ports`): los casos de uso publican hechos tipados contra el catálogo de `@gaby/shared` sin conocer Socket.IO. Regla documentada: publicar **después del commit**.
- `ClientToServerEvents = {}` — el servidor no escucha nada del cliente, por diseño.
- Ruta `POST /dev/realtime-test` (solo `NODE_ENV=development`) para probar el canal sin casos de uso mutadores.

### Bug encontrado y corregido
Socket.IO adjuntado al `httpServer` **antes** que Express hacía que ambos respondieran
las peticiones de polling (`ERR_HTTP_HEADERS_SENT` → crash). Solución: `new Server()`
sin adjuntar, montar Express, y `io.attach(httpServer)` **al final** — así Socket.IO
envuelve los listeners y solo le pasa a Express lo que no es suyo. Queda comentado en
`socket.ts` para que nadie lo "simplifique" de vuelta.

## 3. Cliente

- `lib/socket.ts`: conexión única al namespace `/realtime` a través del **proxy de Vite** (`/socket.io` con `ws: true`) — mismo origen, sin CORS.
- `auth` **como función**: cada reconexión toma el access token vigente del store; si el token expiró, `connect_error UNAUTHORIZED` dispara `tryRefreshSession()` y reintenta.
- **Mapa evento → invalidaciones** central: p. ej. `delivery:completed` invalida `['production']`, `['products']` y `['dashboard']`. Las pantallas no saben de sockets: solo ven queries que se refrescan.
- `onSocketEvent()` para suscripciones puntuales de UI (toasts, monitor de cocina).
- `RealtimeProvider` conecta al autenticarse y desconecta al salir; `stores/realtime.ts` expone el estado (`connected/connecting/disconnected`) y la topbar muestra **"● en vivo"** permanente (Fase 4 §1.4).

## 4. Verificaciones (ejecución real)

| Prueba | Resultado |
|---|---|
| Conexión sin token → rechazada `UNAUTHORIZED` | ✅ |
| Conexión con JWT de admin → conectada y unida a salas | ✅ |
| `POST /dev/realtime-test` → evento `alert:new` recibido por el cliente en `room:admin` | ✅ |
| Navegador: indicador **"● en vivo"** verde en topbar tras login (socket vía proxy Vite) | ✅ |
| `tsc --noEmit` server y client | ✅ |

---

*Siguiente fase (previa aprobación): **Fase 9 — Módulo Administrador**: el corazón funcional — CRUD de recetas con versionado y costeo, inventario con lotes y movimientos, producción diaria con explosión de ingredientes, ventas, gastos, usuarios, configuración y el dashboard real con KPIs.*
