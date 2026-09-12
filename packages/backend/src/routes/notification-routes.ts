import {
  deletePushSubscriptionSchema,
  errorSchema,
  notificationConfigResponseSchema,
  type PushSubscriptionResponse,
  pushSubscriptionResponseSchema,
  savePushSubscriptionSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { PushSubscription } from '../domain/push-subscription';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import {
  getVapidConfig,
  publicNotificationConfig,
} from '../notifications/vapid';
import { DisablePushSubscription } from '../usecases/disable-push-subscription';
import { SavePushSubscription } from '../usecases/save-push-subscription';

/**
 * ⚠️ **SEIS campos — e o `p256dh`, o `auth` e o `userId` NÃO SAEM.**
 *
 * O `p256dh` e o `auth` são as credenciais que cifram o push daquele aparelho:
 * devolvê-las não serve a tela nenhuma (o cliente acabou de mandá-las) e as
 * espalharia por log de proxy, histórico de devtools e cache. O `userId` fica
 * fora por outro motivo: este endereço só fala do dono do token, então
 * devolvê-lo seria repetir o que o cliente já sabe.
 *
 * O `response` schema já corta o que não está declarado (§6.1), mas o mapper
 * **enumera** de propósito: é a segunda barreira, e é a que sobrevive a alguém
 * trocar o schema um dia.
 */
function toResponse(subscription: PushSubscription): PushSubscriptionResponse {
  return {
    id: subscription.id,
    platform: subscription.platform,
    endpoint: subscription.endpoint,
    userAgent: subscription.userAgent,
    disabledAt:
      subscription.disabledAt === null
        ? null
        : subscription.disabledAt.toISOString(),
    createdAt: subscription.createdAt.toISOString(),
  };
}

/**
 * "Este aparelho recebe push" — as três rotas do Bloco I que **não enviam
 * nada** (Tarefa 36).
 *
 * ⚠️⚠️ **ESTA FATIA NÃO PRODUZ EFEITO FORA DA MÁQUINA, e é escolha de
 * segurança, não de escopo.** Aqui só se **lê** configuração e se **guarda**
 * inscrição. O `POST /notifications/test` do `docs/NOTIFICACOES.md` §4 **não
 * está aqui** porque ele **envia** — é a Tarefa 38, junto com o
 * `sendPushToUser`, o port `PushSender` e a dependência `web-push` (que hoje
 * não é dependência de pacote nenhum, e não precisa ser).
 *
 * ⚠️⚠️ **O ENDEREÇO NÃO TEM `clubId`, E NÃO HÁ `assertMembership` — a decisão
 * F.** Push é da **PESSOA**, não do clube: a mesma pessoa em dois clubes tem
 * **um** aparelho, e pôr `clubId` obrigaria a decidir "qual clube" num dado que
 * não tem clube. O corte de tenant é o **próprio JWT**, e a regra 12 é
 * **estrutural**: a busca da desativação é pelo par `(endpoint, ator)`, então a
 * inscrição de outra pessoa é inalcançável — não há `if` de autoria porque não
 * há nada que ele pudesse recusar. A prova está em
 * `notification-routes.integration.test.ts`, em
 * `never disables the subscription of another person, even with a smuggled
 * userId`.
 *
 * ⚠️ **A chave PÚBLICA pode chegar ao front; a PRIVADA nunca sai do backend.**
 * O único caminho da configuração para a rede é o `publicNotificationConfig`,
 * que enumera os dois campos do contrato — e o `response` schema é a segunda
 * barreira (§6.1).
 *
 * **Sem 403 em nenhuma das três:** não há papel a conferir. E **sem 404**: não
 * ter inscrição (nem configuração) **não é erro** — a `config` responde
 * `{ enabled: false }` com **200** (decisão G) e o `DELETE` é idempotente com
 * **204**.
 */
export const notificationRoutes: FastifyPluginAsyncZod<{
  prisma: PrismaClient;
}> = async (app, options) => {
  const repos = buildRepositories(options.prisma);
  // Os UseCases são instanciados UMA vez, no registro — não por request.
  const savePushSubscription = new SavePushSubscription(
    repos.pushSubscriptions,
  );
  const disablePushSubscription = new DisablePushSubscription(
    repos.pushSubscriptions,
  );

  /**
   * ⚠️ **A FEATURE NASCE DESLIGADA, E O DESLIGAMENTO É LIMPO** (decisão G, e o
   * `NOTIFICACOES.md` §3).
   *
   * Sem chave VAPID configurada — que é o estado de hoje: o `.env.example`
   * declara as duas variáveis **vazias** — a resposta é
   * `{ enabled: false, vapidPublicKey: null }` com **200**, e a tela esconde o
   * toggle. **Ninguém precisa de VAPID configurado para rodar o projeto.**
   *
   * **200 e não 404**: um 404 faria a tela tratar "não configurado" como erro,
   * e ela mostraria uma mensagem de falha para uma instalação perfeitamente
   * saudável.
   *
   * ⚠️ **O `getVapidConfig()` é chamado NO HANDLER, e não no registro.** Não é
   * descuido: um valor lido no registro ficaria congelado dentro da instância do
   * servidor, e o estado da feature passaria a depender de quando as rotas
   * foram montadas em vez de do ambiente. Três leituras de `process.env` por
   * request é o mesmo custo que o `CORS_ORIGIN` já paga no boot.
   *
   * **Sem UseCase**: não há regra de negócio nem repositório — é leitura de
   * ambiente, como o `JWT_SECRET` do `http/server.ts`. As duas propriedades que
   * importam (o desligamento limpo e "a privada não sai") são decidíveis no
   * unitário do `notifications/vapid.ts`, e é lá que elas moram (§7.10).
   */
  app.get(
    '/notifications/config',
    {
      schema: {
        summary: 'Se o push está configurado, e a chave PÚBLICA quando está',
        response: {
          200: notificationConfigResponseSchema,
          401: errorSchema,
        },
      },
    },
    async (_req, reply) =>
      reply.status(200).send(publicNotificationConfig(getVapidConfig())),
  );

  /**
   * "Ative o push neste aparelho" — **upsert por `endpoint`, e REATIVA**
   * (regra 10).
   *
   * ⚠️ **Responde 201 na primeira inscrição daquele aparelho e 200 nas
   * seguintes, e os DOIS status estão declarados.** O serializer do Zod é POR
   * STATUS: com só o 200 declarado, a rede de segurança do `preSerialization`
   * trocaria o corpo do 201 por um `{error}` genérico — e quebraria **a
   * primeira** ativação de cada aparelho, só a primeira, que é o pior tipo de
   * bug para achar. (E o curinga `'2xx'` é recusado no boot de propósito. →
   * §6.1.)
   *
   * O `created` vem do UseCase, e é a razão de ele devolver
   * `{ subscription, created }`: sem isso a borda teria de perguntar ao banco de
   * novo. É o mesmo desenho do `markRead`.
   */
  app.post(
    '/notifications/subscriptions',
    {
      schema: {
        summary: 'Inscreve (ou reativa) este aparelho para receber push',
        body: savePushSubscriptionSchema,
        response: {
          200: pushSubscriptionResponseSchema,
          201: pushSubscriptionResponseSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        const { subscription, created } = await savePushSubscription.execute({
          // O spread PRIMEIRO, o ator DEPOIS — sempre (§6.3). O corpo não
          // declara `userId`: o strip do `z.object` é a primeira barreira, o
          // `.strict()` transforma o contrabando em 400 explícito, e esta ordem
          // é a que passa a valer no dia em que alguém declarar o campo.
          ...req.body,
          actorUserId: req.user.sub,
        });
        return reply.status(created ? 201 : 200).send(toResponse(subscription));
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );

  /**
   * "Não quero mais push neste aparelho" — **desativação SOFT** (`disabledAt`)
   * e **idempotente**.
   *
   * ⚠️ **204 SEMPRE, inclusive quando não havia o que desligar** (regra 11, que
   * é a decisão C da Tarefa 30 na borda). Um 404 obrigaria a tela a distinguir
   * "desliguei" de "já estava desligado", que é a mesma coisa para quem olha — e
   * o `disablePushSubscription` já resolve sem escrever, sem nem chamar o
   * `update`.
   *
   * ⚠️ **204 e não 200-com-corpo, ao contrário do `DELETE /notes/:noteId`.** Lá
   * o soft delete devolve a linha atualizada porque o front quer o `status` e o
   * `archivedAt` que o servidor gravou. Aqui a tela não precisa do estado de
   * volta para saber que desligou — e um corpo teria de decidir se leva as
   * credenciais do aparelho, que é justamente o que elas não devem fazer.
   *
   * ⚠️ **O `response` do 204 é `z.null()`, e ele NÃO é decoração** — a guarda de
   * boot exige um schema para o status de sucesso, e sem ele o servidor não sobe
   * (§6.1). É o mesmo desenho do `DELETE /plan-items/:planItemId/reading-log`.
   *
   * ⚠️ **O `endpoint` vai no CORPO, e não na query.** Ele é uma URL inteira
   * (com o segredo do endereço do aparelho dentro), e URL dentro de query string
   * vai para log de acesso, para o `Referer` e para o histórico do navegador. O
   * corpo de um `DELETE` é incomum, e é o preço certo: o `deletePushSubscriptionSchema`
   * o declara com `.strict()`, e o teste da regra 12 é o que prova que o
   * caminho funciona ponta a ponta.
   */
  app.delete(
    '/notifications/subscriptions',
    {
      schema: {
        summary: 'Desliga o push deste aparelho (desativação soft)',
        body: deletePushSubscriptionSchema,
        response: {
          204: z.null(),
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      try {
        await disablePushSubscription.execute({
          // O spread PRIMEIRO, o ator DEPOIS — sempre (§6.3). ⚠️ É AQUI que o
          // mutante do §7.5 mora: `req.body.userId ?? req.user.sub` se
          // comportaria normalmente em todo teste que não manda o campo, e é
          // por isso que o teste de contrabando manda o campo com o ATOR
          // LEGÍTIMO e asserta a LINHA GRAVADA da outra pessoa.
          ...req.body,
          actorUserId: req.user.sub,
        });
        // `send(null)` e não `send()`: o type provider exige o payload que o
        // `response[204]` declara, e é o compilador cobrando o que o §6.1 pede.
        // O Fastify não escreve corpo em 204.
        return reply.status(204).send(null);
      } catch (error) {
        return handleDomainError(error, reply);
      }
    },
  );
};
