import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Middleware de validación con los esquemas Zod de @gaby/shared (AD-09).
 * El resultado parseado (con defaults y coerciones) reemplaza al original.
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) {
        // Express 5: req.query es getter de solo lectura → guardamos aparte
        (req as Request & { validatedQuery?: unknown }).validatedQuery = schemas.query.parse(req.query);
      }
      if (schemas.params) req.params = schemas.params.parse(req.params) as Request['params'];
      next();
    } catch (e) {
      next(e); // ZodError → error-handler
    }
  };
}

/** Recupera la query validada tipada dentro del controller. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
