import type { ActivityEvent } from '../../domain/activity-event';
import type { ActivityEventRepository } from '../ports/activity-event-repository';

export class ActivityEventRepositoryFake implements ActivityEventRepository {
  private store = new Map<string, ActivityEvent>();
  private saveCallCount = 0;

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
