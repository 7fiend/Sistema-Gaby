# Guía de migración — Servidor de red local (LAN) o VPS

Sistema Gaby se construyó para correr en el PC del restaurante (todo junto: base de datos,
servidor y cliente en el mismo equipo, accedido desde `localhost`). Esta guía cubre los dos
escenarios de mover esa instalación a otro lado.

## Escenario A — Servidor en la red local (LAN)

Un solo PC (o un servidor pequeño) corre todo, y otros equipos de la red (una tablet en bodega,
una pantalla en cocina, otro computador de oficina) se conectan por la IP de ese PC en vez de
`localhost`.

### 1. Identificar la IP del servidor
```powershell
ipconfig   # busca la IPv4 de la red local, ej. 192.168.1.50
```
Idealmente configura una **IP fija** para ese equipo en el router, para que no cambie y rompa el
acceso desde los demás dispositivos.

### 2. Modo producción (recomendado para LAN)
Sigue [`16-guia-instalacion.md`](16-guia-instalacion.md) §"Modo producción": `npm run build -w
client` + `NODE_ENV=production npm run start -w server`. Todo queda servido en un solo puerto
(`:3000` por defecto) — los demás equipos solo necesitan `http://192.168.1.50:3000`.

### 3. Ajustar `CORS_ORIGIN`
En `server/.env`, `CORS_ORIGIN` debe ser el origen exacto desde el que se va a acceder. Con modo
producción de un solo puerto (mismo host sirviendo cliente y API), esto casi nunca importa porque
el navegador ya está en el mismo origen — pero si vas a exponer la API en un puerto y servir el
cliente en otro (ver §3 del escenario VPS), sí hace falta ajustarlo al origen real.

### 4. Permitir el puerto en el firewall de Windows
```powershell
New-NetFirewallRule -DisplayName "Sistema Gaby" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
```

### 5. ⚠️ Sesiones y HTTPS
La cookie de sesión (`refresh_token`) se marca `secure` automáticamente en modo producción
(`NODE_ENV=production`) — el navegador **solo la envía por HTTPS**. En una LAN sin HTTPS
configurado, eso significa que el refresh automático de sesión no funciona: cada usuario tendría
que volver a iniciar sesión cada 15 minutos (la duración del token de acceso), en vez de que la
sesión se renueva sola. Dos formas de resolverlo:
- **Recomendado si el sistema se va a usar todo el día**: poner un proxy con HTTPS delante
  (certificado autofirmado o de una CA interna sirve para una LAN — no hace falta uno público).
  [Caddy](https://caddyserver.com/) es la opción más simple para esto.
- **Aceptable para uso esporádico/pruebas**: dejar `NODE_ENV=development` incluso en el
  despliegue de LAN. Los usuarios inician sesión normalmente y la sesión persiste igual mientras
  el navegador quede abierto sin refrescar, pero pierdes el modo producción de un solo puerto
  (tendrías que correr `npm run dev` completo, con Vite en `:5173` también expuesto a la red).

## Escenario B — VPS (fuera de la red local)

Migrar todo a un servidor remoto (Linux o Windows), accesible por internet.

### 1. Base de datos
Puedes usar PostgreSQL instalado en el mismo VPS, o un servicio administrado (RDS, Supabase,
etc.). Actualiza `DATABASE_URL` en `server/.env` con el host/puerto/credenciales reales. Corre
`npm run db:migrate` y `npm run db:seed` apuntando a esa base antes del primer arranque.

### 2. HTTPS es obligatorio
Igual que en el escenario LAN, pero aquí **no es opcional**: un servidor expuesto a internet sin
HTTPS es un riesgo real (credenciales y tokens viajando en texto plano), y la cookie `secure` del
refresh token simplemente no va a funcionar sin TLS. Usa un reverse proxy (Caddy, nginx +
certbot) delante de Node con un certificado real (Let's Encrypt es gratis).

### 3. `CORS_ORIGIN` y `VITE_API_URL`
- Si sirves cliente y API desde el mismo dominio (recomendado, es el modo producción de un solo
  puerto): no hace falta tocar `VITE_API_URL`, y `CORS_ORIGIN` puede ser ese mismo dominio o
  dejarse — las peticiones same-origin no dependen de CORS.
- Si el cliente se sirve desde un dominio/subdominio distinto al de la API (por ejemplo, un CDN
  para los estáticos): crea `client/.env.production` con `VITE_API_URL=https://api.tudominio.com`
  y vuelve a correr `npm run build -w client`; en `server/.env`, `CORS_ORIGIN` debe ser el origen
  exacto del cliente (`https://app.tudominio.com`, sin barra final).

### 4. Variables de entorno del servidor
Mismas de la instalación normal (`server/.env.example`) — **genera secretos JWT nuevos y propios
del VPS**, nunca reuses los de desarrollo o de otra instalación. `PG_BIN` no aplica si usas un
Postgres administrado; si instalas PostgreSQL en el mismo VPS (Linux), ajusta la ruta a los
binarios de `pg_dump`/`psql` de esa distribución en vez de la ruta de Windows.

### 5. Proceso persistente
No dejes el server corriendo con `npm run start -w server` en una terminal que se pueda cerrar.
Usa un gestor de procesos: [PM2](https://pm2.keymetrics.io/), un servicio de systemd (Linux), o
el gestor de servicios propio de tu proveedor de hosting.

### 6. Respaldos fuera del propio servidor
El módulo de Respaldos (`docs/13-auditoria-respaldos.md`) guarda los `.sql.gz` en el disco del
mismo servidor (`BACKUPS_DIR`) — si el VPS se pierde completo, se pierden con él. Para un
despliegue remoto de verdad, agrega una copia periódica de esa carpeta a almacenamiento externo
(S3, otro servidor, etc.) — no es algo que el sistema haga solo todavía.

## Ambos escenarios: qué NO cambia

El modelo de datos, los permisos, el módulo de auditoría, el costeo — nada de la lógica de
negocio depende de dónde corre el servidor. Cambiar de topología es enteramente cuestión de
variables de entorno y red, no de código.
