import { beforeEach, describe, expect, it } from 'vitest';

import { aMembership, aSettings, required } from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { PushSenderFake } from '../_fakes/push-sender-fake';
import { SettingsRepositoryFake } from '../_fakes/settings-repository-fake';
import type { NotifyGroupActivityInput } from '../notify-group-activity';
import { NotifyGroupActivity } from '../notify-group-activity';

/**
 * ⚠️ **O LEQUE — a única regra de negócio da Tarefa 38** (regra 1: é por aqui
 * que a fatia começa).
 *
 * "Quando alguém marca que leu, ou escreve uma nota ou um grifo, o clube recebe
 * uma notificação — um incentiva o outro" (`CLAUDE.md`). Este UseCase é o
 * **quem recebe**: os membros **ativos** do clube, **menos o autor**, e só
 * quem não desligou o aviso.
 *
 * As três exclusões são a regra 10, e cada uma tem teste próprio aqui porque
 * cada uma tem um mutante próprio: apagar o `!== actorUserId`, apagar o
 * `notifyGroupActivity`, apagar o `status === 'ACTIVE'`.
 */

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const MARIA_ID = 'user-maria';
const MARCOS_ID = 'user-marcos';
const JOANA_ID = 'user-joana';

function validInput(
  overrides: Partial<NotifyGroupActivityInput> = {},
): NotifyGroupActivityInput {
  return {
    clubId: CLUB_ID,
    actorUserId: MARIA_ID,
    type: 'PLAN_NOTE',
    bookId: BOOK_ID,
    ...overrides,
  };
}

describe('NotifyGroupActivity', () => {
  let memberships: MembershipRepositoryFake;
  let settings: SettingsRepositoryFake;
  let sender: PushSenderFake;
  let useCase: NotifyGroupActivity;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    settings = new SettingsRepositoryFake();
    sender = new PushSenderFake();
    useCase = new NotifyGroupActivity({ memberships, settings, sender });

    // O clube: a autora e mais duas pessoas, todas ativas.
    await memberships.save(
      aMembership({ userId: MARIA_ID, clubId: CLUB_ID, role: 'OWNER' }),
    );
    await memberships.save(aMembership({ userId: MARCOS_ID, clubId: CLUB_ID }));
    await memberships.save(aMembership({ userId: JOANA_ID, clubId: CLUB_ID }));
  });

  it('notifies the other active members of the club', async () => {
    await useCase.execute(validInput());

    expect(sender.sendCalls).toBe(2);
    expect([...sender.recipients].sort()).toEqual([JOANA_ID, MARCOS_ID]);
  });

  /**
   * ⚠️ **DECISÃO C — o autor NUNCA recebe o próprio aviso, e a exclusão é
   * ESTRUTURAL** (regra 10, primeira exclusão).
   *
   * Receber "você leu o capítulo 3" seria o app cobrando a pessoa do que ela
   * acabou de fazer — o oposto do §1 do plano. E a asserção é sobre a LISTA de
   * destinatários, não sobre o contador: com `sendCalls === 2` e o leque
   * mandando para a autora e esquecendo alguém, o contador ficaria igual.
   */
  it('never notifies the author of the activity', async () => {
    await useCase.execute(validInput({ actorUserId: MARIA_ID }));

    expect(sender.recipients).not.toContain(MARIA_ID);
  });

  /**
   * ⚠️ **Regra 10, segunda exclusão: quem desligou o aviso não recebe.**
   *
   * `notifyGroupActivity` é a preferência da pessoa (Tarefa 36), e é a ÚNICA
   * coisa que filtra o leque — o ADR 0002 é explícito em que não há conteúdo
   * privado dentro do clube: o filtro é a vontade de quem recebe, nunca
   * permissão.
   */
  it('never notifies someone who turned group activity off', async () => {
    await settings.save(
      aSettings({ userId: MARCOS_ID, notifyGroupActivity: false }),
    );

    await useCase.execute(validInput());

    expect(sender.recipients).toEqual([JOANA_ID]);
  });

  /**
   * ⚠️ **Regra 10, terceira exclusão: membership não-ativo não recebe.**
   *
   * Quem saiu do clube mantém a autoria do que escreveu (ADR 0002 — e é por
   * isso que o `findByClub` do port devolve `ACTIVE` **e** `ARCHIVED`), mas
   * não recebe mais aviso: o `findByClub` é generoso de propósito, e o filtro
   * é deste UseCase.
   */
  it('never notifies a membership that is not active', async () => {
    await memberships.save(
      aMembership({
        userId: MARCOS_ID,
        clubId: CLUB_ID,
        status: 'ARCHIVED',
      }),
    );

    await useCase.execute(validInput());

    expect(sender.recipients).toEqual([JOANA_ID]);
  });

  /** Ninguém de outro clube entra no leque — o `clubId` é o recorte. */
  it('never notifies a member of another club', async () => {
    await memberships.save(
      aMembership({ userId: 'user-de-fora', clubId: OTHER_CLUB_ID }),
    );

    await useCase.execute(validInput());

    expect(sender.recipients).not.toContain('user-de-fora');
    expect([...sender.recipients].sort()).toEqual([JOANA_ID, MARCOS_ID]);
  });

  /**
   * Quem nunca abriu a tela de preferências **não tem linha** de `Settings`, e
   * o `DEFAULT_SETTINGS` diz `notifyGroupActivity: true` — é o mesmo desenho do
   * `getSettings` (decisão B da Tarefa 36). Tratar a ausência como "não quer"
   * deixaria o clube inteiro mudo até alguém salvar preferência.
   */
  it('notifies someone who never saved any settings, because the default says so', async () => {
    await useCase.execute(validInput());

    expect([...sender.recipients].sort()).toEqual([JOANA_ID, MARCOS_ID]);
    expect(settings.saveCalls).toBe(0);
  });

  /**
   * ⚠️ **Regra 13 — o idioma é o de quem RECEBE, nunca o de quem escreveu.**
   *
   * A autora escreve em português e o Marcos lê em inglês: o aviso dele sai em
   * inglês. É a única frase do sistema que chega sem a pessoa abrir a tela, e
   * portanto a única que não pode perguntar ao i18n do navegador.
   */
  it('speaks the language of the person who RECEIVES, not the one who wrote', async () => {
    await settings.save(aSettings({ userId: MARIA_ID, locale: 'en' }));
    await settings.save(aSettings({ userId: MARCOS_ID, locale: 'en' }));
    await settings.save(aSettings({ userId: JOANA_ID, locale: 'pt' }));

    await useCase.execute(validInput({ actorUserId: MARIA_ID }));

    const toMarcos = required(
      sender.sends.find((send) => send.userId === MARCOS_ID),
    );
    const toJoana = required(
      sender.sends.find((send) => send.userId === JOANA_ID),
    );

    expect(toMarcos.payload.title).toBe('Your club is reading');
    expect(toJoana.payload.title).toBe('O clube está lendo');
  });

  /**
   * ⚠️ **Decisão E: o `tag` é o `kind` em minúsculas e o `url` leva à tela do
   * LIVRO.**
   *
   * O `tag` é o que faz uma notificação nova **substituir** a anterior no
   * aparelho (§2) — e é ele, e não um debounce de servidor, que impede três
   * atividades juntas de virarem três notificações na bandeja (decisão D).
   */
  it('sends the tag that groups the notification, and the url of the book', async () => {
    await useCase.execute(validInput({ bookId: 'book-99' }));

    const payload = required(sender.sends[0]).payload;
    expect(payload.tag).toBe('group_activity');
    expect(payload.url).toBe('/books/book-99');
  });

  /**
   * ⚠️ **O NOME FOI CORRIGIDO NA RODADA DE CONSERTO DA 38 — ele prometia mais
   * do que a asserção sustenta (§7.9).**
   *
   * Chamava-se `has a phrase of its own for %s`, e "of its own" é **distinção**
   * — mas a asserção mede `body.length > 0`, que é **presença**. Medido:
   * colapsar os quatro `BODY_KEY` do `group-activity-message.ts` para a mesma
   * chave dá **5 acusadores, e nenhum deles é este teste**; os cinco estão em
   * `notifications/__tests__/group-activity-message.test.ts`, sendo o dedicado
   * `says something different for each of the four births`.
   *
   * ⚠️ **E a distinção NÃO foi copiada para cá de propósito.** Ela já tem dono,
   * e o dono é o lugar onde ela é decidível: quem escolhe a frase é o
   * `buildGroupActivityMessage`, não o leque. Repeti-la aqui seria a segunda
   * cópia da mesma regra — o "extrair, não cobrir duas vezes" do §7.1 pelo
   * avesso. O que ESTE teste tem a dizer sobre os quatro tipos é o que ele
   * agora se chama: nenhum deles sai com corpo vazio, e todos saem com o `tag`
   * que agrupa.
   *
   * O ponteiro é pelo **nome** do teste, nunca pela linha (§7.4).
   */
  it.each([
    ['PLAN_NOTE' as const],
    ['FREE_NOTE' as const],
    ['HIGHLIGHT' as const],
    ['READ' as const],
  ])('sends a non-empty body and the grouping tag for %s', async (type) => {
    await useCase.execute(validInput({ type }));

    const payload = required(sender.sends[0]).payload;
    expect(payload.body.length).toBeGreaterThan(0);
    expect(payload.tag).toBe('group_activity');
  });

  /**
   * ⚠️ **REGRA 16 — SEM VAPID CONFIGURADO, NADA DISSO PODE QUEBRAR.**
   *
   * `getVapidConfig()` devolvendo `null` já desliga o script do cron; o leque
   * tem de sobreviver ao mesmo estado. E a prova é por **contador** (§7.3): não
   * basta "não mandou", ele nem vai ao banco — um clube sem VAPID continua
   * gravando nota, grifo e leitura sem pagar uma consulta por escrita.
   */
  it('does nothing at all — not even a read — when there is no sender (no VAPID)', async () => {
    const withoutVapid = new NotifyGroupActivity({
      memberships,
      settings,
      sender: null,
    });

    await expect(withoutVapid.execute(validInput())).resolves.toBeUndefined();

    expect(memberships.findByClubCalls).toBe(0);
    expect(settings.byUserIdCalls).toBe(0);
  });

  /**
   * ⚠️ **O leque NÃO tem `try/catch` próprio, e isso é a decisão A.**
   *
   * A rede é do `recordActivitySafely`, que já captura e loga — e é dele que
   * vem a garantia da regra 11 (a escrita da pessoa sobrevive). Um segundo
   * `catch` aqui seria a segunda cópia da mesma regra, que é exatamente o que a
   * decisão A existe para evitar. O teste que prova o outro lado (a nota fica
   * gravada) mora em `record-activity.test.ts` e nos quatro UseCases.
   */
  it('lets a sender failure propagate, because the net belongs to recordActivitySafely', async () => {
    sender.failsFor(MARCOS_ID, new Error('o serviço de push caiu'));

    await expect(useCase.execute(validInput())).rejects.toThrow(
      'o serviço de push caiu',
    );
  });

  /** O recorte é o clube do evento — lido do banco com o `clubId` que chegou. */
  it('asks the repository for the club of the activity', async () => {
    await useCase.execute(validInput({ clubId: CLUB_ID }));

    expect(memberships.findByClubCalls).toBe(1);
  });
});
