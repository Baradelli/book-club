import type { ActivityEvent } from '../../domain/activity-event';
import type {
  ActivityEventFilter,
  ActivityEventRepository,
} from '../ports/activity-event-repository';
import { activityFeedTake } from '../ports/activity-event-repository';

export class ActivityEventRepositoryFake implements ActivityEventRepository {
  private store = new Map<string, ActivityEvent>();
  private saveCallCount = 0;
  private findCallCount = 0;
  private findFiltersSeen: ActivityEventFilter[] = [];
  private planItemIdsWithAnyActivityEventCallCount = 0;

  /**
   * Upsert por `id`, a convenção dos outros repositórios (Tarefa 03).
   *
   * ⚠️ **Nenhuma unicidade emulada, e a pergunta do §7.1 ("o Postgres faria
   * isto?") está respondida na direção que esconde melhor.** A tabela da
   * Tarefa 34 não tem `@@unique` nenhum: escrever a anotação do dia 1 e a do
   * dia 2 são dois acontecimentos, e grifar o mesmo livro numa releitura
   * também. Um fake que recusasse o segundo evento do mesmo par ficaria **mais
   * restritivo que o banco** — a direção do §7.1 que mantém a suíte verde
   * enquanto a divergência só aparece na operação real.
   *
   * E é justamente essa a divergência que morderia mais aqui: quem impede a
   * enxurrada do autosave **não é o banco**, é a decisão A, no UseCase, que só
   * dispara no nascimento (`created === true`). Emular unicidade nesta linha
   * esconderia exatamente o bug que a decisão A existe para impedir.
   *
   * **Nenhuma exceção emulada** (§7.1.1: uma semântica emulada a menos é uma
   * fonte de bug a menos). O único `P2002` possível seria colisão de chave
   * primária, e nenhum chamador consegue produzi-la: os ids saem de
   * `randomUUID()`.
   */
  async save(event: ActivityEvent): Promise<ActivityEvent> {
    // Conta a CHAMADA, não o sucesso (§7.3).
    this.saveCallCount += 1;

    this.store.set(event.id, this.clone(event));
    return this.clone(event);
  }

  /**
   * "O que aconteceu neste clube" — o `find` que a Tarefa 34 trouxe, junto da
   * implementação Prisma (§6.9).
   *
   * ⚠️ **ELE ORDENA, e é a única exceção do projeto ao §7.2.** Todos os outros
   * `find` não prometem ordem, e por isso os fakes enumeram INVERTIDO, para
   * ninguém depender dela sem perceber. Aqui a ordem **é o produto** (feed é
   * cronologia invertida por definição), então o port a promete — e um fake que
   * não ordenasse seria a infidelidade do §7.1 na direção permissiva: os
   * UseCases escritos contra ele afirmariam uma ordem que só o banco entrega.
   *
   * ⚠️ **E a armadilha continua armada, porque a ordenação parte DELA**: o
   * `.reverse()` da enumeração é a ENTRADA do `sort`, então um `sort` que
   * alguém apague não devolve a ordem de inserção (que poderia coincidir com a
   * esperada num fixture descuidado) — devolve a inversa dela. A fixture hostil
   * da suíte pina as quatro permutações que as implementações erradas produzem.
   *
   * `createdAt desc`, desempate por `id` asc: `createdAt` sozinho não é ordem
   * total, e empate de milissegundo é o caso normal de um clube.
   *
   * ⚠️ **O teto vem do `activityFeedTake` do port — a MESMA função que o
   * repositório Prisma chama**, e emular o teto aqui é fidelidade, não
   * semântica a mais (§7.1): um fake sem teto devolveria o acervo inteiro (a
   * direção permissiva, com a suíte verde e a produção cortando o que o teste
   * afirmou).
   *
   * ⚠️ E o `??` cru **não serviria**, porque as duas implementações erram de
   * formas DIFERENTES com um `limit` inválido: no Prisma o `take` é com sinal
   * (`-1` traz o mais ANTIGO), e num `slice(0, -1)` de array o ÚLTIMO elemento
   * some. Duas respostas erradas, nenhuma exceção — a função compartilhada é o
   * que faz as duas concordarem.
   */
  async find(filter: ActivityEventFilter): Promise<ActivityEvent[]> {
    // Conta a CHAMADA, não o sucesso (§7.3).
    this.findCallCount += 1;
    // Uma CÓPIA, não a referência: o chamador pode reusar (e mutar) o objeto
    // que passou, e um filtro pinado que mudasse depois não pinaria nada.
    this.findFiltersSeen.push({ ...filter });

    return [...this.store.values()]
      .reverse()
      .filter((event) => event.clubId === filter.clubId)
      .sort(compareForTheFeed)
      .slice(0, activityFeedTake(filter.limit))
      .map((event) => this.clone(event));
  }

  /**
   * Os dias, dos pedidos, que algum evento referencia — a leitura da TERCEIRA
   * guarda do `replacePlanItems` (Tarefa 34b), espelho do
   * `planItemIdsWithAnyNote` e do `planItemIdsWithAnyReadingLog`.
   *
   * Duas fidelidades, e as duas são contrato do port:
   *
   * 1. **É um CONJUNTO.** A tabela não tem `@@unique` nenhum, então "a Maria
   *    escreveu e depois leu o dia 2" são duas linhas legítimas e **um** id —
   *    senão a mensagem da guarda diria "2 dias" para um dia só.
   * 2. **A coluna é ANULÁVEL**, como a do `Note` e ao contrário da do
   *    `ReadingLog`: `IN (...)` contra nulo é falso no SQL, então o evento de
   *    anotação avulsa e o de grifo nunca mantêm um dia vivo. É a mesma linha
   *    do `NoteRepositoryFake`, e pelo mesmo motivo — um fake que colapsasse
   *    `null` no conjunto recusaria remoções que o Postgres aceita (§7.1, na
   *    direção restritiva, que é a que fica verde).
   *
   * ⚠️ **A saída antecipada da lista vazia NÃO tem acusador aqui**, como no
   * fake do log: em memória não existe "ida ao banco" a contar, e o resultado
   * é `[]` nas duas implementações. A propriedade se prova onde ela É
   * decidível (§7.10) — o teste de contrato
   * `asks the database nothing for an empty list, and once for a real one`,
   * que conta as consultas por `$on('query')`. **O ponteiro é pelo NOME do
   * teste, nunca pela linha** (§7.4). A linha fica aqui porque o fake que
   * divergisse do port seria a infidelidade do §7.1 — só não é ela que a
   * guarda.
   */
  async planItemIdsWithAnyActivityEvent(
    planItemIds: readonly string[],
  ): Promise<string[]> {
    // Conta a CHAMADA, não o sucesso (§7.3).
    this.planItemIdsWithAnyActivityEventCallCount += 1;

    if (planItemIds.length === 0) return [];

    const asked = new Set(planItemIds);
    const found = new Set<string>();
    for (const event of this.store.values()) {
      const { planItemId } = event;
      if (planItemId === null) continue;
      if (asked.has(planItemId)) found.add(planItemId);
    }
    return [...found];
  }

  /**
   * O acervo, para os testes olharem.
   *
   * ⚠️ **ARMADILHA DELIBERADA — não "conserte" esta ordem.** Enumera na ordem
   * INVERSA à de inserção, como os doze fakes anteriores. Não é bug: nasceu de
   * um teste de ordenação da Tarefa 07 que passava com a implementação errada
   * só porque os fixtures estavam na ordem esperada. A ordem que o Postgres
   * devolve sem `ORDER BY` é indefinida de verdade, então "invertida" é tão
   * fiel quanto qualquer outra — e é a única que **falha** quando alguém
   * confia na ordem do repositório. → §7.2.
   *
   * Ela nasce **antes** de existir um `find` (que é da Tarefa 34) pelo mesmo
   * motivo pelo qual o fake do grifo a teve na Tarefa 22 sem `find`: quem
   * escrever o feed encontra a armadilha pronta. E aqui isso importa mais do
   * que de costume — o feed é uma tela **ordenada por instante**, e é
   * exatamente onde confiar na ordem do repositório passaria despercebido.
   *
   * O corolário, fácil de esquecer: um teste cujo assunto **não é** a ordem não
   * deve depender dela — ordene antes de comparar, ou use `arrayContaining` +
   * `toHaveLength`. A ordem tem teste dedicado (`enumerates in reverse
   * insertion order`); é lá que ela é assunto.
   */
  get saved(): ActivityEvent[] {
    return [...this.store.values()].reverse().map((event) => this.clone(event));
  }

  /**
   * Quantas vezes `save` foi chamado — a chamada, não o sucesso.
   *
   * ⚠️ **É a espinha da Tarefa 33 inteira.** Três das regras da fatia não
   * existem sem ele, e nenhuma das três é decidível pelo acervo (§7.3):
   *
   * - **"o autosave não registra"** (regra 8): `saved` inalterado não separa
   *   "não chamou" de "chamou e a linha convergiu".
   * - **"três autosaves produzem UM evento"** (regra 9): é a diferença entre um
   *   feed com um evento e um feed com dezenas por meia hora de escrita.
   * - **"o gatilho vem DEPOIS da escrita"** (regra 11): com a escrita principal
   *   falhando, `saveCalls === 0` é a única coisa que distingue "não registrou"
   *   de "registrou e a transação sumiu".
   *
   * O lado POSITIVO é afirmado na suíte deste fake e nas dos quatro UseCases:
   * um contador só afirmado como `toBe(0)` é meio contador, porque um
   * incremento que alguém apague deixa todo `toBe(0)` passar por acidente —
   * e aí ele é a asserção vazia do §7.4.
   */
  get saveCalls(): number {
    return this.saveCallCount;
  }

  /**
   * Quantas vezes `find` foi chamado — a chamada, não o sucesso.
   *
   * É o que o corte de tenant do `listActivity` precisa: "recusou antes de ler"
   * e "leu e depois recusou" dão o mesmo erro para o cliente, e a segunda ordem
   * trafega o feed de um clube para quem não é dele antes de descartá-lo
   * (§7.3). O lado POSITIVO é afirmado na suíte deste fake e na do UseCase —
   * um contador só afirmado como `toBe(0)` é meio contador (§7.4).
   */
  get findCalls(): number {
    return this.findCallCount;
  }

  /**
   * Os filtros que o `find` recebeu, em cópia.
   *
   * O contador não distingue "o filtro foi para o repositório" de "o resultado
   * deu certo" (§7.3) — este distingue. É por ele que o `listActivity` prova
   * que manda **um** filtro só, com o `clubId` da rota e **nenhuma chave à
   * toa**: nada disso muda o resultado num clube de duas pessoas.
   */
  get findFilters(): readonly ActivityEventFilter[] {
    return this.findFiltersSeen.map((filter) => ({ ...filter }));
  }

  /**
   * Quantas vezes `planItemIdsWithAnyActivityEvent` foi chamado — a chamada,
   * não o sucesso.
   *
   * Existe para o `replacePlanItems` poder afirmar que a terceira guarda roda
   * **depois** do corte de tenant, do papel e da validação do rascunho: quem
   * não é admin daquele clube não descobre que houve atividade naquele dia, e
   * um rascunho malformado não chega a consultar. Sem contador, "recusou antes
   * de ler" e "leu e depois recusou" dão o mesmo erro para o cliente (§7.3) —
   * e o §7.3 manda um `xxxCalls === 0` para **cada** leitura de conteúdo.
   *
   * O lado POSITIVO é afirmado na suíte deste fake e na do UseCase: um contador
   * só afirmado como `toBe(0)` é meio contador (§7.4).
   */
  get planItemIdsWithAnyActivityEventCalls(): number {
    return this.planItemIdsWithAnyActivityEventCallCount;
  }

  /**
   * Clona nos dois sentidos (entrada do save e saída da leitura). Só o
   * `createdAt` precisa de cópia — o Prisma devolve `Date` nova a cada leitura
   * —, e não há clone profundo a fazer: a entidade guarda **referência, nunca
   * conteúdo** (decisão G), então não existe aqui nenhum campo mutável por
   * dentro como o `doc` da nota.
   */
  private clone(event: ActivityEvent): ActivityEvent {
    return { ...event, createdAt: new Date(event.createdAt) };
  }
}

/**
 * A ordem do feed: o mais recente primeiro, empate desfeito pelo `id`.
 *
 * É a MESMA ordem que o `PrismaActivityEventRepository` pede ao Postgres
 * (`orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]`), e é isso que a torna
 * fidelidade em vez de conveniência. O desempate não é decoração: `createdAt`
 * sozinho não é ordem total, e duas pessoas do clube salvando no mesmo
 * milissegundo é o caso normal.
 */
function compareForTheFeed(a: ActivityEvent, b: ActivityEvent): number {
  const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
