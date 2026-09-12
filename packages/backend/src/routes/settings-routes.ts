import {
  errorSchema,
  type SettingsResponse,
  settingsResponseSchema,
  updateSettingsSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import type { SettingsPreferences } from '../domain/settings';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { GetSettings } from '../usecases/get-settings';
import { UpdateSettings } from '../usecases/update-settings';

/**
 * As CINCO preferências, e nada mais — nem `id`, nem `userId`.
 *
 * O `response` schema já corta o que não está declarado (§6.1), mas o mapper
 * **enumera** de propósito: é a segunda barreira, e é a que sobrevive a alguém
 * trocar o schema um dia.
 */
function toResponse(preferences: SettingsPreferences): SettingsResponse {
  return {
    timezone: preferences.timezone,
    locale: preferences.locale,
    reminderTime: preferences.reminderTime,
    reminderEnabled: preferences.reminderEnabled,
    notifyGroupActivity: preferences.notifyGroupActivity,
  };
}

/**
 * "As minhas preferências" — as duas rotas do `Settings` (Tarefa 36).
 *
 * ⚠️⚠️ **O ENDEREÇO É `/me/settings`, E ELE NÃO TEM `clubId` — a decisão A, e é
 * a diferença mais fácil de estranhar deste arquivo.**
 *
 * O `Settings` é do **USUÁRIO**: é `unique(userId)` desde a Tarefa 03 e não tem
 * `clubId`. Então **não há `assertMembership` aqui**, e isso não é esquecimento
 * — não existe clube a conferir. **O corte de tenant é o próprio JWT**: o único
 * endereço é "o meu", e nenhum input aceita `userId`. A prova de que isso
 * basta está em `settings-routes.integration.test.ts`, no bloco
 * `answers each token with its own row, never the neighbour one` e nos
 * contrabandos — a ausência de guard é correta aqui e seria um furo em qualquer
 * outra rota, então ela está **provada**, não suposta.
 *
 * ⚠️ **Mora em arquivo próprio, e não no `me-routes.ts`.** O `/me` é a sessão
 * (quem sou eu, de que clubes participo) e já tem um UseCase próprio; as
 * preferências são outra entidade, com repositório e UseCases próprios — o
 * mesmo motivo pelo qual `highlight-routes.ts` e `reading-log-routes.ts`
 * nasceram separados do `note-routes.ts`. O **prefixo** `/me` é partilhado de
 * propósito: ele é o que diz, na URL, que o recurso é do dono do token.
 *
 * ⚠️ **REGISTRADO: o `/me` NÃO devolve o fuso, e continua não devolvendo.** É a
 * lacuna da Tarefa 16, e ela é real — mas a spec desta fatia decidiu
 * **registrar, não implementar**: o front usa o fuso do **navegador**, que é o
 * certo para "hoje para quem está olhando". Quando a tela expuser a escolha
 * explícita (36b), ela vence.
 *
 * **Sem 403 em nenhuma das duas:** não há papel a conferir — as preferências
 * são de quem as tem, e nem o `OWNER` do clube nem o super-admin mexem nas de
 * outra pessoa.
 *
 * **Sem 404 em nenhuma das duas**, e é a decisão B: não ter linha **não é
 * erro** — o `GET` devolve o `DEFAULT_SETTINGS` e o `PATCH` cria. O caso é o
 * super-admin do seed, que nunca aceitou convite e por isso nunca teve a linha.
 *
 * **400 declarado só no `PATCH`**, porque só ele produz: o corpo passa pelo
 * `updateSettingsSchema` (que valida `HH:mm` e recusa chave proibida com
 * `.strict()`), e o `assertReminderTime` do domínio é a segunda barreira. O
 * `GET` não tem corpo nem parâmetro — não há o que validar.
 */
export const settingsRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const getSettings = new GetSettings(repos.settings);
  const updateSettings = new UpdateSettings(repos.settings);

  app.get(
    '/me/settings',
    {
      schema: {
        summary: 'As preferências de notificação e de fuso da pessoa',
        response: {
          200: settingsResponseSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const preferences = await getSettings.execute({
          // Nenhum spread: esta rota não tem corpo nem parâmetro. O dono vem do
          // JWT. → §6.3.
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toResponse(preferences));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * "Mudei de ideia": **PATCH parcial** (decisão C), e a resposta é o estado
   * novo INTEIRO.
   *
   * `PATCH` e não `PUT` porque a tela da 36b mexe em três campos de cinco:
   * exigir o objeto inteiro faria ela mandar `timezone` e `locale` que não
   * edita, e um dia sobrescrever com valor velho.
   *
   * **200 e não 201**, mesmo quando a linha é criada (regra 3): para quem está
   * olhando não há recurso novo — o recurso é "as minhas preferências", e ele
   * sempre existiu (o `GET` devolve o padrão). Um 201 aqui obrigaria a tela a
   * distinguir dois casos que são o mesmo, e criaria um segundo status para
   * declarar e serializar (§6.1: o serializer é POR STATUS).
   */
  app.patch(
    '/me/settings',
    {
      schema: {
        summary: 'Ajusta as próprias preferências (patch parcial)',
        body: updateSettingsSchema,
        response: {
          200: settingsResponseSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const preferences = await updateSettings.execute({
          // O spread PRIMEIRO, o ator DEPOIS — sempre (§6.3). E o corpo não
          // declara `userId`: o strip do `z.object` é a primeira barreira, o
          // `.strict()` transforma o contrabando em 400 explícito, e esta ordem
          // é a que passa a valer no dia em que alguém declarar o campo.
          ...req.body,
          actorUserId: req.user.sub,
        });
        return reply.status(200).send(toResponse(preferences));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
