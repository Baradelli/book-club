import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../domain/settings';
import { buildServer } from '../../http/server';
import {
  prefixedEmail,
  prefixedId,
  prisma,
  removeFixtures,
} from '../../repositories/__tests__/_db';
import { required } from '../../test-support/builders';

/**
 * ⚠️ **REGRAS 4, 5 e 6 DA TAREFA 36, ponta a ponta.**
 *
 * ⚠️ **A decisão A é o assunto deste arquivo: estas duas rotas NÃO TÊM `clubId`
 * e NÃO PASSAM PELO `assertMembership`.** O `Settings` é do usuário —
 * `unique(userId)`, nenhum `clubId` —, e o corte de tenant é o **próprio JWT**.
 * Isso é diferente de todo o resto do projeto, então precisa de teste
 * explícito: quem não é de clube nenhum lê e escreve as próprias preferências,
 * e ninguém alcança as de outra pessoa.
 *
 * ⚠️ A limpeza **CONSULTA o banco** (§6.6): o `PATCH` cria linha de `Settings`
 * com id gerado pelo SERVIDOR (`randomUUID()` dentro do UseCase), que nenhum
 * teste conhece — é o formato do `invite-routes.integration.test.ts`, e sem ele
 * um teste que falhe no meio vaza fixture no banco de desenvolvimento do dono.
 */

/** Já tem linha de `Settings`, com valores fora do padrão. */
const MARIA_ID = prefixedId('t36r', 'set-maria');
/** ⚠️ NÃO tem linha, e NÃO é de clube nenhum — é o caso do super-admin do seed. */
const NEWBIE_ID = prefixedId('t36r', 'set-newbie');
/** O vizinho: existe para o contrabando ter alvo. */
const MARCOS_ID = prefixedId('t36r', 'set-marcos');

const EVERY_USER_ID = [MARIA_ID, NEWBIE_ID, MARCOS_ID] as const;

const MARIA_SETTINGS_ID = prefixedId('t36r', 'set-maria-row');
const MARCOS_SETTINGS_ID = prefixedId('t36r', 'set-marcos-row');

interface SettingsBody {
  timezone: string;
  locale: string;
  reminderTime: string;
  reminderEnabled: boolean;
  notifyGroupActivity: boolean;
}

async function seedUser(id: string, prefix: string): Promise<void> {
  await prisma.user.upsert({
    where: { id },
    create: { id, email: prefixedEmail('t36r', prefix), name: prefix },
    update: {},
  });
}

/** Apaga TODA linha de `Settings` das pessoas deste arquivo, consultando o banco. */
async function wipeSettings(): Promise<void> {
  const rows = await prisma.settings.findMany({
    where: { userId: { in: [...EVERY_USER_ID] } },
    select: { id: true },
  });
  if (rows.length > 0) {
    await prisma.settings.deleteMany({
      where: { id: { in: rows.map((row) => row.id) } },
    });
  }
}

describe('settings routes', () => {
  let app: FastifyInstance;
  let mariaToken: string;
  let newbieToken: string;
  let marcosToken: string;

  beforeAll(async () => {
    app = await buildServer({ logger: false });
    await app.ready();

    for (const [id, prefix] of [
      [MARIA_ID, 'maria'],
      [NEWBIE_ID, 'newbie'],
      [MARCOS_ID, 'marcos'],
    ] as const) {
      await seedUser(id, prefix);
    }

    mariaToken = app.jwt.sign({ sub: MARIA_ID });
    newbieToken = app.jwt.sign({ sub: NEWBIE_ID });
    marcosToken = app.jwt.sign({ sub: MARCOS_ID });
  });

  afterAll(async () => {
    await wipeSettings();
    await removeFixtures({ userIds: [...EVERY_USER_ID] });
    await prisma.$disconnect();
    await app.close();
  });

  /** Cada teste começa do estado conhecido: a Maria com linha, os outros sem. */
  beforeEach(async () => {
    await wipeSettings();
    await prisma.settings.create({
      data: {
        id: MARIA_SETTINGS_ID,
        userId: MARIA_ID,
        timezone: 'Asia/Tokyo',
        locale: 'en',
        reminderTime: '07:30',
        reminderEnabled: false,
        notifyGroupActivity: true,
      },
    });
    await prisma.settings.create({
      data: {
        id: MARCOS_SETTINGS_ID,
        userId: MARCOS_ID,
        timezone: 'Europe/Lisbon',
        locale: 'pt',
        reminderTime: '05:00',
        reminderEnabled: true,
        notifyGroupActivity: true,
      },
    });
  });

  describe('authentication', () => {
    /**
     * As duas rotas nasceriam PÚBLICAS se o registro fosse para fora do escopo
     * autenticado, e **nada mais no projeto notaria** — é o bloco que o
     * `highlight-routes` e o `reading-log-routes` já têm, pelo mesmo motivo.
     */
    it.each([
      ['GET', undefined],
      ['PATCH', { reminderEnabled: true }],
    ])(
      'answers 401 to %s /me/settings with no token',
      async (method, payload) => {
        const response = await app.inject({
          method: method as 'GET' | 'PATCH',
          url: '/me/settings',
          ...(payload === undefined ? {} : { payload }),
        });

        expect(response.statusCode).toBe(401);
      },
    );
  });

  describe('GET /me/settings', () => {
    /** ⚠️ REGRA 6 — 200 com as cinco preferências. */
    it('answers 200 with the five preferences of the person', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SettingsBody>()).toEqual({
        timezone: 'Asia/Tokyo',
        locale: 'en',
        reminderTime: '07:30',
        reminderEnabled: false,
        notifyGroupActivity: true,
      });
    });

    /**
     * ⚠️ **O `response` schema é FRONTEIRA (§6.1): `id` e `userId` NÃO SAEM.**
     * O serializer do Zod corta o que não está declarado — e sem ele o objeto de
     * domínio inteiro iria para a rede (foi provado com `passwordHash` vazando
     * de um `/me` sem schema).
     */
    it('never sends the row id nor the userId', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
      });

      expect(Object.keys(response.json<SettingsBody>()).sort()).toEqual([
        'locale',
        'notifyGroupActivity',
        'reminderEnabled',
        'reminderTime',
        'timezone',
      ]);
      expect(response.body).not.toContain(MARIA_SETTINGS_ID);
      expect(response.body).not.toContain(MARIA_ID);
    });

    /**
     * ⚠️ **REGRA 1, ponta a ponta — e é o CASO DO SUPER-ADMIN DO SEED.**
     *
     * O `newbie` não tem linha de `Settings` (nunca aceitou convite) e não é de
     * clube nenhum. O `GET` responde **200 com o padrão**, e **não escreve** — a
     * contagem no banco é a prova, e ela é a única que separa "devolveu o
     * padrão" de "criou a linha com o padrão e a devolveu".
     */
    it('answers 200 with the default for someone who has no row, and writes nothing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/me/settings',
        headers: { authorization: `Bearer ${newbieToken}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SettingsBody>()).toEqual({
        timezone: DEFAULT_SETTINGS.timezone,
        locale: DEFAULT_SETTINGS.locale,
        reminderTime: DEFAULT_SETTINGS.reminderTime,
        reminderEnabled: DEFAULT_SETTINGS.reminderEnabled,
        notifyGroupActivity: DEFAULT_SETTINGS.notifyGroupActivity,
      });
      await expect(
        prisma.settings.count({ where: { userId: NEWBIE_ID } }),
      ).resolves.toBe(0);
    });

    /**
     * ⚠️ **REGRA 5 — NINGUÉM LÊ O `Settings` ALHEIO, e não há endereço por onde
     * tentar.** A rota não tem parâmetro nenhum: `GET /me/settings` só fala do
     * dono do token. Este teste é o par positivo que prova que os dois tokens
     * veem coisas diferentes — sem ele, uma rota que devolvesse sempre a mesma
     * linha passaria nos testes de cima.
     */
    it('answers each token with its own row, never the neighbour one', async () => {
      const mine = await app.inject({
        method: 'GET',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
      });
      const theirs = await app.inject({
        method: 'GET',
        url: '/me/settings',
        headers: { authorization: `Bearer ${marcosToken}` },
      });

      expect(mine.json<SettingsBody>().timezone).toBe('Asia/Tokyo');
      expect(theirs.json<SettingsBody>().timezone).toBe('Europe/Lisbon');
    });
  });

  describe('PATCH /me/settings', () => {
    /** ⚠️ REGRA 6 — 200 com o estado NOVO, inteiro. */
    it('answers 200 with the whole new state', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { reminderTime: '06:15', reminderEnabled: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SettingsBody>()).toEqual({
        timezone: 'Asia/Tokyo',
        locale: 'en',
        reminderTime: '06:15',
        reminderEnabled: true,
        notifyGroupActivity: true,
      });
    });

    /** E o que mudou está no BANCO, não só na resposta. */
    it('writes the patch to the database, in place', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { locale: 'pt' },
      });

      const row = required(
        await prisma.settings.findUnique({ where: { userId: MARIA_ID } }),
      );
      expect(row.id).toBe(MARIA_SETTINGS_ID);
      expect(row.locale).toBe('pt');
      // O que o patch não carregou ficou como estava.
      expect(row.timezone).toBe('Asia/Tokyo');
      expect(row.reminderTime).toBe('07:30');
    });

    /**
     * ⚠️ **REGRA 3 — CRIA a linha de quem nunca teve** (o super-admin do seed),
     * **sem membership nenhum** (decisão A).
     */
    it('creates the row for someone with no row and no club at all', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${newbieToken}` },
        payload: { timezone: 'Europe/Lisbon' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SettingsBody>().timezone).toBe('Europe/Lisbon');
      // A precondição da decisão A: esta pessoa não tem `Membership` nenhum.
      await expect(
        prisma.membership.count({ where: { userId: NEWBIE_ID } }),
      ).resolves.toBe(0);
      await expect(
        prisma.settings.count({ where: { userId: NEWBIE_ID } }),
      ).resolves.toBe(1);
    });

    /** O patch vazio é corpo legítimo: "nada mudou" não é erro. */
    it('accepts an empty patch with 200', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json<SettingsBody>().reminderTime).toBe('07:30');
    });

    /**
     * ⚠️ **REGRA 4, A METADE DA BORDA — `reminderTime` inválido é 400.**
     *
     * O domínio também o recusa (`assertReminderTime`), e são **as duas**: a
     * borda é a primeira barreira, não a única. Aqui o 400 vem do Zod, com
     * `details` apontando o campo — que é o que a tela precisa para marcar o
     * controle certo.
     */
    it.each(['25:00', '9:00', '21:5', '', 'abc', '24:00', '21:60', '21:00:00'])(
      'answers 400 to the reminderTime %s',
      async (reminderTime) => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/me/settings',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload: { reminderTime },
        });

        expect(response.statusCode).toBe(400);
        // E nada foi gravado.
        const row = required(
          await prisma.settings.findUnique({ where: { userId: MARIA_ID } }),
        );
        expect(row.reminderTime).toBe('07:30');
      },
    );

    /** O `details` do 400 nomeia o campo — é o que a tela usa (§6.2). */
    it('names the field in the details of the 400', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { reminderTime: '25:00' },
      });

      expect(
        response.json<{ details?: { path: string }[] }>().details?.[0]?.path,
      ).toBe('reminderTime');
    });

    /**
     * ⚠️ **REGRA 5 — O CONTRABANDO, COM O ATOR LEGÍTIMO, ASSERTANDO AS LINHAS
     * GRAVADAS** (§7.5).
     *
     * A Maria (ator legítimo, com linha própria) manda `userId: MARCOS`. O
     * `.strict()` do `updateSettingsSchema` transforma isso em **400 explícito**
     * — que é mais forte que o strip silencioso, porque diz ao cliente que ele
     * está enganado sobre quem manda naquele campo (§6.3).
     *
     * E as duas pontas do estado gravado são assertadas: **nada** mudou, nem na
     * linha da Maria, nem na do Marcos.
     */
    it.each(['userId', 'actorUserId', 'id', 'clubId'])(
      'answers 400 to a body that declares %s, and writes nothing',
      async (field) => {
        const response = await app.inject({
          method: 'PATCH',
          url: '/me/settings',
          headers: { authorization: `Bearer ${mariaToken}` },
          payload: { reminderTime: '06:15', [field]: MARCOS_ID },
        });

        // ⚠️ **A ORDEM DAS ASSERÇÕES ABAIXO É DELIBERADA, e foi medida.** As do
        // ESTADO GRAVADO vêm primeiro, e a do status depois — porque são
        // acusadores de coisas diferentes, e as primeiras são as que o §7.5
        // pede. Medido com o mutante do fallback (`userId` declarado no
        // `updateSettingsSchema` + `req.body.userId ?? req.user.sub` no
        // handler): o `PATCH` passa a responder 200 e a gravar `06:15` na linha
        // do MARCOS. Com a asserção de status na frente, o teste morre em
        // `expected 200 to be 400` e as duas asserções que o NOME promete
        // ("and writes nothing") **nunca rodam** — elas pareceriam provadas sem
        // nunca terem sido exercitadas contra o mutante.
        const mine = required(
          await prisma.settings.findUnique({ where: { userId: MARIA_ID } }),
        );
        const theirs = required(
          await prisma.settings.findUnique({ where: { userId: MARCOS_ID } }),
        );
        expect(mine.reminderTime).toBe('07:30');
        expect(theirs.reminderTime).toBe('05:00');
        // ...e só depois o status: o `.strict()` do `updateSettingsSchema`
        // recusa o corpo antes de o handler existir, que é a barreira do §6.3.
        expect(response.statusCode).toBe(400);
      },
    );

    /**
     * ⚠️ **E a outra metade, que é a que o mutante do §7.5 ataca:** mesmo que o
     * contrabando atravessasse a borda, a linha escrita tem de ser a do ATOR.
     * Este teste manda o corpo legítimo do ator legítimo e prova que a linha do
     * vizinho **não se mexeu** — é a asserção que muda quando
     * `input.userId ?? req.user.sub` entra no lugar do `req.user.sub`.
     */
    it('writes only the actor row, leaving the neighbour untouched', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload: { reminderTime: '06:15', reminderEnabled: true },
      });

      const theirs = required(
        await prisma.settings.findUnique({ where: { userId: MARCOS_ID } }),
      );
      expect(theirs.reminderTime).toBe('05:00');
      expect(theirs.reminderEnabled).toBe(true);
      // A precondição do par: a linha do ATOR mudou de verdade — senão um
      // `PATCH` que não escrevesse nada passaria neste teste.
      const mine = required(
        await prisma.settings.findUnique({ where: { userId: MARIA_ID } }),
      );
      expect(mine.reminderTime).toBe('06:15');
    });

    /** Corpo com tipo errado é 400, não 500. */
    it.each([
      { reminderEnabled: 'sim' },
      { notifyGroupActivity: 1 },
      { timezone: '' },
      { locale: '' },
      { reminderTime: 2100 },
    ])('answers 400 to the malformed body %j', async (payload) => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/me/settings',
        headers: { authorization: `Bearer ${mariaToken}` },
        payload,
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
