import { z } from 'zod';

import { memberRole } from './club';

export const loginSchema = z.object({
  // A ORDEM importa: .trim() antes de .email(). Ao contrário
  // (.email().trim()) a validação roda primeiro e '  a@b.com  ' continua
  // rejeitado, com aparência de estar consertado.
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  token: z.string(),
});

export const meResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  isSuperAdmin: z.boolean(),
  clubs: z.array(
    z.object({ id: z.string(), name: z.string(), role: memberRole }),
  ),
});

export type LoginBody = z.infer<typeof loginSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
