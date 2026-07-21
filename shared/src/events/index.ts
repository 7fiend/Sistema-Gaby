/**
 * Catálogo tipado de eventos Socket.IO (AD-05: el socket solo NOTIFICA).
 * Payloads mínimos (ids); los datos completos siempre se re-consultan por REST.
 */

export interface ServerToClientEvents {
  'production:confirmed': (p: { orderId: string; orderNumber: string; date: string }) => void;
  'production:status-changed': (p: { orderId: string; status: string }) => void;
  'delivery:completed': (p: { orderId: string; requirementId: string; productId: string }) => void;
  'delivery:blocked': (p: { orderId: string; requirementId: string; productId: string; deltaKg: number }) => void;
  'stock:changed': (p: { productId: string }) => void;
  'stock:low': (p: { productId: string; name: string }) => void;
  'stock:expiring': (p: { productId: string; batchId: string; expiryDate: string }) => void;
  'recipe:cost-changed': (p: { recipeIds: string[] }) => void;
  'sales:registered': (p: { saleRecordId: string; date: string }) => void;
  'expense:created': (p: { expenseId: string }) => void;
  'alert:new': (p: { alertId: string; type: string; message: string }) => void;
}

export interface ClientToServerEvents {
  // Vacío por diseño: los clientes nunca mutan estado por socket (AD-05).
}

/** Salas por rol — el backend decide membresía según permisos del JWT. */
export const SOCKET_ROOMS = {
  ADMIN: 'room:admin',
  INVENTORY: 'room:inventory',
  KITCHEN: 'room:kitchen',
  AUDITOR: 'room:auditor',
} as const;

export type EventName = keyof ServerToClientEvents;
