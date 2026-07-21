/**
 * Matriz de permisos recurso × acción (análisis funcional §2).
 * Evaluada en 3 puntos: middleware HTTP, salas de socket y guards del frontend.
 * La autoridad real siempre es el backend; el frontend solo la usa para UX.
 */

export const PERMISSION_MATRIX = {
  dashboard: ['read'],
  recipes: ['read', 'create', 'update', 'deactivate'],
  products: ['read', 'create', 'update', 'deactivate'],
  inventory: ['read', 'entry', 'adjust', 'waste'],
  production: ['read', 'create', 'confirm', 'cancel', 'close', 'start', 'complete'],
  delivery: ['read', 'deliver'],
  kitchen: ['read'],
  sales: ['read', 'create'],
  expenses: ['read', 'create', 'update'],
  reports: ['read', 'generate', 'export'],
  audit: ['read'],
  users: ['read', 'create', 'update', 'deactivate'],
  settings: ['read', 'update'],
  backups: ['read', 'create', 'restore'],
  /** Fase 18: el listado (kind=RECIPE/PRODUCT/EXPENSE) ya es de lectura abierta a cualquier autenticado. */
  categories: ['create', 'update', 'deactivate'],
  /** Fase 18: menú semanal (día×tiempo de comida×categoría) y "menú de hoy" con recomendación. */
  menu: ['read', 'update'],
  /** Fase 18: registrar consumo diario de productos de aseo (no pasa por inventory:adjust). */
  routine: ['register'],
} as const;

export type Resource = keyof typeof PERMISSION_MATRIX;
export type ActionOf<R extends Resource> = (typeof PERMISSION_MATRIX)[R][number];

/** Permiso serializado: "recipes:update" */
export type PermissionKey = {
  [R in Resource]: `${R}:${ActionOf<R>}`;
}[Resource];

export function permissionKey<R extends Resource>(resource: R, action: ActionOf<R>): PermissionKey {
  return `${resource}:${action}` as PermissionKey;
}

/** Usuario autenticado tal como viaja en el JWT y en el contexto de request. */
export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: string;
  permissions: PermissionKey[];
}

export function can(user: Pick<AuthUser, 'permissions'>, key: PermissionKey): boolean {
  return user.permissions.includes(key);
}
