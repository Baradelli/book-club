import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';
import { required } from '../../test-support/builders';
import { generateEphemeralVapidKeys } from '../../test-support/ephemeral-vapid-keys';

/**
 * ⚠️ **REGRAS 10, 11, 12, 14 e 15 DA TAREFA 36, ponta a ponta.**
 *
 * ⚠️ **NENHUMA CHAVE REAL APARECE AQUI.** O único par usado é **gerado na hora,
 * em memória, e descartado** (`test-support/ephemeral-vapid-keys.ts`), e o
 * ambiente é mexido com `vi.stubEnv` — o `.env` do dono não é lido nem escrito
 * por teste nenhum.
 *
 * ⚠️ **A decisão F é o assunto: estas rotas NÃO TÊM `clubId` e NÃO PASSAM PELO
 * `assertMembership`.** Push é da PESSOA — a mesma pessoa em dois clubes tem UM
 * aparelho. O corte é o JWT, e a regra 12 é **estrutural**: a busca é pelo par
 * `(endpoint, ator)`.
 *
 * ⚠️ A limpeza **CONSULTA o banco** (§6.6): a inscrição nasce com id gerado
 * pelo SERVIDOR (`randomUUID()` dentro do UseCase), que nenhum teste conhece, e
 * `PushSubscription_userId_fkey` é `ON DELETE RESTRICT` — uma inscrição
 * esquecida impede o `user.delete` do `afterAll`. Foi exatamente esta classe de
 * FK nova que quebrou o `afterAll` de quatro arquivos na Tarefa 34, **com os
 * testes verdes**.
 */

const MARIA_ID = prefixedId('t36n', 'push-maria');
const MARCOS_ID = prefixedId('t36n', 'push-marcos');
const EVERY_USER_ID = [MARIA_ID, MARCOS_ID] as const;

/** Endpoint único por execução: o `@@unique` da tabela é global. */
function anEndpoint(label: string): string {
  return `https://fcm.googleapis.com/fcm/send/t36n-${label}-${randomUUID()}`;
}

interface SubscriptionBody {
  id: string;
  platform: string;
  endpoint: string;
  userAgent: string | null;
  disabledAt: string | null;
  createdAt: string;
}

interface ConfigBody {
  enabled: boolean;
  vapidPublicKey: string | null;
}

function aBody(endpoint: string, overrides: Record<string, unknown> = {}) {
  return {
    platform: 'web',
    subscription: {
      endpoint,
      keys: { p256dh: 'BFake-p256dh', auth: 'fake-auth' },
    },
    userAgent: 'Mozilla/5.0 (fixture)',
    ...overrides,
  };
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t36n', prefix), name: prefix },
    update: {},
  });
}

/** Apaga TODA inscrição das pessoas deste arquivo, consultando o banco. */
async function wipeSubscriptions(): Promise<void> {
  const rows = await prisma.pushSubscription.findMany({
    where: { userId: { in: [...EVERY_USER_ID] } },
    select: { id: true },
  });
  if (rows.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }
}

describe('notification routes', () => {
  let app: FastifyInstance;
  let mariaToken: string;
  let marcosToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    for (const [id, prefix] of [
      [MARIA_ID, 'maria'],
      [MARCOS_ID, 'marcos'],
    ] as const) {
      await seedUser(id, prefix);
    }

    mariaToken = app.jwt.sign({ sub: MARIA_ID });
    marcosToken = app.jwt.sign({ sub: MARCOS_ID });
  });

  afterAll(async () => {
    await wipeSubscriptions();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    await wipeSubscriptions();
  });

  /** O `vi.stubEnv` é global e vaza para o arquivo inteiro se não for desfeito. */
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('authentication', () => {
    /**
     * As três rotas nasceriam PÚBLICAS se o registro fosse para fora do escopo
     * autenticado, e **nada mais no projeto notaria** — o mesmo bloco que o
     * `highlight-routes` e o `reading-log-routes` têm.
     *
     * ⚠️ **E aqui o preço é maior:** um `GET /notifications/config` público
     * vazaria a chave pública VAPID para qualquer um (inofensivo em si, mas é
     * informação de configuração), e um `POST` público deixaria qualquer um
     * inscrever aparelho em nome de... ninguém — ele estouraria na FK, em 500.
     */
    it.each([
      ['GET', '/notifications/config', undefined],
      ['POST', '/notifications/subscriptions', { platform: 'web' }],
      [
        'DELETE',
        '/notifications/subscriptions',
        { endpoint: 'https://x.test/a' },
      ],
    ])('answers 401 to %s %s with no token', async (method, url, payload) => {
      const response = await app.inject({
        method: method as 'GET' | 'POST' | 'DELETE',
        url,
        ...(payload === undefined ? {} : { payload }),
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /notifications/config', () => {
    /**
     * ⚠️ **REGRA 14 — SEM CHAVE CONFIGURADA: 200 com
     * `{ enabled: false, vapidPublicKey: null }`** (decisão G).
     *
     * É o estado real da máquina do dono hoje: o `.env.example` declara as
     * variáveis VAZIAS e nenhum `.env` tem valor, então a feature **nasce
     * desligada** — o caminho limpo do `NOTIFICACOES.md` §3. E é **200**, não
     * 404: um 404 faria a tela tratar "não configurado" como erro, e o 200 com
     * `enabled: false` é o que a deixa esconder o toggle sem drama.
     */
    it('answers 200 with the disabled shape when there is no key', async () => {
      vi.stubEnv('VAPID_PUBLIC_KEY', '');
      vi.stubEnv('VAPID_PRIVATE_KEY', '');

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/config',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<ConfigBody>()).toEqual({
        enabled: false,
        vapidPublicKey: null,
      });
    });

    /** Meia configuração é configuração nenhuma: sem a privada, desligado. */
    it.each([
      ['only the public key is set', 'uma-publica', ''],
      ['only the private key is set', '', 'uma-privada'],
    ])('answers the disabled shape when %s', async (_label, pub, priv) => {
      vi.stubEnv('VAPID_PUBLIC_KEY', pub);
      vi.stubEnv('VAPID_PRIVATE_KEY', priv);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/config',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(response.json<ConfigBody>()).toEqual({
        enabled: false,
        vapidPublicKey: null,
      });
    });

    /**
     * ⚠️ **REGRA 15 — COM CHAVE CONFIGURADA, SAI A PÚBLICA, E A RESPOSTA NÃO
     * CONTÉM A PRIVADA.**
     *
     * O par é **gerado na hora e descartado** — nunca uma chave real. E a
     * asserção é sobre o **corpo cru** (`response.body`), não sobre a lista de
     * chaves do JSON: é o que pega uma privada escondida num campo com outro
     * nome, num objeto aninhado, ou num `toJSON` esperto.
     */
    it('answers the PUBLIC key, and the body never carries the private one', async () => {
      const pair = generateEphemeralVapidKeys();
      vi.stubEnv('VAPID_PUBLIC_KEY', pair.publicKey);
      vi.stubEnv('VAPID_PRIVATE_KEY', pair.privateKey);
      vi.stubEnv('VAPID_SUBJECT', 'mailto:dono@clube.test');

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/config',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<ConfigBody>()).toEqual({
        enabled: true,
        vapidPublicKey: pair.publicKey,
      });
      // ⚠️ O SEGREDO NÃO ESTÁ NO CORPO...
      expect(response.body).not.toContain(pair.privateKey);
      // ...nem o `subject`, que é o e-mail do responsável (PII de graça)...
      expect(response.body).not.toContain('dono@clube.test');
      // ...e a PRECONDIÇÃO, sem a qual os dois `not.toContain` passariam com um
      // corpo vazio: a PÚBLICA está lá.
      expect(response.body).toContain(pair.publicKey);
    });

    /**
     * ⚠️ **E a privada não sai em NENHUM header tampouco.** O corpo é a porta
     * óbvia; um header é a porta que ninguém olha.
     */
    it('never leaks the private key through a header', async () => {
      const pair = generateEphemeralVapidKeys();
      vi.stubEnv('VAPID_PUBLIC_KEY', pair.publicKey);
      vi.stubEnv('VAPID_PRIVATE_KEY', pair.privateKey);

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/config',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(JSON.stringify(response.headers)).not.toContain(pair.privateKey);
    });
  });

  describe('POST /notifications/subscriptions', () => {
    /** ⚠️ 201 na primeira inscrição daquele aparelho. */
    it('answers 201 and stores the subscription of the actor', async () => {
      const endpoint = anEndpoint('first');

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<SubscriptionBody>();
      expect(body.endpoint).toBe(endpoint);
      expect(body.platform).toBe('web');
      expect(body.userAgent).toBe('Mozilla/5.0 (fixture)');
      expect(body.disabledAt).toBeNull();

      const row = required(
        await prisma.pushSubscription.findUnique({ where: { endpoint } }),
      );
      expect(row.userId).toBe(MARIA_ID);
      expect(row.p256dh).toBe('BFake-p256dh');
      expect(row.auth).toBe('fake-auth');
    });

    /**
     * ⚠️ **AS CHAVES DO APARELHO NÃO SAEM NA RESPOSTA** — o `response` schema é
     * fronteira (§6.1), e o `pushSubscriptionResponseSchema` não as declara.
     * Devolvê-las não serve a tela nenhuma (o cliente acabou de mandá-las) e as
     * espalharia por log de proxy, histórico de devtools e cache.
     */
    it('never sends the device keys nor the userId back', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(anEndpoint('nokeys')),
      });

      expect(Object.keys(response.json<SubscriptionBody>()).sort()).toEqual([
        'createdAt',
        'disabledAt',
        'endpoint',
        'id',
        'platform',
        'userAgent',
      ]);
      expect(response.body).not.toContain('BFake-p256dh');
      expect(response.body).not.toContain('fake-auth');
      expect(response.body).not.toContain(MARIA_ID);
    });

    /**
     * ⚠️ **REGRA 10 — UPSERT POR `endpoint`: 200 na segunda vez, e UMA linha.**
     *
     * Com upsert por `id`, o segundo `POST` (o retry da fila offline, ou a
     * pessoa reativando) bateria no `@@unique([endpoint])` e viraria `P2002` —
     * que a borda **não mapeia**, ou seja **500**.
     */
    it('answers 200 on the second POST of the same device, keeping one row', async () => {
      const endpoint = anEndpoint('again');
      const first = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      const again = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint, { userAgent: 'Mozilla/5.0 (outro dia)' }),
      });

      expect(first.statusCode).toBe(201);
      expect(again.statusCode).toBe(200);
      expect(again.json<SubscriptionBody>().id).toBe(
        first.json<SubscriptionBody>().id,
      );
      expect(again.json<SubscriptionBody>().userAgent).toBe(
        'Mozilla/5.0 (outro dia)',
      );
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **REGRA 10 — O `POST` REATIVA** (`disabledAt = null`), ponta a ponta:
     * `POST` → `DELETE` → `POST`, e a inscrição volta ATIVA.
     *
     * Sem isto, a pessoa que desliga e liga de novo ficaria com uma inscrição
     * que a tela mostra como ativa e que nunca recebe push — o envio da Tarefa
     * 38 lê só as ativas.
     */
    it('reactivates a subscription the person had turned off', async () => {
      const endpoint = anEndpoint('reactivate');
      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });
      await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint },
      });
      // A precondição: ela está DESLIGADA.
      expect(
        required(
          await prisma.pushSubscription.findUnique({ where: { endpoint } }),
        ).disabledAt,
      ).not.toBeNull();

      const back = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      expect(back.statusCode).toBe(200);
      expect(back.json<SubscriptionBody>().disabledAt).toBeNull();
      expect(
        required(
          await prisma.pushSubscription.findUnique({ where: { endpoint } }),
        ).disabledAt,
      ).toBeNull();
    });

    /**
     * ⚠️ **Funciona SEM MEMBERSHIP NENHUM** (decisão F): push é da pessoa, e
     * estas duas pessoas não são de clube algum neste arquivo.
     */
    it('works for someone who is in no club at all', async () => {
      await expect(
        prisma.membership.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(0);

      const response = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(anEndpoint('noclub')),
      });

      expect(response.statusCode).toBe(201);
    });

    it('accepts both platforms of the vocabulary', async () => {
      for (const platform of ['web', 'mobile']) {
        const response = await app.inject({
          method: 'POST',
          url: '/notifications/subscriptions',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload: aBody(anEndpoint(platform), { platform }),
        });

        expect(response.json<SubscriptionBody>().platform).toBe(platform);
      }
    });

    it.each([
      ['a platform outside the vocabulary', { platform: 'desktop' }],
      ['no platform at all', { platform: undefined }],
      [
        'an endpoint that is not a URL',
        {
          subscription: { endpoint: 'nope', keys: { p256dh: 'a', auth: 'b' } },
        },
      ],
      ['no keys', { subscription: { endpoint: 'https://push.test/x' } }],
      [
        'an empty p256dh',
        {
          subscription: {
            endpoint: 'https://push.test/y',
            keys: { p256dh: '', auth: 'b' },
          },
        },
      ],
    ])('answers 400 to %s, and writes nothing', async (_label, overrides) => {
      const response = await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(anEndpoint('bad'), overrides),
      });

      // ⚠️ O ESTADO GRAVADO PRIMEIRO, o status depois — a mesma ordem
      // deliberada do teste do contrabando abaixo: um corpo que a borda
      // deixasse passar viraria 201 **e** linha no banco, e com a asserção de
      // status na frente a metade que o nome promete ("and writes nothing")
      // nunca rodaria.
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARIA_ID } }),
      ).resolves.toBe(0);
      expect(response.statusCode).toBe(400);
    });

    /**
     * ⚠️ **O CONTRABANDO no `POST`, com o ATOR LEGÍTIMO** (§7.5): o `.strict()`
     * do `savePushSubscriptionSchema` transforma a chave proibida em **400
     * explícito** — mais forte que o strip silencioso, porque diz ao cliente que
     * ele está enganado sobre quem manda naquele campo (§6.3).
     */
    it.each(['userId', 'actorUserId', 'clubId', 'disabledAt', 'id'])(
      'answers 400 to a body that declares %s, and writes nothing',
      async (field) => {
        const response = await app.inject({
          method: 'POST',
          url: '/notifications/subscriptions',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload: aBody(anEndpoint('smuggle'), { [field]: MARCOS_ID }),
        });

        // ⚠️ **A ORDEM É DELIBERADA, e foi medida** (a mesma do `DELETE` mais
        // abaixo): com o mutante do fallback (`userId` declarado no
        // `savePushSubscriptionSchema` + `req.body.userId ?? req.user.sub` no
        // handler), o `POST` responde **201** e grava a inscrição no nome do
        // MARCOS. Com a asserção de status na frente, o teste morre em
        // `expected 201 to be 400` e a metade que o nome promete
        // ("and writes nothing") **nunca roda**.
        await expect(
          prisma.pushSubscription.count({ where: { userId: MARCOS_ID } }),
        ).resolves.toBe(0);
        expect(response.statusCode).toBe(400);
      },
    );

    /**
     * ⚠️ **E a outra metade, a do mutante: a linha gravada é a do ATOR.** É a
     * asserção que muda se `req.body.userId ?? req.user.sub` entrar no lugar do
     * `req.user.sub` **e** o campo passar a ser declarado no schema (o que
     * "romper o strip" significa, §6.3).
     */
    it('always writes the actor as the owner', async () => {
      const endpoint = anEndpoint('owner');

      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      expect(
        required(
          await prisma.pushSubscription.findUnique({ where: { endpoint } }),
        ).userId,
      ).toBe(MARIA_ID);
      await expect(
        prisma.pushSubscription.count({ where: { userId: MARCOS_ID } }),
      ).resolves.toBe(0);
    });
  });

  describe('DELETE /notifications/subscriptions', () => {
    /**
     * ⚠️ **REGRA 11 — 204, e a desativação é SOFT: a linha FICA com o
     * instante.**
     *
     * 204 e não 200-com-corpo, como o `DELETE /plan-items/:id/reading-log`: a
     * tela não precisa do estado de volta para saber que desligou, e um corpo
     * teria de decidir se leva as chaves do aparelho (não leva).
     */
    it('answers 204 and writes the disabledAt, keeping the row', async () => {
      const endpoint = anEndpoint('soft');
      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint },
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
      const row = required(
        await prisma.pushSubscription.findUnique({ where: { endpoint } }),
      );
      expect(row.disabledAt).not.toBeNull();
      // A LINHA FICA — é isto que "soft" quer dizer.
      await expect(
        prisma.pushSubscription.count({ where: { endpoint } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️ **REGRA 11 — É IDEMPOTENTE: 204 também quando não havia o que
     * desligar.** Um 404 obrigaria a tela a distinguir "desliguei" de "já estava
     * desligado", que é a mesma coisa para quem olha (a decisão C da Tarefa 32
     * na borda).
     */
    it('answers 204 for an endpoint nobody ever registered', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint: anEndpoint('ghost') },
      });

      expect(response.statusCode).toBe(204);
    });

    it('answers 204 twice for the same device', async () => {
      const endpoint = anEndpoint('twice');
      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(endpoint),
      });

      const first = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint },
      });
      const again = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint },
      });

      expect([first.statusCode, again.statusCode]).toEqual([204, 204]);
      await expect(
        prisma.pushSubscription.count({ where: { endpoint } }),
      ).resolves.toBe(1);
    });

    /**
     * ⚠️⚠️ **REGRA 12 — NINGUÉM DESATIVA A INSCRIÇÃO DE OUTRA PESSOA, E ESTE É O
     * TESTE QUE MATA O MUTANTE DO FALLBACK DO §7.5.**
     *
     * A Maria (ator legítimo, com inscrição própria) pede o endpoint do Marcos.
     * A busca é pelo par `(endpoint, ator)`, então nada é encontrado, nada é
     * escrito, e **a inscrição do Marcos continua ATIVA**.
     *
     * Com `input.userId ?? req.user.sub` no lugar do `req.user.sub` **e** o
     * `userId` declarado no `deletePushSubscriptionSchema` (que é o que "romper
     * o strip" significa, §6.3), a busca viraria
     * `(MARCOS_ENDPOINT, MARCOS)` — que EXISTE —, o `update` rodaria, e o
     * `disabledAt` do Marcos deixaria de ser nulo. A asserção abaixo é a única
     * coisa que muda.
     *
     * ⚠️ Testar isto com um ator de FORA não provaria nada: não há guard de
     * tenant aqui para matar a requisição, e um ator de fora não encontraria
     * nada nas duas implementações (§7.5).
     */
    it('never disables the subscription of another person, even with a smuggled userId', async () => {
      const marcosEndpoint = anEndpoint('do-marcos');
      const mariaEndpoint = anEndpoint('da-maria');
      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${marcosToken}` },
        payload: aBody(marcosEndpoint),
      });
      await app.inject({
        method: 'POST',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: aBody(mariaEndpoint),
      });

      // 1) Sem contrabando: a Maria pede o endpoint do Marcos e leva 204 —
      //    porque a operação é idempotente e ela não tem essa inscrição.
      const plain = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint: marcosEndpoint },
      });
      expect(plain.statusCode).toBe(204);
      expect(
        required(
          await prisma.pushSubscription.findUnique({
            where: { endpoint: marcosEndpoint },
          }),
        ).disabledAt,
      ).toBeNull();

      // 2) Com contrabando: a inscrição do Marcos continua ATIVA.
      //
      // ⚠️ **A ORDEM DAS DUAS ASSERÇÕES ABAIXO É DELIBERADA, e foi medida.** A
      // do ESTADO GRAVADO vem primeiro, e a do status depois — porque são
      // acusadores de coisas diferentes, e a primeira é a que o §7.5 pede.
      // Medido: com o mutante do fallback (`userId` declarado no
      // `deletePushSubscriptionSchema` + `req.body.userId ?? req.user.sub` no
      // handler), o status vira 204 e o `disabledAt` do Marcos deixa de ser
      // nulo. Com a asserção de status na frente, o teste morre ali e a
      // asserção que importa **nunca roda** — ela pareceria provada sem nunca
      // ter sido exercitada contra o mutante.
      const smuggled = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { endpoint: marcosEndpoint, userId: MARCOS_ID },
      });
      expect(
        required(
          await prisma.pushSubscription.findUnique({
            where: { endpoint: marcosEndpoint },
          }),
        ).disabledAt,
      ).toBeNull();
      // ...e só depois o status: o `.strict()` do schema recusa o corpo antes
      // de o handler existir, que é a barreira do §6.3.
      expect(smuggled.statusCode).toBe(400);

      // 3) ⚠️ A PRECONDIÇÃO QUE DÁ DENTE AOS DOIS DE CIMA: o MESMO pedido,
      //    feito pelo DONO, desativa. Sem ela, um `DELETE` que nunca desativasse
      //    nada passaria em tudo acima.
      const byOwner = await app.inject({
        method: 'DELETE',
        url: '/notifications/subscriptions',
        headers: { authorization: `Bearer ${marcosToken}` },
        payload: { endpoint: marcosEndpoint },
      });
      expect(byOwner.statusCode).toBe(204);
      expect(
        required(
          await prisma.pushSubscription.findUnique({
            where: { endpoint: marcosEndpoint },
          }),
        ).disabledAt,
      ).not.toBeNull();
      // ...e a da Maria, que ela nunca pediu, continua ativa.
      expect(
        required(
          await prisma.pushSubscription.findUnique({
            where: { endpoint: mariaEndpoint },
          }),
        ).disabledAt,
      ).toBeNull();
    });

    it.each(['userId', 'actorUserId', 'clubId', 'id'])(
      'answers 400 to a DELETE body that declares %s',
      async (field) => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/notifications/subscriptions',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload: { endpoint: anEndpoint('strict'), [field]: MARCOS_ID },
        });

        expect(response.statusCode).toBe(400);
      },
    );

    it.each([{}, { endpoint: '' }, { endpoint: 'nope' }, { endpoint: 42 }])(
      'answers 400 to the malformed DELETE body %j',
      async (payload) => {
        const response = await app.inject({
          method: 'DELETE',
          url: '/notifications/subscriptions',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload,
        });

        expect(response.statusCode).toBe(400);
      },
    );
  });
});
