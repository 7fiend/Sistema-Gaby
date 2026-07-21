import { ERROR_CODES, type ErrorCode } from '@gaby/shared';

/**
 * Jerarquía única de errores de la aplicación (AD-11).
 * El error-handler los traduce al envelope { error: { code, message, details } }.
 */
export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(ERROR_CODES.NOT_FOUND, `${entity} no encontrado${id ? ` (${id})` : ''}`, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODES.VALIDATION_ERROR, message, 400, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(ERROR_CODES.CONFLICT, message, 409, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autenticado', code: ErrorCode = ERROR_CODES.UNAUTHORIZED) {
    super(code, message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para esta operación') {
    super(ERROR_CODES.FORBIDDEN, message, 403);
  }
}

/** Violaciones de reglas de negocio (stock, tolerancia, transiciones, inmutabilidad). */
export class BusinessRuleError extends AppError {
  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(code, message, 422, details);
  }
}
