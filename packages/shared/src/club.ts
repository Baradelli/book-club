import { z } from 'zod';

export const memberRole = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export const generalStatus = z.enum(['ACTIVE', 'ARCHIVED']);

export const createClubSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().min(1).optional(),
  ownerUserId: z.string().min(1).optional(),
});

export const clubResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
  status: generalStatus,
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const clubIdParamsSchema = z.object({ clubId: z.string().min(1) });

export type MemberRoleValue = z.infer<typeof memberRole>;
export type CreateClubBody = z.infer<typeof createClubSchema>;
export type ClubResponse = z.infer<typeof clubResponseSchema>;
