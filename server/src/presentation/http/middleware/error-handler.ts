import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ERROR_CODES, type ApiError } from '@gaby/shared';
import { AppError } from '../../../domain/errors/AppError.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { isDev } from '../../../config/env.js';

/** Manejador centralizado (AD-11): traduce todo error al envelope único. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    const body: ApiError = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    if (err.statusCode >= 500) logger.error({ err, url: req.url }, err.message);
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiError = {
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Datos inválidos',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
    res.status(400).json(body);
    return;
  }

  // Errores conocidos de Prisma → mensajes de negocio (sin filtrar internos)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const body: ApiError = {
        error: {
          code: ERROR_CODES.CONFLICT,
          message: 'Ya existe un registro con ese valor único (código o nombre duplicado)',
        },
      };
      res.status(409).json(body);
      return;
    }
    if (err.code === 'P2025') {
      const body: ApiError = {
        error: { code: ERROR_CODES.NOT_FOUND, message: 'El registro no existe' },
      };
      res.status(404).json(body);
      return;
    }
    if (err.code === 'P2003') {
      const body: ApiError = {
        error: {
          code: ERROR_CODES.CONFLICT,
          message: 'La operación referencia un registro inexistente o en uso',
        },
      };
      res.status(409).json(body);
      return;
    }
  }

  logger.error({ err, url: req.url, method: req.method }, 'Error no controlado');
  const body: ApiError = {
    error: {
      code: ERROR_CODES.INTERNAL,
      message: 'Error interno del servidor',
      ...(isDev && err instanceof Error ? { details: err.message } : {}),
    },
  };
  res.status(500).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiError = {
    error: { code: ERROR_CODES.NOT_FOUND, message: `Ruta no encontrada: ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}
