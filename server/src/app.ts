import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { API_PREFIX } from '@gaby/shared';
import { env, isDev } from './config/env.js';
import { logger } from './infrastructure/logging/logger.js';
import type { Container } from './container.js';
import { buildRoutes } from './presentation/http/routes/index.js';
import { errorHandler, notFoundHandler } from './presentation/http/middleware/error-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** `vite build` de client/ (Fase 15, RNF-02: un solo puerto en despliegue local). */
const CLIENT_DIST = path.resolve(__dirname, '../../client/dist');

export function createApp(container: Container) {
  const app = express();

  app.disable('x-powered-by');
  app.use(compression());
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      autoLogging: !isDev, // en dev, solo errores: consola limpia
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    }),
  );

  app.use(API_PREFIX, buildRoutes(container));

  // En dev, Vite sirve el cliente en :5173 (con proxy a esta API). En
  // producción no hay build separado: este mismo server sirve los estáticos
  // de `client/dist` y cae a index.html para las rutas de React Router.
  if (!isDev) {
    app.use(express.static(CLIENT_DIST));
    app.get('/*splat', (req, res, next) => {
      if (req.path.startsWith(API_PREFIX)) return next();
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
