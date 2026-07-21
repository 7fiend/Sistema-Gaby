# Fase 7 — Autenticación y Autorización
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Completada y verificada

---

## 1. Diseño

### Tokens (AD-08)
- **Access token JWT — 15 min**, firmado con `JWT_ACCESS_SECRET`, viaja en `Authorization: Bearer`. Payload: id, username, fullName, rol y **lista completa de permisos** → la autorización por request no toca la BD.
- **Refresh token opaco — 7 días**, 48 bytes aleatorios; solo su **SHA-256** se guarda (tabla `sessions`). Viaja en **cookie httpOnly** `gaby_refresh` con `path=/api/v1/auth` (el JS del cliente jamás puede leerla).
- **Rotación en cada uso**: cada refresh revoca el token anterior y emite uno nuevo. Los permisos se **re-leen de la BD** en la rotación → cambios de rol aplican en ≤15 min.
- **Detección de reutilización**: si llega un refresh token ya revocado (posible robo), se revocan **todas** las sesiones del usuario y queda evento `SECURITY`.

### Protecciones
- Argon2id para contraseñas.
- Mensaje idéntico para usuario inexistente/contraseña mala (no filtra información).
- **Bloqueo temporal** tras N intentos fallidos (N y minutos configurables en `app_settings`).
- `requirePermission('recurso:acción')`: middleware con la matriz de `@gaby/shared`; los rechazos quedan auditados (`auth.permission.denied`).
- Todos los eventos de auth escriben en `audit_logs` (append-only, protegida por trigger).

### Frontend
- Access token **solo en memoria** (Zustand, sin localStorage → mitiga XSS). Al recargar, `RequireAuth` reconstruye la sesión vía `/auth/refresh` con la cookie.
- `lib/api.ts`: ante un 401 hace **un** refresh compartido (aunque fallen varias requests a la vez) y reintenta; si falla, sesión anónima → `/login`.
- Guards por permiso en el router (`dashboard:read`, `delivery:read`, `kitchen:read`) + redirección al "hogar" del rol (`homeForRole`): INVENTORY→/bodega, KITCHEN→/cocina, ADMIN/AUDITOR→/admin. El backend siempre re-valida: los guards son UX.
- Login con React Hook Form + `loginSchema` (el mismo Zod del backend), errores en español, topbar con usuario real y logout.

## 2. Endpoints

| Método | Ruta | Protección |
|---|---|---|
| POST | `/auth/login` | pública (validada Zod) |
| POST | `/auth/refresh` | cookie httpOnly |
| POST | `/auth/logout` | cookie httpOnly |
| GET | `/auth/me` | Bearer |
| GET | `/catalog/units` · `/categories` | Bearer |
| GET | `/catalog/suppliers` | Bearer + `products:read` |

## 3. Verificaciones (todas en ejecución real)

| Prueba | Resultado |
|---|---|
| Endpoint protegido sin token → 401 | ✅ |
| Login con contraseña errada → `INVALID_CREDENTIALS` (mismo mensaje que usuario inexistente) | ✅ |
| Login admin → JWT con 39 permisos; `/auth/me` OK | ✅ |
| Refresh → access token nuevo y **cookie rotada** | ✅ |
| Reutilización del refresh viejo → **401 + revocación de todas las sesiones** | ✅ |
| Refresh tras logout → 401 | ✅ |
| Usuario `cocina` en `/catalog/suppliers` → **403 FORBIDDEN** | ✅ |
| 5 intentos fallidos en `bodega` → **ACCOUNT_LOCKED** (desbloqueada después para desarrollo) | ✅ |
| Navegador: `/admin` sin sesión → redirige a `/login`; login → dashboard con "Gabriela Administradora"; **F5 → sesión reconstruida sin pasar por login** | ✅ |
| Auditoría: 7 tipos de eventos registrados (success, failed, lock-triggered, locked, logout, permission.denied, reuse-detected) | ✅ |

## 4. Decisiones y notas

- Permisos en el JWT (no consulta por request): trade-off aceptado — un cambio de rol tarda hasta 15 min en aplicar, o es inmediato si se revoca la sesión desde administración.
- La **gestión de usuarios (CRUD)** se movió a la Fase 9: es una pantalla del módulo Administrador; esta fase entrega el mecanismo de seguridad completo del que esa pantalla dependerá.
- `sameSite=lax` + CORS con `credentials` ya configurado; con proxy de Vite todo es same-origin en dev.

---

*Siguiente fase (previa aprobación): **Fase 8 — Comunicación en tiempo real**: Socket.IO montado sobre el httpServer, handshake autenticado con el mismo JWT, salas por rol, `SocketIoEventBus` (puerto `IEventBus`) y cliente con invalidación de queries.*
