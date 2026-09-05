import { z } from 'zod';

import { memberRole } from './club';

/** O convite nunca concede OWNER (regra 3 da Tarefa 02). */
export const invitableRole = z.enum(['ADMIN', 'MEMBER']);

export const createInviteSchema = z.object({
  role: invitableRole.optional(),
  ttlDays: z.number().int().positive().optional(),
});

export const acceptInviteSchema = z.object({
  // .trim() antes de .email() — ver a nota em auth.ts. O aceite é a primeira
  // digitação que a pessoa faz no celular, onde espaço final é comum.
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export const inviteResponseSchema = z.object({
  id: z.string(),
  clubId: z.string(),
  code: z.string(),
  role: memberRole,
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const acceptInviteResponseSchema = z.object({
  token: z.string(),
  clubId: z.string(),
});

export const inviteCodeParamsSchema = z.object({
  code: z.string().min(1),
});

export type CreateInviteBody = z.infer<typeof createInviteSchema>;
export type AcceptInviteBody = z.infer<typeof acceptInviteSchema>;
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
export type AcceptInviteResponse = z.infer<typeof acceptInviteResponseSchema>;
