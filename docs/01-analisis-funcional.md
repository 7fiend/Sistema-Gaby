# Fase 1 — Análisis Funcional
## Sistema ERP para Restaurante ("Sistema Gaby")

**Versión:** 1.1 · **Fecha:** 2026-07-06 · **Estado:** ✅ Aprobado

**Decisiones del cliente (2026-07-06):**
1. Ventas → registro diario simple (§6.1 aprobada).
2. Costeo → promedio ponderado móvil (§6.2).
3. UI → shadcn/ui (§6.3).

---

## 1. Visión general

Sistema ERP local (offline-first, localhost) para la operación diaria de un restaurante:
planificación de producción, gestión de recetas y costos, control de inventario con
entrega validada por báscula, monitor de cocina y reportería gerencial.

**Principio rector:** el flujo central del negocio es
**Producción → Cálculo de insumos → Entrega pesada → Descuento de inventario → Cocina → Costos/Reportes**,
todo en tiempo real y con trazabilidad total (auditoría inmutable).

### 1.1 Alcance de la versión inicial (v1)

| Incluido en v1 | Excluido de v1 (preparado para el futuro) |
|---|---|
| Módulo Administrador (dashboard, recetas, inventario, producción, gastos, reportes, usuarios, auditoría, respaldos) | Facturación electrónica DIAN, POS, caja y arqueo |
| Módulo Inventario (orden del día + entrega por báscula) | Impresoras térmicas, lectores de código de barras/QR |
| Módulo Cocina (monitor de solo lectura) | Compras/proveedores avanzado, clientes, fidelización |
| Simulador de báscula + capa de abstracción `ScaleService` | App móvil, panel remoto, multi-sede, domicilios, pagos, IA |
| Autenticación JWT, roles, permisos, sesiones | |
| Socket.IO en tiempo real | |
| Respaldos manuales y programados con restauración | |

---

## 2. Actores y matriz de permisos

| Capacidad | Administrador | Inventario | Cocina | Auditor |
|---|:-:|:-:|:-:|:-:|
| Dashboard y KPIs | ✅ | ❌ | ❌ | 👁 |
| Recetas (CRUD) | ✅ | ❌ | 👁 (en orden del día) | 👁 |
| Productos e inventario (CRUD) | ✅ | 👁 consulta | ❌ | 👁 |
| Movimientos de inventario (entradas, ajustes, mermas) | ✅ | ❌ | ❌ | 👁 |
| Crear/confirmar producción diaria | ✅ | ❌ | ❌ | 👁 |
| Entregar ingredientes (báscula) | ✅ | ✅ | ❌ | ❌ |
| Ver monitor de cocina | ✅ | ❌ | ✅ | 👁 |
| Gastos (CRUD) | ✅ | ❌ | ❌ | 👁 |
| Reportes y exportación | ✅ | ❌ | ❌ | ✅ |
| Usuarios y roles | ✅ | ❌ | ❌ | ❌ |
| Auditoría (solo lectura, nadie elimina) | ✅ | ❌ | ❌ | ✅ |
| Respaldos y restauración | ✅ | ❌ | ❌ | ❌ |
| Configuración (tolerancia báscula, parámetros) | ✅ | ❌ | ❌ | ❌ |

👁 = solo lectura. La matriz se implementará como **permisos granulares agrupados en roles**
(no roles hard-codeados), para poder añadir roles futuros sin tocar código.

---

## 3. Requerimientos funcionales por módulo

### RF-01 · Autenticación y usuarios
- RF-01.1 Login con usuario/contraseña; JWT de acceso + refresh token; expiración configurable.
- RF-01.2 Roles y permisos granulares (recurso + acción).
- RF-01.3 Gestión de usuarios: crear, activar/desactivar (nunca eliminar físico), reset de contraseña.
- RF-01.4 Registro en auditoría de todo login, logout e intento fallido.
- RF-01.5 Bloqueo temporal tras N intentos fallidos (configurable).

### RF-02 · Recetas
- RF-02.1 CRUD de recetas: nombre, categoría, imagen, descripción, tiempo de preparación, rendimiento (porciones), pasos de preparación, observaciones.
- RF-02.2 Ingredientes por receta: producto de inventario + cantidad + unidad.
- RF-02.3 Cálculo automático: costo por ingrediente, costo total, costo por porción, margen, precio sugerido (margen objetivo configurable por receta o global).
- RF-02.4 **Recálculo automático en cascada** cuando cambia el costo de un producto: todas las recetas afectadas actualizan su costo *vigente*. Los costos *históricos* (producciones pasadas) NUNCA cambian (ver RN-03).
- RF-02.5 Versionado de recetas: al editar ingredientes/cantidades se genera nueva versión; las producciones referencian la versión usada.
- RF-02.6 Recetas activas/inactivas (soft delete).

### RF-03 · Inventario (catálogo y stock)
- RF-03.1 CRUD de productos: código interno, nombre, categoría, proveedor, unidad base, stock, stock mínimo, costo unitario, ubicación en bodega.
- RF-03.2 Lotes por producto: número de lote, fecha de vencimiento, cantidad, costo del lote.
- RF-03.3 Tipos de movimiento: **entrada** (compra), **salida** (entrega a producción), **ajuste** (+/− con motivo), **merma**, **pérdida**, **vencimiento**. Todo movimiento es inmutable (RN-02).
- RF-03.4 Alertas automáticas: stock bajo mínimo, lotes próximos a vencer (días configurables), lotes vencidos.
- RF-03.5 Consumo de lotes por **FEFO** (primero el que vence primero) al descontar.
- RF-03.6 Conversión de unidades (kg↔g, l↔ml, unidad, paquete con factor) centralizada.

### RF-04 · Producción diaria
- RF-04.1 El administrador arma la orden del día: lista de recetas + cantidad de porciones (ej. 120 Almuerzos, 40 Bandejas, 25 Sopas).
- RF-04.2 El sistema **explota las recetas**: consolida los ingredientes totales requeridos (ej. 45 kg carne, 30 kg arroz), sumando entre recetas que comparten ingrediente.
- RF-04.3 Verificación de disponibilidad: si falta stock, advertir antes de confirmar (indicando faltantes).
- RF-04.4 Al **confirmar**, la orden se congela (cantidades, costos snapshot, versión de receta) y se envía en tiempo real al módulo Inventario y al monitor de Cocina.
- RF-04.5 Ciclo de vida de la orden: `BORRADOR → CONFIRMADA → EN_ENTREGA → ENTREGADA → EN_PREPARACION → COMPLETADA → CERRADA` (+ `CANCELADA` solo antes de iniciar entregas, con auditoría).
- RF-04.6 Una vez cerrada, la orden es inmutable.

### RF-05 · Módulo Inventario (pantalla de entrega)
- RF-05.1 Pantalla única y simple: **Orden del día** → tabla Ingrediente · Cantidad requerida · Cantidad entregada · Estado (Pendiente / Parcial / Entregado / Bloqueado).
- RF-05.2 El peso proviene **exclusivamente** de `ScaleService` (báscula real o simulador). Sin entrada manual de peso, jamás.
- RF-05.3 Validación por tolerancia configurable (default ±50 g o % configurable por producto): dentro de tolerancia → aprobación automática; fuera → bloqueo con advertencia y registro en auditoría del intento.
- RF-05.4 Entregas parciales permitidas (varias pesadas acumulan hasta lo requerido); la tolerancia aplica sobre el total.
- RF-05.5 Al aprobar: descuento automático de stock (FEFO), movimiento de salida inmutable, actualización en tiempo real a Administrador y Cocina.
- RF-05.6 Productos por **unidad** (no pesables, ej. empaques): confirmación de cantidad por conteo, marcada como tal en auditoría.

### RF-06 · Integración con báscula (`ScaleService`)
- RF-06.1 Capa de abstracción con contrato único: `getWeight()`, `onWeightChange`, `tare()`, `status`, independiente del hardware.
- RF-06.2 Drivers intercambiables: Serial/COM/RS232, USB-HID, Ethernet/TCP — configurables sin tocar lógica de negocio.
- RF-06.3 **Simulador de báscula** para desarrollo y pruebas: panel para fijar peso, simular fluctuación/estabilización, desconexión y errores.
- RF-06.4 Solo se acepta un peso cuando la lectura es **estable** (N lecturas consecutivas dentro de un delta).

### RF-07 · Módulo Cocina (monitor)
- RF-07.1 Pantalla tipo kiosco/monitor, sin acciones administrativas, optimizada para verse a distancia.
- RF-07.2 Muestra: producción del día (recetas + cantidades), estado de entrega de insumos, y por receta: ingredientes, pasos, observaciones.
- RF-07.3 Actualización en tiempo real (Socket.IO), reconexión automática, indicador de conexión.

### RF-08 · Costos
- RF-08.1 Cálculo automático de: costo por plato, costo total de producción, costo diario/semanal/mensual, costo por ingrediente y por categoría.
- RF-08.2 Método de costeo: **promedio ponderado móvil** (recomendado) — cada entrada recalcula el costo promedio; las salidas usan el promedio vigente. *(Alternativa: último costo — pendiente de decisión del cliente.)*
- RF-08.3 Snapshots históricos: toda producción guarda los costos del momento (inmutables).

### RF-09 · Gastos
- RF-09.1 CRUD de gastos: categoría (servicios, nómina, transporte, compras, imprevistos, otros), monto, fecha, descripción, comprobante adjunto opcional.
- RF-09.2 Los gastos alimentan el cálculo de utilidad del dashboard y reportes.

### RF-10 · Ventas (registro simple — propuesta, ver §6.1)
- RF-10.1 Registro diario de ventas (manual o derivado de producción) para que dashboard y utilidad tengan datos reales sin necesitar POS.

### RF-11 · Dashboard (Administrador)
- KPIs: ventas del día, utilidad, costo de producción, gastos, ítems con stock bajo, productos más utilizados, recetas más preparadas.
- Gráficos: tendencia de costos/ventas/utilidad, distribución de gastos, consumo por categoría.
- Centro de alertas: stock bajo, vencimientos, entregas bloqueadas por tolerancia, producciones pendientes.

### RF-12 · Reportes
- RF-12.1 Reportes: ventas, producción, utilidad, inventario valorizado, ingredientes consumidos, desperdicios/mermas, costos, gastos, rentabilidad por receta, top recetas, top ingredientes.
- RF-12.2 Todos filtrables por rango de fechas; exportables a **PDF, Excel y CSV**.
- RF-12.3 Los reportes generados no se pueden eliminar (solo regenerar).

### RF-13 · Auditoría
- RF-13.1 Registro append-only de: sesiones, CRUD en todas las entidades (con diff antes/después), movimientos de inventario, producciones, entregas, intentos fuera de tolerancia, errores del sistema, accesos denegados.
- RF-13.2 Sin API de borrado ni edición; consulta con filtros (usuario, entidad, acción, fecha).

### RF-14 · Respaldos
- RF-14.1 Respaldo manual bajo demanda (dump PostgreSQL + carpeta uploads).
- RF-14.2 Respaldos programados (cron configurable) con rotación/retención.
- RF-14.3 Restauración guiada con confirmación fuerte y registro en auditoría.

### RF-15 · Tiempo real
- RF-15.1 Eventos Socket.IO con salas por módulo: cambios de producción, entregas, stock, alertas → actualización inmediata en todas las pantallas sin refrescar.
- RF-15.2 Autenticación del socket con el mismo JWT; cada rol solo recibe los eventos que le competen.

---

## 4. Reglas de negocio críticas (RN)

- **RN-01 · Peso solo de báscula.** Ningún flujo permite digitar peso. Excepción única: productos de conteo por unidad (RF-05.6), marcados como tales.
- **RN-02 · Inmutabilidad.** Movimientos de inventario, entregas, producciones cerradas, costos históricos, reportes y auditoría **no se editan ni eliminan**. Las correcciones se hacen con movimientos de ajuste compensatorios, auditados.
- **RN-03 · Costos históricos congelados.** El recálculo por cambio de precio solo afecta el costo *vigente* de las recetas; nunca reescribe producciones pasadas.
- **RN-04 · Tolerancia configurable.** Global por defecto, sobrescribible por producto. Fuera de tolerancia = operación bloqueada + advertencia + evento de auditoría.
- **RN-05 · Consumo FEFO.** Los descuentos consumen primero el lote de vencimiento más próximo.
- **RN-06 · Soft delete universal.** Nada se borra físicamente (usuarios, recetas, productos): se desactiva.
- **RN-07 · Toda mutación pasa por auditoría.** Sin excepciones, incluidas acciones del Administrador.

---

## 5. Requerimientos no funcionales (RNF)

| # | Requerimiento |
|---|---|
| RNF-01 | 100 % funcional sin internet; sin dependencias de servicios externos en runtime |
| RNF-02 | Arquitectura portable: localhost → servidor LAN → VPS/nube cambiando solo variables de entorno |
| RNF-03 | TypeScript estricto en todo el stack; validación doble (Zod en front, Zod/DTO en back) |
| RNF-04 | Clean Architecture + SOLID: dominio independiente de framework, ORM y transporte |
| RNF-05 | Respuestas de API < 300 ms en operaciones normales sobre hardware modesto |
| RNF-06 | UI responsive, modo claro/oscuro, accesible, atajos de teclado en flujos frecuentes |
| RNF-07 | Manejo centralizado de errores con códigos consistentes y logging estructurado |
| RNF-08 | Seed completo de datos de prueba realistas; scripts de instalación y arranque en un paso |
| RNF-09 | Contraseñas con hash fuerte (argon2/bcrypt), JWT firmado, sanitización de entradas |
| RNF-10 | Documentación por módulo en `/docs` + comentarios de decisiones técnicas |

---

## 6. Mejoras propuestas (requieren tu decisión)

### 6.1 Registro de ventas (brecha detectada)
El dashboard exige "ventas del día" y "utilidad", pero el POS está fuera de alcance.
**Propuesta:** módulo mínimo de *registro de ventas diarias* (porciones vendidas por receta
× precio, o total manual del día). Sin él, "ventas" y "utilidad" no tendrían fuente de datos.

### 6.2 Método de costeo
Recomiendo **promedio ponderado móvil** (estándar contable, estable ante variaciones de
precio de compra). Alternativa: último costo (más simple, más volátil).

### 6.3 Librería UI
Entre HeroUI y shadcn/ui recomiendo **shadcn/ui**: componentes copiados al proyecto (cero
dependencia de runtime externa, coherente con la filosofía offline), personalización total,
integración nativa con Tailwind y ecosistema maduro (tablas con TanStack Table, gráficos con Recharts).

### 6.4 Otras mejoras incorporadas al análisis
- Versionado de recetas (RF-02.5) — sin esto, editar una receta corrompería el histórico.
- Estados de ciclo de vida de producción (RF-04.5) — trazabilidad del flujo completo.
- Entregas parciales (RF-05.4) — la operación real rara vez pesa todo de una vez.
- Lectura estable de báscula (RF-06.4) — evita capturar pesos en fluctuación.
- Merma teórica vs. real (reporte de desperdicio: entregado vs. requerido) — en Reportes.

---

## 7. Supuestos

1. Moneda: **peso colombiano (COP)**, sin decimales en presentación. Idioma UI: **español**.
2. Un solo restaurante / una sede en v1 (modelo de datos preparado para multi-sede).
3. Las tres pantallas (Admin, Inventario, Cocina) corren en equipos distintos de la misma red local, apuntando al mismo backend.
4. Zona horaria: America/Bogota.
5. La báscula física se integrará después; v1 opera con el simulador.

---

## 8. Glosario

| Término | Definición |
|---|---|
| Orden de producción | Conjunto de recetas × cantidades planificadas para un día |
| Explosión de ingredientes | Cálculo consolidado de insumos totales a partir de recetas × porciones |
| FEFO | *First Expired, First Out*: consumir primero el lote que vence antes |
| Tolerancia | Desviación máxima permitida entre peso requerido y peso entregado |
| Snapshot de costo | Copia congelada del costo al momento de un evento (producción/entrega) |
| Merma | Pérdida registrada de producto (deterioro, desperdicio, vencimiento) |

---

*Siguiente fase (previa aprobación): **Fase 2 — Arquitectura** (diagrama de capas, estructura de carpetas, contratos entre módulos, estrategia de portabilidad y decisiones técnicas justificadas).*
