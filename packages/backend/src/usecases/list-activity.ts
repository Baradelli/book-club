import type { ActivityEvent } from '../domain/activity-event';
import type { AssertMembership } from './assert-membership';
import type { ActivityEventRepository } from './ports/activity-event-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface ListActivityInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listNotes` e no `listBooks`. */
  clubId: string;
  /**
   * Quantos eventos a TELA quer. Ausente = o padrão documentado do port
   * (`ACTIVITY_FEED_DEFAULT_LIMIT`), aplicado pelo repositório — nunca aqui.
   */
  limit?: number;
}

/**
 * O evento do feed **mais o tema do dia**, resolvido na leitura (Tarefa 38e).
 *
 * ⚠️ **É um tipo de LEITURA, não a entidade.** O `ActivityEvent` continua com os
 * oito campos de sempre e **não ganhou coluna** — o `planItemTitle` nasce aqui,
 * a cada leitura, a partir do plano ATUAL, e morre na resposta. É essa
 * diferença que deixa esta fatia conviver com a recusa da Tarefa 35 de
 * denormalizar o título dentro do evento: um título guardado envelheceria no
 * dia em que o admin corrigisse o plano, e o feed passaria a mentir sobre o
 * passado; um título resolvido na leitura **é** o plano, então corrigir o plano
 * corrige o feed inteiro de graça.
 */
export interface ActivityFeedEntry extends ActivityEvent {
  /**
   * O título do dia de leitura, quando há um.
   *
   * ⚠️ **`null` tem DOIS significados, e os dois são legítimos** (decisão C):
   * (1) o evento não tem dia — a anotação avulsa e o grifo já têm `planItemId`
   * nulo; (2) o dia **existia e sumiu**, porque o admin o tirou do plano. A
   * tela trata os dois igual, caindo na frase que só diz o livro: distinguir
   * seria narrar uma correção de plano que não é da conta de quem lê o feed.
   */
  planItemTitle: string | null;
}

export type ListActivityOutput = ActivityFeedEntry[];

/**
 * "O que aconteceu por aqui" — o feed do clube.
 *
 * É o primeiro leitor do `ActivityEvent`, que a Tarefa 33 só escrevia. A tela
 * do feed é a **Tarefa 35** e o push `GROUP_ACTIVITY` é a **38**; os dois leem
 * daqui.
 *
 * **Não exige papel**, e isso é ADR 0002: dentro do clube não existe conteúdo
 * privado, e o evento **não cria visibilidade nova** — ele aponta para o que
 * todo membro ativo já podia ver (a nota, o grifo, o "li"). Quem corta é o
 * `assertMembership`: clube em que o ator não é membro ativo é 404, exista ele
 * ou não.
 *
 * ## O que ele NÃO faz, e cada ausência é decisão
 *
 * - **Não resolve nome de pessoa nem nome do livro.** O evento guarda
 *   REFERÊNCIA, nunca conteúdo (decisão G da Tarefa 33), e a tela já sabe
 *   resolver nome pelo `GET /clubs/:clubId/members` (usa isso desde a 26a) e já
 *   tem o livro na estante que ela carregou.
 * - ⚠️ ~~**Não resolve o título do dia.**~~ **CAIU NA TAREFA 38e**, por decisão
 *   do dono ("quero o tema do dia na linha"). ✅ **E a recusa que a frase
 *   protegia continua inteira:** o que era proibido — e continua sendo — é
 *   *denormalizar* o título dentro do evento, porque o `editBook`
 *   ressincroniza os títulos do plano e um título gravado envelheceria. A
 *   junção daqui acontece na **leitura**, contra o plano de **agora**: ela não
 *   tem versão, não pode divergir do plano, e é por isso que ela pode existir
 *   sem desfazer aquela decisão.
 *
 *   A junção mora AQUI e não na tela porque a tela teria de pedir o plano **de
 *   cada livro** do feed: N requisições no celular, que é exatamente o que a
 *   Tarefa 35 recusou. No servidor é **uma** consulta a mais, indexada por id.
 * - **Não ordena.** É a diferença deliberada em relação ao `listNotes`: lá o
 *   port declara não prometer ordem, então o UseCase é o dono dela; aqui o port
 *   **promete** `createdAt desc` com desempate por `id` (decisão C), porque num
 *   feed a ordem É o produto. Um `sort` aqui seria um segundo dono da mesma
 *   regra.
 * - **Não tem padrão de `limit` próprio.** Chave ausente não viaja no filtro, e
 *   quem aplica o `ACTIVITY_FEED_DEFAULT_LIMIT` é o repositório — pelo mesmo
 *   motivo de cima: uma regra, um dono.
 * - **Não conta nada.** Sem total, sem "e mais N" (decisão F): `COUNTER_SHAPE`
 *   proíbe, e progresso é presença.
 */
export class ListActivity {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly events: ActivityEventRepository,
    /**
     * O plano — de onde sai o TEMA de cada dia (Tarefa 38e).
     *
     * ⚠️ **Só para LER título, e sempre dentro dos livros do próprio feed.**
     * Este UseCase não conhece clube de livro nenhum: quem já cortou por tenant
     * foi o `assertMembership` lá em cima, e os livros que ele passa ao filtro
     * são os dos eventos que o corte já devolveu.
     */
    private readonly planItems: ReadingPlanItemRepository,
  ) {}

  async execute(input: ListActivityInput): Promise<ListActivityOutput> {
    // ANTES da consulta, sempre: um ator de fora não pode gerar nem uma
    // leitura — senão a rota vira oráculo de existência (e conta de banco) para
    // quem não é do clube. A prova são os contadores `findCalls === 0` dos DOIS
    // repositórios (§7.3), não o erro, que sai igual nas duas ordens: o plano é
    // conteúdo do clube tanto quanto o evento.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    const events = await this.events.find({
      // Primeiro e não-negociável: o corte de tenant. Não há outro filtro —
      // o feed não é listagem de acervo (ver o `ActivityEventFilter`).
      clubId: input.clubId,
      // A chave só viaja quando a tela pediu: assim o padrão do port é o que
      // roda, e ele tem um dono só.
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });

    return this.withThemeOfTheDay(events);
  }

  /**
   * ⚠️ **UMA consulta para o feed inteiro, nunca uma por evento** (regra 5, e a
   * prova é o contador de chamadas do fake, jamais um cronômetro — §7.3).
   *
   * ⚠️ **E o par `bookIds` + `ids` é DUAS barreiras, não uma** (decisão D): os
   * livros saem dos próprios eventos, que já vieram cortados por clube, então
   * um `planItemId` de outro clube que estivesse gravado num evento daqui **não
   * casaria o recorte de livro** e não traria título nenhum. Um filtro só por id
   * seria uma regra de tenant a menos para manter em dia com aquela — o erro que
   * o `ReadingLogFilter` recusou na Tarefa 32.
   *
   * A chamada é **incondicional**, inclusive com as listas vazias: quem
   * transforma `ids: []` em "nem vai ao banco" é o port (o `IN ()` que a impl
   * Prisma e o fake recusam, cada um com o seu teste). Decidir aqui daria à
   * mesma regra um segundo dono, e é assim que uma delas fica para trás.
   */
  private async withThemeOfTheDay(
    events: readonly ActivityEvent[],
  ): Promise<ListActivityOutput> {
    const items = await this.planItems.find({
      bookIds: [...new Set(events.map((event) => event.bookId))],
      // Deduplicado: dois eventos do mesmo dia não pedem o dia duas vezes.
      ids: [
        ...new Set(
          events.flatMap((event) =>
            event.planItemId === null ? [] : [event.planItemId],
          ),
        ),
      ],
    });

    const titleById = new Map(items.map((item) => [item.id, item.title]));

    return events.map((event) => ({
      ...event,
      /*
        ⚠️ Os DOIS `null` da decisão C caem no mesmo ramo, de propósito: o
        evento sem dia e o dia que sumiu do plano. E o `.map` é sobre os
        EVENTOS, nunca sobre os itens encontrados — um `.filter()` aqui sumiria
        com a linha inteira de quem perdeu o dia, e o feed apagaria o passado.
      */
      planItemTitle:
        event.planItemId === null
          ? null
          : (titleById.get(event.planItemId) ?? null),
    }));
  }
}
