import { z } from 'zod';

export const loginSchema = z.object({
  username: z
    .string({ required_error: 'El usuario es requerido' })
    .trim()
    .min(3, 'Mínimo 3 caracteres')
    .max(40),
  password: z
    .string({ required_error: 'La contraseña es requerida' })
    .min(8, 'Mínimo 8 caracteres')
    .max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Requerida'),
    newPassword: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe incluir una mayúscula')
      .regex(/[0-9]/, 'Debe incluir un número'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
