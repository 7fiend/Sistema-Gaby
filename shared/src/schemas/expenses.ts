import { z } from 'zod';
import { paginationSchema } from './common.js';

/** Gasto operativo (categoría kind=EXPENSE). */
export const expenseSchema = z.object({
  categoryId: z.string().min(1, 'Selecciona una categoría'),
  amount: z.coerce.number().positive('El monto debe ser mayor a 0'),
  date: z.coerce.date(),
  description: z.string().trim().min(3, 'Describe el gasto (mínimo 3 caracteres)').max(200),
  receiptUrl: z.string().trim().max(300).optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;

export const expensesQuerySchema = paginationSchema.extend({
  categoryId: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ExpensesQuery = z.infer<typeof expensesQuerySchema>;
