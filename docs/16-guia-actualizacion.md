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

## Opción B — Con Git (recomendado a partir de ahora)

Este proyecto ya tiene un `.gitignore` correcto (excluye `node_modules/`, `dist/`, `.env*`,
`uploads/`, `backups/` desde antes) pero **todavía no es un repositorio Git** — no se ha corrido
`git init`. Configurarlo es un paso único; después, cada actualización futura se reduce a
`git pull` en el PC del cliente, sin tener que recordar qué excluir a mano (el `.gitignore` ya lo
resuelve siempre).

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

### Qué hace falta configurar (una sola vez)
1. **Inicializar el repositorio** en esta copia de desarrollo: `git init`, primer commit con
   todo el código actual. Es local, no sube nada a ningún lado todavía.
2. **Elegir dónde vive el remoto** — la única decisión real:
   - **Repositorio privado en GitHub/GitLab** (gratis para repos privados): más simple de
     mantener, funciona desde cualquier lugar con internet. El PC del restaurante necesita
     conexión a internet al momento de actualizar (no todo el tiempo — solo cuando corras
     `git pull`), y hace falta una cuenta con acceso al repo privado en ese PC.
   - **Repositorio "bare" local** (en una carpeta de red compartida, o incluso un USB): no
     depende de internet ni de una cuenta externa — todo el código se queda dentro de tu propia
     red o dispositivos. Un poco más de configuración inicial (`git clone --bare` a la carpeta
     compartida, `git remote add origin <ruta>` en cada PC), pero una vez hecho funciona igual de
     simple (`git push` desde aquí, `git pull` en el PC del cliente).
3. **Instalar Git** en el PC del cliente si no lo tiene ([git-scm.com](https://git-scm.com/download/win))
   y clonar el repositorio una sola vez (`git clone <remoto>`).

### Actualización ya con Git configurado
```powershell
git pull
npm install
cd server; npx prisma migrate deploy --schema=../database/schema.prisma; cd ..
npm run db:seed
npm run build -w client   # o npm run dev si es modo desarrollo
```
Los pasos 2 en adelante son idénticos a la Opción A — Git solo simplificó y volvió seguro el
paso 1.

## Recomendación

Vale la pena configurar Git ahora, antes de que la instalación del cliente tenga datos de
producción reales (según lo conversado, todavía es ambiente de pruebas) — es el momento más
barato para hacerlo. Con un repositorio privado en GitHub (la opción más simple si el
restaurante tiene internet) o uno "bare" local (si prefieres no depender de un servicio externo),
las actualizaciones futuras pasan de "copiar con cuidado y rezar" a `git pull` sin pensar.
