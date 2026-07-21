import { z } from 'zod';
import { paginationSchema } from './common.js';

/** Requisitos de contraseña (mismos criterios que changePasswordSchema — Fase 7). */
const passwordSchema = z
  .string({ required_error: 'La contraseña es requerida' })
  .min(8, 'Mínimo 8 caracteres')
  .max(128)
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número');

/** Correo opcional: '' desde el formulario se normaliza a null en el servidor. */
const emailSchema = z
  .union([z.literal(''), z.string().trim().email('Correo inválido').max(120)])
  .optional()
  .nullable();

export const userCreateSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Mínimo 3 caracteres')
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Solo minúsculas, números, punto, guion y guion bajo'),
  fullName: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80),
  email: emailSchema,
  roleId: z.string().min(1, 'Selecciona un rol'),
  password: passwordSchema,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

/** El username nunca se edita (es la identidad en auditoría). */
export const userUpdateSchema = z
  .object({
    fullName: z.string().trim().min(3, 'Mínimo 3 caracteres').max(80),
    email: emailSchema,
    roleId: z.string().min(1, 'Selecciona un rol'),
    isActive: z.boolean(),
  })
  .partial();
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const userResetPasswordSchema = z.object({ newPassword: passwordSchema });
export type UserResetPasswordInput = z.infer<typeof userResetPasswordSchema>;

export const usersQuerySchema = paginationSchema.extend({
  includeInactive: z.coerce.boolean().optional(),
});
export type UsersQuery = z.infer<typeof usersQuerySchema>;
