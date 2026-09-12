import {
  deletePushSubscriptionSchema,
  errorSchema,
  notificationConfigResponseSchema,
  notificationSendResponseSchema,
  type PushSubscriptionResponse,
  pushSubscriptionResponseSchema,
  savePushSubscriptionSchema,
} from '@clube/shared';
import type { PrismaClient } from '@prisma/client';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import type { PushSubscription } from '../domain/push-subscription';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { handleDomainError } from '../http/handle-domain-error';
import { buildRepositories } from '../http/repositories';
import { buildTestNotification } from '../notifications/diagnostic-message';
import {
  getVapidConfig,
  publicNotificationConfig,
} from '../notifications/vapid';
import { WebPushSender } from '../notifications/web-push-sender';
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
 * "Este aparelho recebe push" — as três rotas do Bloco I que não enviam nada
 * (Tarefa 36), **mais a quarta, que envia** (Tarefa 38).
 *
 * ⚠️⚠️ **A TAREFA 36 ESCREVEU AQUI QUE ESTE ARQUIVO NÃO PRODUZIA EFEITO FORA DA
 * MÁQUINA. NÃO É MAIS VERDADE, E A LINHA FOI TROCADA EM VEZ DE SOBREVIVER.**
 * O `POST /notifications/test` do `docs/NOTIFICACOES.md` §4 chegou com a Tarefa
 * 38, junto do `WebPushSender` e da dependência `web-push` — e ele **manda push
 * de verdade**, para os aparelhos de quem chamou. As três primeiras continuam
 * só lendo configuração e guardando inscrição.
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

  /**
   * ⚠️⚠️ **"CHEGOU?" — A PRIMEIRA ROTA DESTE PROJETO QUE PRODUZ EFEITO FORA DA
   * MÁQUINA** (Tarefa 38).
   *
   * A Tarefa 36 escreveu aqui, por extenso, que esta rota ficava de fora
   * *"porque ela **envia**"*. Ela chegou — e com as duas guardas que a decisão
   * F pede:
   *
   * ⚠️ **1. MANDA SÓ PARA OS APARELHOS DE QUEM CHAMOU.** O `req.user.sub`, e
   * não um `userId` de corpo ou de query — o corpo nem existe. *"Um endereço
   * que manda push para outra pessoa é uma arma, mesmo dentro do clube"*: com
   * um alvo no corpo, qualquer membro poderia fazer o celular de outro vibrar
   * em loop, e nenhum `assertMembership` recusaria isso (não há clube nesta
   * rota — decisão F da 36). Aqui não há alvo a contrabandear, então não há
   * guard de autoria para alguém esquecer de escrever.
   *
   * ⚠️ **2. NÃO GRAVA `NotificationDelivery`.** É **diagnóstico, não entrega**:
   * o claim é a reserva do aviso do dia (`@@unique([userId, kind, localDate])`),
   * e gastá-lo aqui faria testar o push **consumir a idempotência do dia** — a
   * pessoa apertaria o botão e ficaria sem o lembrete da noite. Pelo mesmo
   * motivo `TEST` não entra no `NOTIFICATION_KINDS` (decisão G): aquela lista é
   * o vocabulário da chave, e um `TEST` nela significaria "só dá para testar
   * uma vez por dia".
   *
   * ⚠️ **400 quando não há VAPID** (`NOTIFICACOES.md` §4), e é o único lugar da
   * feature em que "desligado" vira erro — porque aqui a pessoa **pediu** um
   * envio, e um 200 com `{ sent: 0 }` diria "mandei para nenhum aparelho"
   * quando o certo é "não há como mandar". O `GET /config` continua respondendo
   * 200 com `enabled: false`: lá a pergunta é outra.
   *
   * **Sem `POST` de corpo e sem 404**: não ter aparelho inscrito devolve
   * `{ sent: 0, disabled: 0 }` com 200 — é resposta honesta, e a tela diz
   * "nenhum aparelho inscrito" sem tratar isso como falha.
   *
   * ⚠️⚠️ **E QUANDO O ENVIO FALHA, A RESPOSTA É 500 — DELIBERADAMENTE, E O 500
   * NÃO ESTÁ NO MAPA `response`** (decisão da rodada de conserto da Tarefa 38).
   *
   * Não há `try/catch` em volta do `sender.send`, e é escolha: um erro que não
   * seja 404/410 (o serviço de push fora do ar, um 500 do lado deles, a rede
   * caindo) sobe, o `setErrorHandler` do `http/server.ts` o loga com
   * `'unhandled error'` e responde `{ error }` genérico com **500**.
   *
   * **Não há vazamento** — quem troca a mensagem por uma pública é aquele
   * handler, e o `response` schema não declarar 500 não abre buraco nenhum: o
   * corpo do erro não passa por este mapa. O que se perde é **precisão**: o
   * botão de diagnóstico diz "erro do servidor" para uma falha que é do
   * **serviço de push**, e a pessoa que aperta não distingue "o clube está
   * quebrado" de "o Google/Mozilla está fora do ar agora".
   *
   * ⚠️ **E mesmo assim NÃO declaramos 502/503 aqui.** Crescer o contrato da API
   * na última fatia do MVP 3, sem o dono pedir, é a mudança que ninguém revisa
   * — e um status novo tem cauda: a tela passa a ter um ramo a mais, o catálogo
   * uma frase a mais, e o `POST /test` deixa de ser o endereço mais simples da
   * feature. O log já leva a causa para quem for diagnosticar, que é para quem
   * a distinção importa hoje.
   *
   * **Fatia futura, e o gatilho é o dono:** se ele disser que a frase confunde,
   * o conserto é `try/catch` aqui + um status próprio (`502` ou `503`)
   * declarado no `response` + a frase no catálogo. Está escrito para que a
   * próxima pessoa encontre a decisão, e não o silêncio.
   *
   * ⚠️ **Sem teste do 500 NESTA rota, e o motivo é estrutural, não preguiça.**
   * Ela monta o `WebPushSender` por dentro (`new WebPushSender(...)`, sem
   * costura de injeção — decisão F: não há o que parametrizar num endereço que
   * só fala do próprio ator), então a única forma de fazê-lo falhar num teste é
   * dar-lhe uma inscrição com endpoint de mentira — e aí o pacote `web-push`
   * **abre socket de verdade** contra um host inexistente. Seria a suíte deste
   * projeto produzindo tráfego de rede, e instável fora de linha, para provar
   * uma tradução de status que não é desta rota.
   *
   * ⚠️ **E o registro honesto do que EXISTE, para ninguém achar mais do que
   * há:** a tradução "exceção que ninguém mapeia → 500 com corpo genérico" é do
   * `setErrorHandler` do `http/server.ts` e vale para todas as rotas. O que tem
   * teste é o lado de baixo dela — `http/__tests__/handle-domain-error.test.ts`
   * prova que um erro fora do mapa é **relançado** em vez de virar um 400
   * mentiroso —, e o 500 resultante já foi **observado** por medição em
   * `routes/__tests__/book-routes.integration.test.ts` (`500`, corpo
   * `{"error":"Internal Server Error"}`). Um teste ponta a ponta que force o
   * 500 **por esta** rota não existe.
   */
  app.post(
    '/notifications/test',
    {
      schema: {
        summary:
          'Manda uma notificação de teste para os aparelhos de quem chamou',
        response: {
          200: notificationSendResponseSchema,
          400: errorSchema,
          401: errorSchema,
        },
      },
    },
    async (req, reply) => {
      // Lido no HANDLER, como no `GET /config` e pelo mesmo motivo: o estado da
      // feature é o do ambiente naquele request, não o de quando as rotas foram
      // montadas.
      const vapid = getVapidConfig();
      if (vapid === null) {
        return reply
          .status(400)
          .send({ error: 'push notifications are not configured' });
      }

      // O idioma de quem vai receber — que aqui é quem chamou. Sem linha de
      // `Settings` (ninguém abriu a tela de preferências), o padrão do projeto.
      const settings = await repos.settings.byUserId(req.user.sub);
      const sender = new WebPushSender(repos.pushSubscriptions, vapid);

      const result = await sender.send(
        // ⚠️ O ATOR, e não há outro caminho: esta rota não lê `userId` de lugar
        // nenhum (§6.3, e a regra 12 da Tarefa 36 aplicada ao ENVIO).
        req.user.sub,
        buildTestNotification({
          locale: settings?.locale ?? DEFAULT_SETTINGS.locale,
        }),
      );

      return reply.status(200).send(result);
    },
  );
};
