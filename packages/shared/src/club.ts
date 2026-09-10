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

/**
 * Uma pessoa do clube, como sai na resposta — Tarefa 26a.
 *
 * **Exatamente quatro campos, e o schema é a fronteira**: é o
 * `serializerCompiler` do Zod que corta o que não está declarado, e sem ele o
 * objeto de domínio inteiro iria para a rede (foi provado com `passwordHash`
 * vazando de um `/me` sem schema). → `docs/CONVENCOES-CODIGO.md` §6.1.
 *
 * **Sem e-mail**: a tela precisa de NOME para atribuir autoria; expor o e-mail
 * de todo membro a todo membro é PII além da necessidade e nenhuma tela pediu.
 * Se a gerência do clube (MVP 4) precisar, entra lá, com decisão do dono.
 *
 * `name` é **obrigatório e anulável** — nunca `optional()`. `User.name` é
 * `String?` e o aceite de convite não exige nome, então o `null` é estado real
 * e a tela decide a frase com `t()`. Já a AUSÊNCIA do campo quebraria o front
 * em cheio, porque o cliente valida a resposta de sucesso (§6.8).
 */
export const clubMemberResponseSchema = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  role: memberRole,
  /**
   * `ARCHIVED` = a pessoa SAIU do clube, e ainda assim ela vem na lista: sair
   * arquiva o `Membership` e não apaga o que ela escreveu — "o acervo do clube
   * continua íntegro, com autoria" (`docs/adr/0002-visibilidade-total-no-clube.md`).
   * A tela usa este campo para decidir quem vira chip do filtro por pessoa (só
   * os ativos) e quem serve apenas para resolver o nome de quem escreveu.
   */
  status: generalStatus,
});

/** Quem é o clube, na ordem que o `listClubMembers` decidiu (nome crescente). */
export const clubMembersResponseSchema = z.array(clubMemberResponseSchema);

export type MemberRoleValue = z.infer<typeof memberRole>;
export type CreateClubBody = z.infer<typeof createClubSchema>;
export type ClubResponse = z.infer<typeof clubResponseSchema>;
export type ClubMemberResponse = z.infer<typeof clubMemberResponseSchema>;
export type ClubMembersResponse = z.infer<typeof clubMembersResponseSchema>;
