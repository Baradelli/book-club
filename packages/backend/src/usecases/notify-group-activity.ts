import type { ActivityType } from '@clube/shared';

import type { SettingsPreferences } from '../domain/settings';
import { DEFAULT_SETTINGS } from '../domain/settings';
import { buildGroupActivityMessage } from '../notifications/group-activity-message';
import type { MembershipRepository } from './ports/membership-repository';
import type { PushSender } from './ports/push-sender';
import type { SettingsRepository } from './ports/settings-repository';

export interface NotifyGroupActivityInput {
  /** O clube do acontecimento — é ele que define o leque. */
  clubId: string;
  /**
   * Quem fez, e é o **único** que não recebe (decisão C). O nome é
   * `actorUserId` como em todo input do projeto, porque ele vem do JWT do
   * request que disparou o gatilho (§6.3).
   */
  actorUserId: string;
  /** Qual dos quatro nascimentos — decide a frase, e nada mais. */
  type: ActivityType;
  /** O livro: é para a tela dele que o clique leva (decisão E). */
  bookId: string;
}

/**
 * As dependências do leque — **três**, e a lista é a decisão B.
 *
 * ⚠️ **Sem o `PushSubscriptionRepository`**, e é a regra 7: quem carrega os
 * aparelhos é a implementação do `PushSender`, pelo `byUserId` (que já filtra
 * `disabledAt IS NULL`). Deixar o filtro para quem chama seria a mesma classe
 * do `status: 'ACTIVE'` que o `listNotes` manda ao port — e aqui um chamador
 * que esquecesse mandaria push para um aparelho que pediu para não receber
 * mais.
 *
 * ⚠️ **Sem o `UserRepository`**, e é o que mantém a frase sem nome: ver o
 * docblock do `group-activity-message.ts`.
 */
export interface NotifyGroupActivityDeps {
  memberships: MembershipRepository;
  settings: SettingsRepository;
  /**
   * ⚠️ **`null` quando não há VAPID configurado** (regra 16, e o
   * `NOTIFICACOES.md` §3: *"`null` desliga a feature inteira, limpo"*).
   *
   * É o mesmo desenho do `RunDispatchOptions.sender` da Tarefa 37: o port de
   * efeito externo entra por parâmetro, e quem monta escolhe o que a peça pode
   * fazer. Um clube sem VAPID continua gravando nota, grifo e leitura — e sem
   * pagar uma consulta de banco por escrita.
   */
  sender: PushSender | null;
}

/**
 * ⚠️ **O LEQUE — "um incentiva o outro", e é a única regra de negócio da
 * Tarefa 38.**
 *
 * `CLAUDE.md`: *"Quando alguém marca que leu, ou escreve uma nota ou um grifo,
 * o clube recebe uma notificação"*. Este UseCase decide **quem** recebe: os
 * membros **ativos** do clube, **menos o autor**, e só quem não desligou o
 * aviso.
 *
 * ## As três exclusões, e por que cada uma é de um lugar diferente
 *
 * | Excluído | De onde vem a regra |
 * | --- | --- |
 * | o **autor** | decisão C — receber "você leu o capítulo 3" é o app cobrando a pessoa do que ela acabou de fazer (§1 do plano) |
 * | quem **desligou** o aviso | `Settings.notifyGroupActivity` (Tarefa 36): é a **vontade da pessoa**, nunca permissão — o ADR 0002 é explícito em que dentro do clube não existe conteúdo privado |
 * | **membership não-ativo** | quem saiu do clube mantém a autoria do que escreveu (ADR 0002, e é por isso que o `findByClub` devolve `ACTIVE` **e** `ARCHIVED`), mas não recebe mais aviso |
 *
 * ## ⚠️ Por que ele NÃO passa pelo dispatcher
 *
 * `NOTIFICACOES.md` §6, último parágrafo: o `GROUP_ACTIVITY` é disparado no
 * mesmo caminho que grava o `ActivityEvent`. Um lembrete é uma **decisão de
 * horário** (a janela, o claim, o fuso de cada um); isto é uma **consequência
 * de escrita**, e imediata — enfiá-la no cron faria o clube saber da anotação
 * até dez minutos depois, que é tempo suficiente para o incentivo virar
 * notícia velha.
 *
 * ## ⚠️ Por que ele NÃO tem `try/catch` (decisão A)
 *
 * A rede é do `recordActivitySafely`, que já captura e loga — *"pondo o leque
 * ali, ele herda a rede que já existe"*. Um `catch` aqui seria a segunda cópia
 * da mesma regra, e o §7.1 já registra o preço disso. O custo medido da
 * escolha: se o envio para a primeira pessoa **lançar** (rede caindo — e não
 * aparelho morto, que a decisão H absorve como `disabled`), as seguintes ficam
 * sem o aviso daquela escrita. É o caso em que o serviço de push está fora,
 * ou seja, aquele em que continuar também não entregaria nada.
 *
 * ## ⚠️ Por que `byUserId` por pessoa, e não um `find` novo no port
 *
 * Um `SettingsFilter` com `notifyGroupActivity` faria o port crescer — e, pelo
 * §6.9, crescer junto com a implementação Prisma, numa fatia que já mexe no
 * service worker. O conjunto aqui é "os membros de um clube", que é um punhado
 * de linhas (o clube de hoje tem duas pessoas): a consulta a mais por membro
 * custa menos que a coluna nova de contrato. Se um clube grande existir, o
 * recorte certo é um `find({ userIds })` — e aí ele terá chamador.
 */
export class NotifyGroupActivity {
  constructor(private readonly deps: NotifyGroupActivityDeps) {}

  async execute(input: NotifyGroupActivityInput): Promise<void> {
    const sender = this.deps.sender;
    /*
      ⚠️ REGRA 16 — sem VAPID não há como entregar, e a saída é ANTES de
      qualquer leitura. Não é economia: é o que faz "o push não está
      configurado" custar **zero** a quem só quer escrever a anotação do dia. A
      prova é por contador (§7.3), não por "não mandou".
    */
    if (sender === null) return;

    // O `findByClub` devolve ACTIVE **e** ARCHIVED de propósito (o port
    // registra por quê): o filtro de status é daqui.
    const members = await this.deps.memberships.findByClub(input.clubId);

    for (const membership of members) {
      if (membership.status !== 'ACTIVE') continue;
      // ⚠️ DECISÃO C: o autor nunca recebe o próprio aviso, e a exclusão é
      // ESTRUTURAL — acontece na seleção, não num `if` de tela.
      if (membership.userId === input.actorUserId) continue;

      const preferences = await this.preferencesOf(membership.userId);
      if (!preferences.notifyGroupActivity) continue;

      /*
        Decisão I da Tarefa 37, do outro lado: **o payload sai pronto daqui**, e
        no locale de QUEM RECEBE — o sender entrega, não monta frase. Se ele
        montasse, a frase ficaria dentro do adaptador de rede, onde nenhum teste
        de UseCase a alcança e onde a varredura anti-culpa do catálogo não a
        veria.
      */
      await sender.send(
        membership.userId,
        buildGroupActivityMessage({
          locale: preferences.locale,
          bookId: input.bookId,
          type: input.type,
        }),
      );
    }
  }

  /**
   * As preferências da pessoa, com o **padrão** para quem nunca abriu a tela.
   *
   * ⚠️ **Ausência de linha é `DEFAULT_SETTINGS`, e não "não quer"** — é o mesmo
   * desenho do `getSettings` (decisão B da Tarefa 36). Tratar a ausência como
   * recusa deixaria o clube mudo até alguém salvar preferência, e o padrão diz
   * `notifyGroupActivity: true` justamente porque o aviso é o produto.
   */
  private async preferencesOf(userId: string): Promise<SettingsPreferences> {
    return (await this.deps.settings.byUserId(userId)) ?? DEFAULT_SETTINGS;
  }
}
