# Fase 4 — Diseño UI/UX
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.0 · **Fecha:** 2026-07-06 · **Estado:** Pendiente de aprobación
**Entregables:** este documento · mockup visual HTML (artifact)

---

## 1. Principios de diseño

1. **Cada módulo tiene una densidad distinta.** Admin = denso y rico en datos (ERP). Bodega = una sola tarea, elementos enormes, cero distracción (se usa de pie, con las manos ocupadas). Cocina = legible a 3+ metros, sin interacción.
2. **La jerarquía la dan el espacio y el peso tipográfico, no los colores.** El color se reserva para estado y acción (verde=ok, ámbar=alerta, rojo=bloqueo).
3. **Cero ambigüedad en operaciones críticas.** Confirmar producción, aprobar entregas y restaurar respaldos siempre muestran resumen de consecuencias antes del sí.
4. **Tiempo real visible.** Indicador de conexión permanente; los datos que cambian por socket se resaltan 1.5 s al actualizarse.

## 2. Sistema de diseño (design tokens)

### 2.1 Color

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `background` | `#f8fafc` | `#09090b` | Fondo de página |
| `card` | `#ffffff` | `#18181b` | Tarjetas, paneles |
| `border` | `#e2e8f0` | `#27272a` | Bordes sutiles |
| `foreground` | `#0f172a` | `#fafafa` | Texto principal |
| `muted-foreground` | `#64748b` | `#a1a1aa` | Texto secundario |
| `primary` | `#059669` (emerald-600) | `#10b981` (emerald-500) | Acciones, marca, éxito |
| `warning` | `#d97706` (amber-600) | `#f59e0b` | Alertas, stock bajo, parcial |
| `destructive` | `#dc2626` (red-600) | `#ef4444` | Bloqueos, errores, fuera de tolerancia |
| `info` | `#2563eb` (blue-600) | `#3b82f6` | Estados informativos |

Verde esmeralda como primario: identidad "alimentos frescos", y coincide semánticamente con "aprobado/entregado" (el estado feliz del flujo central). Implementación: variables CSS + `dark:` de Tailwind, mapeadas a los tokens de shadcn/ui.

### 2.2 Tipografía

- **Familia:** Inter (variable), **self-hosted** en `/client/public/fonts` — requisito offline (RNF-01). Fallback: `system-ui`.
- **Números tabulares** (`font-variant-numeric: tabular-nums`) en tablas, KPIs, pesos y dinero — evita el "baile" de dígitos con datos en tiempo real.
- Escala: 12 (metadatos) · 14 (base UI) · 16 (formularios) · 20/24 (títulos) · 30–36 (KPIs) · **64–96 (peso en pantalla bodega y monitor cocina)**.

### 2.3 Formato regional

- Moneda: COP sin decimales, separador de miles con punto: `$ 1.250.000`.
- Peso: coma decimal y 2–3 decimales: `44,98 kg`. Fechas: `dd/mm/aaaa`. Zona: America/Bogota.

### 2.4 Superficies y movimiento

- Radio 10 px tarjetas / 8 px controles; sombras casi imperceptibles (la separación la da el borde).
- Animaciones 150–200 ms ease-out (hover, apertura de diálogos, resaltado de dato actualizado). Sin animaciones decorativas en Bodega/Cocina.

## 3. Navegación y layouts

### 3.1 Módulo Administrador — layout ERP clásico

```
┌──────────┬──────────────────────────────────────────────┐
│ SIDEBAR  │ TOPBAR: búsqueda ⌘K · alertas 🔔 · ☀/🌙 · usuario │
│          ├──────────────────────────────────────────────┤
│ Dashboard│                                              │
│ Producción                CONTENIDO                     │
│ Recetas  │                                              │
│ Inventario                                              │
│ Ventas   │                                              │
│ Gastos   │                                              │
│ Reportes │                                              │
│ ──────── │                                              │
│ Usuarios │                                              │
│ Auditoría│                                              │
│ Respaldos│                                              │
│ Config   │                                              │
└──────────┴──────────────────────────────────────────────┘
```

Sidebar colapsable (solo iconos). Grupo inferior = administración del sistema, separado visualmente de la operación diaria.

### 3.2 Módulo Inventario (Bodega) — pantalla única de tarea

Sin sidebar. Header fijo con fecha, n.º de orden, progreso global y estado de báscula. Dos zonas:

```
┌────────────────────────────────────────────────────────────┐
│ ORDEN DEL DÍA · OP-2026-0001        báscula: ● conectada   │
│ Progreso: ████████░░░░ 8/12 ingredientes                   │
├──────────────────────────────┬─────────────────────────────┤
│ LISTA (izquierda)            │ PANEL DE PESAJE (derecha)   │
│ ✔ Arroz         30/30 kg     │  Carne de res               │
│ ✔ Papa          12/12 kg     │  Requerido: 45,000 kg       │
│ ▶ Carne de res  0/45 kg      │                             │
│ ○ Aceite        0/8 l        │      ┌───────────────┐      │
│ ⚠ Sal (parcial) 1/2 kg       │      │   44,980 kg   │      │  ← lectura viva, 96 px
│ ○ Bandejas      0/120 und    │      │  ● ESTABLE    │      │
│   …                          │      └───────────────┘      │
│                              │  Tolerancia: ±0,050 kg      │
│                              │  [ CONFIRMAR ENTREGA ]      │  ← botón gigante
└──────────────────────────────┴─────────────────────────────┘
```

- El peso vivo cambia de gris (fluctuando) a **verde** (estable y dentro de tolerancia) o **rojo** (estable pero fuera). El botón solo se habilita en verde.
- Fuera de tolerancia → banner rojo con la diferencia exacta ("Faltan 0,320 kg") y el intento queda auditado.
- No existe ningún campo de texto para peso (RN-01). Productos por unidad → stepper de conteo, visualmente distinto.

### 3.3 Módulo Cocina — monitor kiosco (oscuro por defecto)

```
┌────────────────────────────────────────────────────────────┐
│ PRODUCCIÓN DE HOY · lunes 6 de julio          ● en vivo    │
├────────────────┬────────────────┬──────────────────────────┤
│ 120            │ 40             │ 25                       │
│ ALMUERZOS      │ BANDEJAS       │ SOPAS                    │
│ EJECUTIVOS     │ ESPECIALES     │ DEL DÍA                  │
│ ██████████ ✔   │ ████░░░░ 60%   │ ░░░░░░ esperando insumos │
└────────────────┴────────────────┴──────────────────────────┘
│ Al tocar/seleccionar una tarjeta: receta a pantalla        │
│ completa → ingredientes con cantidades ya escaladas a las  │
│ porciones del día + pasos numerados grandes + observaciones│
└────────────────────────────────────────────────────────────┘
```

Barra de progreso por receta = % de insumos entregados por bodega (tiempo real). Auto-rotación opcional entre recetas cada N segundos (configurable).

### 3.4 Dashboard (Admin) — composición

Fila 1: 4 KPIs (Ventas hoy · Utilidad hoy · Costo producción · Gastos hoy) con delta vs. día anterior.
Fila 2: gráfico tendencia ventas/costos/utilidad (14 días) + dona de gastos por categoría.
Fila 3: alertas activas (stock bajo, vencimientos, entregas bloqueadas) + top recetas + top ingredientes.
Los detalles de visualización de datos se definirán en la Fase 9 con la skill de dataviz.

## 4. Patrones UX transversales

| Patrón | Especificación |
|---|---|
| Tablas | TanStack Table: orden por columna, filtro por texto y facetas, paginación servidor (25/50/100), columnas ocultables, export visible |
| Formularios | React Hook Form + Zod (de `shared`); validación al perder foco; errores bajo el campo en español; botón deshabilitado mientras envía |
| Confirmaciones | Peligro medio → diálogo con resumen. Irreversibles (confirmar producción, restaurar respaldo) → además escribir palabra de confirmación |
| Notificaciones | Toasts (sonner): éxito 3 s, error persistente con acción. Campana 🔔 con contador para alertas de negocio |
| Estados vacíos | Ilustración ligera + texto + acción primaria ("Crea tu primera receta") |
| Carga | Skeletons con la forma del contenido (nunca spinner de página completa); botones con spinner inline |
| Errores de red | Banner "Sin conexión con el servidor — reintentando…" + cola de reintento de React Query |
| Modo oscuro | Toggle en topbar + respeta preferencia del SO; Cocina arranca en oscuro |
| Accesibilidad | Contraste AA, focus visible, navegación por teclado completa, `aria-live` en el peso de báscula |

### Atajos de teclado

| Atajo | Acción |
|---|---|
| `Ctrl+K` | Paleta de comandos global (navegar, buscar producto/receta) |
| `Ctrl+N` | Nuevo (según contexto: receta, producto, gasto…) |
| `/` | Enfocar búsqueda de la tabla actual |
| `Enter` / `Esc` | Confirmar / cancelar diálogo activo |
| `Espacio` | (Bodega) Confirmar entrega cuando el botón está habilitado |
| `F11` | (Cocina/Bodega) Pantalla completa |

## 5. Inventario de pantallas (v1 = 18)

| Módulo | Pantallas |
|---|---|
| Auth | Login |
| Admin | Dashboard · Producción (lista, crear/confirmar, detalle) · Recetas (lista, editor, detalle+versiones) · Inventario (productos, detalle+kardex, movimientos, lotes) · Ventas del día · Gastos · Reportes · Usuarios · Auditoría · Respaldos · Configuración |
| Bodega | Orden del día + panel de pesaje (una sola pantalla) |
| Cocina | Monitor (grid + detalle receta) |

---

*Siguiente fase (previa aprobación): **Fase 5 — Backend**: scaffolding del monorepo, PostgreSQL, migración inicial, seed funcionando, y el núcleo del server (config, errores, logging, DI, primeros endpoints).*
