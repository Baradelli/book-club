import { ACTIVITY_TYPES } from '@clube/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installAdvancingClock } from '../../test-support/advancing-clock';
import { aMembership, required } from '../../test-support/builders';
import { ActivityEventRepositoryFake } from '../_fakes/activity-event-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { PushSenderFake } from '../_fakes/push-sender-fake';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import { NotifyGroupActivity } from '../notify-group-activity';
import type { RecordActivityInput } from '../record-activity';
import { RecordActivity, recordActivitySafely } from '../record-activity';

const CLUB_ID = 'club-1';
const BOOK_ID = 'book-1';
const MARIA_ID = 'user-maria';
const DAY_1 = 'plan-dia-1';
const NOTE_ID = 'note-1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Regras 5, 6, 7, 3, 14 e 15 da Tarefa 33 — o UseCase que grava o evento.
 *
 * Ele é **um UseCase injetado em UseCase** (decisão D), e o precedente é o
 * `AssertMembership`: uma classe com `execute`, recebida no construtor dos
 * quatro. A alternativa — cada um montar o evento e chamar o repositório —
 * copiaria a construção quatro vezes, que é a lição nº 3 do MVP 1.
 */
describe('RecordActivity', () => {
  let events: ActivityEventRepositoryFake;
  let useCase: RecordActivity;

  beforeEach(() => {
    events = new ActivityEventRepositoryFake();
    useCase = new RecordActivity(events);
  });

  // O stub de relógio da regra 6 é GLOBAL: sem isto ele vazaria para os testes
  // seguintes do arquivo, que leem o relógio de verdade.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Fábrica, nunca `const` de `describe` (§7.7). */
  function validInput(
    overrides: Partial<RecordActivityInput> = {},
  ): RecordActivityInput {
    return {
      clubId: CLUB_ID,
      actorUserId: MARIA_ID,
      type: 'PLAN_NOTE',
      bookId: BOOK_ID,
      planItemId: DAY_1,
      subjectId: NOTE_ID,
      ...overrides,
    };
  }

  describe('recording', () => {
    /**
     * Regra 5 — monta o evento e **grava**. O `event` devolvido não basta: o
     * teste assertaria o mesmo com um UseCase que monta e não persiste, e o
     * nome promete "registra".
     */
    it('records the event with the fields the caller gave it', async () => {
      const event = await useCase.execute(validInput());

      expect(event.clubId).toBe(CLUB_ID);
      expect(event.userId).toBe(MARIA_ID);
      expect(event.type).toBe('PLAN_NOTE');
      expect(event.bookId).toBe(BOOK_ID);
      expect(event.planItemId).toBe(DAY_1);
      expect(event.subjectId).toBe(NOTE_ID);

      expect(events.saveCalls).toBe(1);
      expect(events.saved).toHaveLength(1);
      expect(required(events.saved[0])).toEqual(event);
    });

    /**
     * Regra 5 — o `id` sai de `randomUUID()` **no UseCase**, e não do chamador:
     * um id escolhido de fora deixaria dois gatilhos sobrescreverem o evento um
     * do outro pelo upsert do `save`.
     */
    it('mints the id itself, and a different one every time', async () => {
      const first = await useCase.execute(validInput());
      const second = await useCase.execute(validInput());

      expect(first.id).toMatch(UUID);
      expect(second.id).toMatch(UUID);
      expect(first.id).not.toBe(second.id);
      expect(events.saved).toHaveLength(2);
    });

    /**
     * Regra 15 — `subjectId` é o id do que nasceu: a nota, o grifo ou o log.
     * Regra 14 — `planItemId` é preenchido no `PLAN_NOTE` e no `READ`, e
     * **nulo** no `FREE_NOTE` e no `HIGHLIGHT`. Quem escolhe é o chamador; o
     * que este UseCase promete é **não mexer** no que recebeu.
     */
    it.each([
      ['PLAN_NOTE', DAY_1, NOTE_ID],
      ['READ', DAY_1, 'reading-log-1'],
      ['FREE_NOTE', null, 'note-avulsa-1'],
      ['HIGHLIGHT', null, 'highlight-1'],
    ] as const)(
      'carries the day and the subject of a %s through untouched',
      async (type, planItemId, subjectId) => {
        await useCase.execute(validInput({ type, planItemId, subjectId }));

        const stored = required(events.saved[0]);
        expect(stored.type).toBe(type);
        expect(stored.planItemId).toBe(planItemId);
        expect(stored.subjectId).toBe(subjectId);
      },
    );

    /**
     * ⚠️ Regra 3 — a linha gravada tem **exatamente oito campos**, e nenhum
     * `status`, `archivedAt` ou `updatedAt` a mais (decisão H).
     *
     * A asserção é sobre as CHAVES da linha gravada, e não sobre o tipo: com
     * campo **opcional** o `typecheck` fica verde (medido na Tarefa 30), e o
     * objeto que chega ao `save` é montado aqui — um campo a mais atravessaria
     * por variável, que é o buraco do §7.1.1.
     */
    it('stores exactly the eight fields of the entity, with no status and no second instant', async () => {
      await useCase.execute(validInput());

      expect(Object.keys(required(events.saved[0])).sort()).toEqual([
        'bookId',
        'clubId',
        'createdAt',
        'id',
        'planItemId',
        'subjectId',
        'type',
        'userId',
      ]);
    });

    /**
     * ⚠️ **Regra 6 — UMA leitura de relógio, provada por CONTAGEM.** É a 6ª
     * aparição do §7.8.
     *
     * `expect(a).toEqual(b)` entre dois instantes **NÃO** prova "um relógio
     * só": duas chamadas a `new Date()` no mesmo tick devolvem o MESMO
     * milissegundo, e na Tarefa 22 esse mutante passou em 1206/1206, três
     * vezes. O `installAdvancingClock` faz cada leitura sem argumento andar
     * `CLOCK_TICK_MS`, e **conta**.
     *
     * O esperado é `clock.at(1)`, derivado do `CLOCK_BASE_ISO` e **não** do
     * código sob teste — `at(n)` é o instante da n-ésima leitura, com `n`
     * começando em 1. A precondição "duas leituras consecutivas diferem" é o
     * primeiro teste de `advancing-clock.test.ts`.
     */
    it('reads the clock exactly once and stamps createdAt with it', async () => {
      const clock = installAdvancingClock();

      const event = await useCase.execute(validInput());

      expect(clock.reads).toBe(1);
      expect(event.createdAt.getTime()).toBe(clock.at(1));
      expect(required(events.saved[0]).createdAt.getTime()).toBe(clock.at(1));
    });

    // O complemento do teste acima, sem stub: o instante gravado é AGORA, e cai
    // dentro da janela do `execute`.
    it('stamps createdAt with now', async () => {
      const before = Date.now();

      const event = await useCase.execute(validInput());

      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(event.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    /**
     * O instante é do RELÓGIO, e não do chamador: um `createdAt` vindo de fora
     * deixaria o feed contar a história fora de ordem. Como o campo nem existe
     * no input, quem recusa primeiro é o compilador — e o `@ts-expect-error`
     * é a prova disso; a asserção é sobre a linha gravada.
     */
    it('ignores a createdAt and an id smuggled into the input', async () => {
      const smuggled = {
        clubId: CLUB_ID,
        actorUserId: MARIA_ID,
        type: 'READ',
        bookId: BOOK_ID,
        planItemId: DAY_1,
        subjectId: 'reading-log-1',
        // @ts-expect-error nenhum dos dois existe no input: o instante é do
        // relógio e o id é de `randomUUID()`
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
        id: 'evento-escolhido-pelo-chamador',
      } satisfies RecordActivityInput;

      const event = await useCase.execute(smuggled);

      expect(event.id).not.toBe('evento-escolhido-pelo-chamador');
      expect(event.id).toMatch(UUID);
      expect(event.createdAt.getUTCFullYear()).toBeGreaterThan(2000);
      expect(
        required(events.saved[0]).createdAt.getUTCFullYear(),
      ).toBeGreaterThan(2000);
    });
  });

  describe('the type gate', () => {
    it.each(ACTIVITY_TYPES)('accepts %s', async (type) => {
      const event = await useCase.execute(validInput({ type }));

      expect(event.type).toBe(type);
      expect(required(events.saved[0]).type).toBe(type);
    });

    /**
     * ⚠️ Regra 7 — tipo fora da lista é recusado **no domínio**, e a recusa
     * vem ANTES da escrita: `saveCalls === 0`. A borda da Tarefa 34 é a
     * primeira barreira, não a única — o mesmo argumento do
     * `assertHighlightColor`.
     *
     * O `@ts-expect-error` prova a **primeira** barreira (o compilador recusa
     * o literal), e o `rejects` prova a segunda. As duas importam: a checagem
     * de propriedade em excesso do TypeScript só vale para literal fresco
     * (§7.1.1), então um tipo vindo por variável atravessa o compilador.
     */
    it('refuses a type that is not one of the four, before writing anything', async () => {
      await expect(
        useCase.execute(
          // @ts-expect-error `NOTE_EDITED` não é um dos quatro nascimentos
          validInput({ type: 'NOTE_EDITED' }),
        ),
      ).rejects.toThrow(/activity type/i);

      expect(events.saveCalls).toBe(0);
      expect(events.saved).toHaveLength(0);
    });
  });

  /**
   * ⚠️ **`recordActivitySafely` — o dono ÚNICO do "falhar registrando não
   * derruba a escrita da pessoa"** (decisão C).
   *
   * Ele existe como função à parte, e não copiado em quatro `try/catch`, pelo
   * §7.1 (*"extrair, não cobrir duas vezes"*): a regra é uma só — o que a
   * pessoa escreveu é o produto, o feed é o acessório —, e quatro cópias dela
   * são quatro lugares de onde uma delas fica para trás.
   */
  describe('recordActivitySafely', () => {
    it('records through the UseCase on the happy path', async () => {
      await recordActivitySafely(useCase, validInput());

      expect(events.saveCalls).toBe(1);
      expect(required(events.saved[0]).subjectId).toBe(NOTE_ID);
    });

    it('resolves instead of rejecting when the recorder throws', async () => {
      const failing = new RecordActivity({
        save: () => Promise.reject(new Error('o banco caiu')),
        // O `find` entrou no port na Tarefa 34 e o
        // `planItemIdsWithAnyActivityEvent` na 34b (os dois junto do
        // repositório Prisma, §6.9). Este stub não exercita nenhum dos dois —
        // o assunto aqui é o `save` que falha —, mas eles têm de existir para
        // satisfazer a interface.
        find: () => Promise.resolve([]),
        planItemIdsWithAnyActivityEvent: () => Promise.resolve([]),
      });
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        recordActivitySafely(failing, validInput()),
      ).resolves.toBeUndefined();

      logged.mockRestore();
    });

    /**
     * ⚠️ **Engolir em silêncio também é errado** (decisão C): a captura vem
     * com `log` estruturado. Sem esta asserção, um `catch {}` vazio passaria
     * no teste acima — e o feed pararia de nascer sem ninguém saber por quê.
     */
    it('does not swallow the failure in silence: it logs it, with no content', async () => {
      const failing = new RecordActivity({
        save: () => Promise.reject(new Error('o banco caiu')),
        // O `find` entrou no port na Tarefa 34 e o
        // `planItemIdsWithAnyActivityEvent` na 34b (os dois junto do
        // repositório Prisma, §6.9). Este stub não exercita nenhum dos dois —
        // o assunto aqui é o `save` que falha —, mas eles têm de existir para
        // satisfazer a interface.
        find: () => Promise.resolve([]),
        planItemIdsWithAnyActivityEvent: () => Promise.resolve([]),
      });
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(
        failing,
        validInput({ type: 'HIGHLIGHT', subjectId: 'highlight-9' }),
      );

      expect(logged).toHaveBeenCalledTimes(1);
      const entry: unknown = logged.mock.calls[0]?.[0];
      expect(entry).toMatchObject({
        event: 'activity_event_not_recorded',
        type: 'HIGHLIGHT',
        clubId: CLUB_ID,
        // QUEM. Sem ele o log diz que um evento se perdeu e não de quem era,
        // que é a primeira pergunta de quem for diagnosticar.
        userId: MARIA_ID,
        bookId: BOOK_ID,
        subjectId: 'highlight-9',
        error: 'o banco caiu',
      });

      /**
       * ⚠️ **"Sem conteúdo" por CHAVES, e não por `toMatchObject`.** O
       * `toMatchObject` é um subconjunto: ele fica verde com um `quote` ou um
       * `title` a mais na linha, que é exatamente o que não pode entrar aqui
       * (`docs/NOTIFICACOES.md` §1: o push nunca leva o conteúdo, e um log de
       * servidor é um destino a mais para o texto do clube). Só a lista fechada
       * acusa o campo novo.
       */
      if (typeof entry !== 'object' || entry === null) {
        throw new Error('expected the log entry to be an object');
      }
      expect(Object.keys(entry).sort()).toEqual([
        'bookId',
        'clubId',
        'error',
        'event',
        'subjectId',
        'type',
        'userId',
      ]);

      logged.mockRestore();
    });

    // O lado positivo do contador de log: no caminho feliz **nada** é logado,
    // senão um log por escrita viraria ruído que ninguém lê (§7.3).
    it('logs nothing when the recording works', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(useCase, validInput());

      expect(logged).toHaveBeenCalledTimes(0);
      logged.mockRestore();
    });
  });

  /**
   * ⚠️ **O LEQUE DO `GROUP_ACTIVITY` MORA AQUI — decisão A da Tarefa 38.**
   *
   * Ele entra **dentro** do `recordActivitySafely`, e não nos quatro UseCases
   * de escrita, por um motivo medido: esta função é o **dono único** do
   * `try/catch + log` nos quatro, e é a mesma razão que a fez nascer. Pondo o
   * leque aqui, ele **herda a rede que já existe** — um push que falha nunca
   * derruba a escrita da pessoa —, e não há quatro `catch` novos para alguém
   * esquecer de escrever.
   *
   * ⚠️ **E é por isso que o `RecordActivity` CARREGA o notificador sem
   * chamá-lo**: os quatro chamadores passam `this.recordActivity` e mais nada,
   * então é por ele que a função alcança o leque sem que nenhum dos quatro
   * mude uma linha. O `execute` continua gravando um evento e só (decisão B).
   */
  describe('recordActivitySafely, the GROUP_ACTIVITY fan-out (Tarefa 38)', () => {
    const MARCOS_ID = 'user-marcos';

    async function aClubOfTwo(): Promise<{
      notifier: NotifyGroupActivity;
      sender: PushSenderFake;
    }> {
      const memberships = new MembershipRepositoryFake();
      await memberships.save(
        aMembership({ userId: MARIA_ID, clubId: CLUB_ID, role: 'OWNER' }),
      );
      await memberships.save(
        aMembership({ userId: MARCOS_ID, clubId: CLUB_ID }),
      );
      const sender = new PushSenderFake();
      return {
        notifier: new NotifyGroupActivity({
          memberships,
          settings: new SettingsRepositoryFake(),
          sender,
        }),
        sender,
      };
    }

    it('notifies the rest of the club after recording the event', async () => {
      const { notifier, sender } = await aClubOfTwo();
      const recorder = new RecordActivity(events, notifier);

      await recordActivitySafely(recorder, validInput());

      expect(events.saveCalls).toBe(1);
      expect(sender.recipients).toEqual([MARCOS_ID]);
    });

    /**
     * ⚠️ **A ORDEM: grava primeiro, avisa depois** — e a prova é por contador
     * (§7.3). Avisar antes de gravar mandaria o clube abrir um livro por uma
     * anotação que não existe, exatamente como registrar antes de escrever
     * produziria um feed que mente (decisão I da Tarefa 33).
     */
    it('notifies nobody when the event itself could not be recorded', async () => {
      const { notifier, sender } = await aClubOfTwo();
      const failing = new RecordActivity(
        {
          save: () => Promise.reject(new Error('o banco caiu')),
          find: () => Promise.resolve([]),
          planItemIdsWithAnyActivityEvent: () => Promise.resolve([]),
        },
        notifier,
      );
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(failing, validInput());

      expect(sender.sendCalls).toBe(0);
      expect(logged).toHaveBeenCalledTimes(1);
      logged.mockRestore();
    });

    /**
     * ⚠️ **REGRA 11 — A FALHA DE PUSH NUNCA DERRUBA NADA**, e aqui isso se vê
     * pelo lado do registro: com o sender **lançando**, o `ActivityEvent`
     * continua gravado. (Do lado da nota, do grifo e do log, a mesma
     * propriedade é medida nos testes dos quatro UseCases de escrita.)
     */
    it('keeps the event that was recorded when the push sender throws', async () => {
      const { notifier, sender } = await aClubOfTwo();
      sender.failsFor(MARCOS_ID, new Error('o serviço de push caiu'));
      const recorder = new RecordActivity(events, notifier);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        recordActivitySafely(recorder, validInput()),
      ).resolves.toBeUndefined();

      expect(events.saved).toHaveLength(1);
      expect(required(events.saved[0]).subjectId).toBe(NOTE_ID);
      logged.mockRestore();
    });

    /**
     * ⚠️ **E o log da falha do push é OUTRO EVENTO, com outro nome.**
     *
     * Reusar o `activity_event_not_recorded` seria o log **mentindo**: o evento
     * FOI gravado, e quem estivesse diagnosticando iria procurar o defeito na
     * tabela errada. Engolir sem log é o outro extremo, e a decisão C da Tarefa
     * 33 já o recusou — o clube pararia de receber aviso e ninguém saberia por
     * quê.
     *
     * ⚠️ **REGRA 12 — E ELE NÃO LEVA CONTEÚDO**, assertado por LISTA FECHADA de
     * chaves e não por `toMatchObject`: o subconjunto ficaria verde com um
     * `title` ou um `quote` a mais, que é exatamente o campo que não pode
     * nascer aqui (`NOTIFICACOES.md` §1 — e um log de servidor é um destino a
     * mais para o texto do clube).
     */
    it('logs the push failure under its own name, with no content', async () => {
      const { notifier, sender } = await aClubOfTwo();
      sender.failsFor(MARCOS_ID, new Error('o serviço de push caiu'));
      const recorder = new RecordActivity(events, notifier);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(
        recorder,
        validInput({ type: 'HIGHLIGHT', subjectId: 'highlight-9' }),
      );

      expect(logged).toHaveBeenCalledTimes(1);
      const entry: unknown = logged.mock.calls[0]?.[0];
      expect(entry).toMatchObject({
        event: 'group_activity_not_notified',
        type: 'HIGHLIGHT',
        clubId: CLUB_ID,
        userId: MARIA_ID,
        bookId: BOOK_ID,
        subjectId: 'highlight-9',
        error: 'o serviço de push caiu',
      });

      if (typeof entry !== 'object' || entry === null) {
        throw new Error('expected the log entry to be an object');
      }
      expect(Object.keys(entry).sort()).toEqual([
        'bookId',
        'clubId',
        'error',
        'event',
        'subjectId',
        'type',
        'userId',
      ]);

      logged.mockRestore();
    });

    /**
     * ⚠️ **O QUE SOBE NEM SEMPRE É UM `Error` — e o log tem de dizer alguma
     * coisa mesmo assim** (rodada de conserto da Tarefa 38, §7.1).
     *
     * O `logWithoutContent` escreve
     * `error instanceof Error ? error.message : String(error)`, e o segundo
     * ramo nunca era exercitado **pelo leque**: o `PushSenderFake.failsFor` só
     * aceitava `Error`, um fake mais restritivo que a realidade. E a realidade
     * é medida: o `WebPushSender.send` guarda a falha em `let failure: unknown`
     * e **relança o que vier** — string, objeto, o que o serviço de push (ou um
     * `catch` alheio) tiver produzido.
     *
     * Sem este caso, um log que fizesse `(error as Error).message` escreveria
     * `error: undefined` no dia em que subisse uma string — e quem fosse
     * diagnosticar "o clube parou de receber aviso" teria uma linha de log que
     * não diz nada.
     */
    it('logs a push failure that is not an Error at all, without losing the reason', async () => {
      const { notifier, sender } = await aClubOfTwo();
      // Uma STRING, e não um `Error`: é o que o adaptador real relança quando
      // é isso que chega até ele.
      sender.failsFor(MARCOS_ID, 'ECONNRESET');
      const recorder = new RecordActivity(events, notifier);
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(recorder, validInput());

      expect(logged).toHaveBeenCalledTimes(1);
      expect(logged.mock.calls[0]?.[0]).toMatchObject({
        event: 'group_activity_not_notified',
        error: 'ECONNRESET',
      });

      logged.mockRestore();
    });

    /**
     * O caminho de quem não tem leque — um `RecordActivity` de um só argumento,
     * que é como os testes dos quatro UseCases o montam e como o projeto viveu
     * até aqui. **Nada acontece, e nada é logado.**
     */
    it('records, and logs nothing, when there is no notifier at all', async () => {
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await recordActivitySafely(new RecordActivity(events), validInput());

      expect(events.saveCalls).toBe(1);
      expect(logged).toHaveBeenCalledTimes(0);
      logged.mockRestore();
    });
  });
});
