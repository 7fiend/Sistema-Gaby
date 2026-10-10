# Guía de actualización — llevar cambios de código a una instalación ya instalada

Esta guía es para el caso que se repite en cada fase nueva: ya instalaste Sistema Gaby en el PC
del restaurante (`16-guia-instalacion.md`) y ahora hay cambios de código (una fase nueva,
como la 18) que hay que llevar ahí **sin perder los datos reales** que ya tenga esa instalación
(recetas, inventario, ventas, usuarios).

Hay dos formas de hacerlo: copiando archivos a mano (la que se puede usar ya mismo, sin nada
adicional que instalar) o con Git (más simple y más segura a partir de la primera vez que la
dejes configurada). Las dos terminan en los mismos 4 pasos de fondo: **traer el código nuevo →
instalar dependencias → migrar la base de datos → reconstruir y reiniciar**. Lo único que cambia
es cómo se resuelve el primer paso.

## Antes de actualizar (siempre, sin importar el método)

1. **Respaldo real**: desde `/admin/respaldos` en la instalación del cliente, genera un respaldo
   manual antes de tocar nada. Es la mejor red de seguridad si algo sale mal a mitad de la
   actualización.
2. Confirma qué cambió leyendo el `docs/NN-*.md` de la fase nueva — en particular si agrega una
   migración de base de datos (la mayoría de fases sí) o variables de entorno nuevas en
   `.env.example`.
3. Detén la app en el PC del cliente (`Ctrl+C` si corre `npm run dev`, o detén el proceso/servicio
   si corre en modo producción).

## Opción A — Sin Git (copia manual de archivos)

Es lo que se puede hacer hoy mismo, sin instalar nada adicional en el PC del cliente.

### 1. Copiar el código nuevo
Copia la carpeta completa del proyecto (USB, red compartida, el medio que uses) **excepto**:
- `node_modules/` (de los 3 workspaces) — se regenera con `npm install`.
- `client/dist/` — se regenera con el build.
- `server/uploads/` y `server/backups/` — son datos de ESA instalación, nunca los de origen.
- **`server/.env` y `client/.env`** — tienen la `DATABASE_URL`, secretos JWT y demás configuración
  propia de esa instalación. Sobrescribirlos rompe la conexión a su base de datos real o le
  cambia los secretos de sesión a mitad de operación. Dilos aparte y no los toques.

### 2. Instalar dependencias
```powershell
npm install
```

### 3. Migrar la base de datos (con datos reales — el comando correcto importa)
```powershell
cd server
npx prisma migrate deploy --schema=../database/schema.prisma
cd ..
```
**No uses `npm run db:migrate`** contra una base con datos reales — ese script corre
`prisma migrate dev`, pensado para desarrollo: puede detectar "drift" en el esquema y proponer
resetear la base de datos. `migrate deploy` solo aplica las migraciones pendientes, sin drift ni
reset — es el comando correcto para una instalación en uso.

### 4. Sembrar catálogos/permisos nuevos
```powershell
npm run db:seed
```
Es idempotente (usa upserts) — agrega los permisos/catálogos nuevos de la fase sin duplicar ni
tocar nada que el cliente ya haya creado o editado.

### 5. Reconstruir y reiniciar
Modo producción (un solo puerto):
```powershell
npm run build -w client
$env:NODE_ENV = "production"
npm run start -w server
```
Modo desarrollo: `npm run dev`.

### 6. Verificar
Inicia sesión y confirma que las pantallas/funciones nuevas de la fase aparecen y funcionan.

**Desventaja de este método**: cada vez hay que acordarse a mano de qué carpetas excluir y cuáles
archivos NO tocar — un descuido (por ejemplo, sobrescribir `server/.env`) puede tumbar la
instalación del cliente. No hay forma fácil de ver "qué cambió exactamente" ni de deshacer una
actualización si algo sale mal, más allá de restaurar el respaldo del paso 0.

## Opción B — Con Git (ya activo desde la Fase 18)

El proyecto ya es un repositorio Git, con remoto privado en
[github.com/7fiend/Sistema-Gaby](https://github.com/7fiend/Sistema-Gaby) (el `.gitignore` ya
excluía `node_modules/`, `dist/`, `.env*`, `uploads/`, `backups/` desde antes, así que activarlo
no arrastró nada de eso). Cada fase nueva se sube ahí; el PC del cliente solo necesita `git pull`.

### Qué cambia con Git
- El primer paso ("traer el código nuevo") pasa de "copiar la carpeta completa con cuidado" a
  un simple `git pull` — Git solo trae los archivos que cambiaron, y el `.gitignore` garantiza
  que `.env`, `uploads/`, `backups/` y `node_modules/` nunca se tocan ni se sobrescriben.
- Queda historial: `git log` muestra exactamente qué cambió en cada fase, y `git diff` compara
  dos versiones línea por línea si algo se ve raro después de actualizar.
- Rollback real: si una actualización rompe algo, `git checkout <commit-o-tag-anterior>` vuelve
  atrás en segundos — con copia manual de archivos no hay una forma limpia de deshacer.
- Se puede etiquetar cada fase (`git tag fase-18`) para saber exactamente qué versión corre en
  el PC del cliente en cualquier momento (`git describe`).
- Pasos 2–5 (instalar dependencias, migrar, sembrar, reconstruir) **no cambian** — Git solo
  reemplaza el paso 1.

### Primera vez: conectar el PC del cliente (ya tiene una instalación manual, sin Git)

El PC del cliente ya tiene el proyecto corriendo de una instalación anterior (copiado a mano, sin
Git) con su propio `server/.env` y datos de prueba en PostgreSQL. **No** conviertas esa carpeta
existente en un repo con `git init` ahí encima — es más simple y más seguro clonar limpio al lado
y trasplantar la configuración, sin arriesgar lo que ya funciona:

1. **Instalar Git para Windows** en ese PC: [git-scm.com/download/win](https://git-scm.com/download/win),
   opciones por defecto. El instalador incluye Git Credential Manager, que te va a abrir el
   navegador para iniciar sesión en GitHub la primera vez que haga falta (el repo es privado).
2. **Respaldo real** desde `/admin/respaldos` en la instalación actual, antes de tocar nada.
3. **Detener la app** que esté corriendo (`Ctrl+C`, o el proceso/servicio si es modo producción).
4. **Clonar en una carpeta nueva, al lado de la actual** (no dentro, no encima):
   ```powershell
   cd C:\  # o la carpeta padre donde vive el proyecto actual
   git clone https://github.com/7fiend/Sistema-Gaby.git "Sistema Gaby (git)"
   ```
   Te va a pedir iniciar sesión en GitHub la primera vez (ventana del navegador) — es una cuenta
   con acceso al repo privado, la misma con la que se creó o a la que se invitó.
5. **Trasplantar la configuración y los datos de ESA instalación** (no vienen en el repo, es
   exactamente lo que el `.gitignore` protege):
   ```powershell
   copy "Sistema Gaby\server\.env" "Sistema Gaby (git)\server\.env"
   copy "Sistema Gaby\client\.env" "Sistema Gaby (git)\client\.env"   # si existe uno propio
   xcopy "Sistema Gaby\uploads" "Sistema Gaby (git)\uploads" /E /I
   xcopy "Sistema Gaby\backups" "Sistema Gaby (git)\backups" /E /I
   ```
6. En la carpeta nueva: `npm install`, luego los pasos 3–5 de la Opción A de esta guía (migrar con
   `prisma migrate deploy`, `npm run db:seed`, reconstruir/reiniciar).
7. **Verificar** que la carpeta nueva funciona igual (o mejor) que la vieja — login, datos de
   prueba visibles, pantallas nuevas de la fase.
8. Solo cuando confirmes que quedó bien: renombra la carpeta vieja (ej. `Sistema Gaby (respaldo
   pre-git)`, no la borres todavía) y, si usas un acceso directo o tarea programada de Windows
   para arrancar el sistema, actualízalo para que apunte a la carpeta nueva.

### Actualización ya con Git configurado (todas las veces siguientes)
```powershell
git pull
npm install
cd server; npx prisma migrate deploy --schema=../database/schema.prisma; cd ..
npm run db:seed
npm run build -w client   # o npm run dev si es modo desarrollo
```
Los pasos 2 en adelante son idénticos a la Opción A — Git solo simplificó y volvió seguro el
paso 1.

## Estado actual

Git ya está configurado (Fase 18): repositorio privado en
[github.com/7fiend/Sistema-Gaby](https://github.com/7fiend/Sistema-Gaby), commit inicial
etiquetado `fase-18`. Falta conectar el PC del cliente por primera vez (sección de arriba) — una
vez hecho eso, cada fase futura se sube ahí y la actualización en el PC del cliente es la sección
"Actualización ya con Git configurado".
