# Guía de instalación — PC nuevo, desde cero

Instrucciones para dejar Sistema Gaby corriendo en un computador Windows que no tiene nada
instalado todavía (el escenario típico: el PC del restaurante, o una máquina de respaldo).
Escrita para PowerShell — es el shell que usa el proyecto en todos sus comandos documentados.

## 1. Instalar los prerequisitos

### Node.js 20 o superior
Descargar el instalador LTS desde [nodejs.org](https://nodejs.org) y ejecutarlo con las opciones
por defecto. Verificar:
```powershell
node --version   # v20.x.x o superior
npm --version
```

### PostgreSQL 16
Descargar el instalador desde [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)
(usa el instalador de EnterpriseDB). Durante la instalación:
- Anota la **contraseña del usuario `postgres`** que definas — la vas a necesitar en el paso 4.
- Deja el puerto por defecto (`5432`).
- Instala también **Command Line Tools** (`psql`, `pg_dump`) si el instalador lo pregunta — hacen
  falta para la migración de esquema y para el módulo de Respaldos.
- Anota la carpeta de instalación (normalmente `C:\Program Files\PostgreSQL\16`) — la vas a
  necesitar en el paso 3 (`PG_BIN`).

Verificar que quedó corriendo como servicio de Windows:
```powershell
Get-Service postgresql*
```
Debe aparecer `Running`. Si no, el instalador lo deja configurado para iniciar solo con Windows.

## 2. Copiar el proyecto

Copia la carpeta completa del proyecto al PC nuevo (por USB, red compartida, o el medio que uses
para transferir archivos — este proyecto no está en un repositorio Git remoto). **No** copies las
carpetas `node_modules/`, `client/dist/`, `uploads/` ni `backups/` si vienen de otra instalación —
se regeneran solas y copiar `node_modules` de un PC a otro casi nunca funciona bien.

Abre PowerShell en la carpeta del proyecto y confirma que ves `package.json`, `client/`, `server/`,
`shared/`, `database/`.

## 3. Instalar dependencias

```powershell
npm install
```
Esto instala las dependencias de los 3 workspaces (`client`, `server`, `shared`) de una sola vez
(el proyecto usa npm workspaces).

## 4. Configurar `server/.env`

```powershell
copy server\.env.example server\.env
```
Abre `server\.env` en un editor de texto y completa:

- **`DATABASE_URL`**: reemplaza `TU_PASSWORD` por la contraseña de `postgres` que definiste en el
  paso 1. Deja el resto (`localhost:5432/sistema_gaby`) igual si es una instalación local normal.
- **`JWT_ACCESS_SECRET`** y **`JWT_REFRESH_SECRET`**: genera dos valores aleatorios distintos, por
  ejemplo:
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
  Corre el comando dos veces y pega cada resultado en su variable. **Nunca** reuses los secretos
  de otra instalación (dev, otro restaurante, etc.).
- **`PG_BIN`**: la carpeta `bin` de PostgreSQL del paso 1 (ej. `C:\Program Files\PostgreSQL\16\bin`).
  Solo hace falta si vas a usar el módulo de Respaldos.

El resto de variables tienen defaults razonables — no hace falta tocarlas para una instalación
local estándar.

## 5. Crear la base de datos

Con PowerShell, usando el `psql` que instalaste en el paso 1 (ajusta la ruta si tu instalación
quedó en otra carpeta):
```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE sistema_gaby;"
```
Te va a pedir la contraseña de `postgres` que definiste en el paso 1.

## 6. Migrar el esquema y sembrar datos de prueba

```powershell
npm run db:migrate
npm run db:seed
```
`db:migrate` crea todas las tablas, índices y triggers. `db:seed` crea los 4 usuarios de prueba
(`admin`/`bodega`/`cocina`/`auditor`, clave `Gaby2026*`), catálogos base (unidades, categorías) y
algunos productos/recetas de ejemplo — es **idempotente**, se puede volver a correr sin duplicar
nada ni romper datos reales que ya existan.

> Si vas a poner el sistema en producción real (no solo para probar), considera editar
> `database/seed.ts` para no crear las recetas/productos de ejemplo, o bórralos manualmente desde
> el panel de administración después de sembrar — el seed siempre crea los 4 usuarios y catálogos
> base, eso sí es necesario.

## 7. Arrancar

```powershell
npm run dev
```
Abre `http://localhost:5173` e inicia sesión con `admin` / `Gaby2026*`. **Cambia esa contraseña**
desde Configuración de usuario antes de usar el sistema con datos reales.

## Modo producción (un solo puerto, sin Vite)

Para dejar el sistema corriendo de forma más permanente (por ejemplo, en el PC del restaurante,
sin depender de dos procesos de desarrollo):

```powershell
npm run build -w client
$env:NODE_ENV = "production"
npm run start -w server
```

Con `NODE_ENV=production`, el propio servidor de Express sirve el frontend ya compilado
(`client/dist`) además de la API — todo en un solo puerto (`:3000` por defecto). Ya no hace falta
`npm run dev:client` ni el puerto `:5173`.

Para que arranque solo al prender el PC, puedes crear una tarea programada de Windows que corra
`npm run start -w server` (con `NODE_ENV=production` ya seteado) al iniciar sesión, o usar un
gestor de procesos como [PM2](https://pm2.keymetrics.io/) si prefieres reinicios automáticos ante
un cierre inesperado.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `npm run db:migrate` falla con error de conexión | `DATABASE_URL` mal escrita, o el servicio de PostgreSQL no está corriendo (`Get-Service postgresql*`) |
| Login falla con "Configuración de entorno inválida" al arrancar el server | Falta alguna variable requerida en `server/.env` (revisa el mensaje exacto, indica cuál) o un secreto JWT tiene menos de 32 caracteres |
| Los respaldos fallan con `FAILED` | `PG_BIN` mal configurado o no instalaste las Command Line Tools de PostgreSQL — revisa el mensaje de error guardado en el propio respaldo |
| La app carga pero sin estilos / con la fuente del sistema | Falta `npm run build -w client` si estás en modo producción, o el navegador tiene caché vieja (Ctrl+Shift+R) |
