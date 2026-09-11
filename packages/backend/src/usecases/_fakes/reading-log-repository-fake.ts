import type { ReadingLog } from '../../domain/reading-log';
import type {
  ReadingLogFilter,
  ReadingLogRepository,
} from '../ports/reading-log-repository';

export class ReadingLogRepositoryFake implements ReadingLogRepository {
  private store = new Map<string, ReadingLog>();
  private saveCallCount = 0;
  private deleteCallCount = 0;
  private byPlanItemAndUserCallCount = 0;
  private findCallCount = 0;
  private findFiltersSeen: ReadingLogFilter[] = [];
  private planItemIdsWithAnyReadingLogCallCount = 0;

  /**
   * Upsert com o alvo em **`(planItemId, userId)`**, espelhando o
   * `PrismaReadingLogRepository.save`.
   *
   * ⚠️ **Este método LANÇAVA no par duplicado até a rodada de correção da
   * Tarefa 32**, porque a Tarefa 30 supôs que o Prisma faria upsert por `id`.
   * O revisor mediu que aquela escolha produzia **500** na corrida do
   * `markRead` (o `handle-domain-error.ts` não mapeia `P2002`), o repositório
   * passou a mirar o índice composto, e este fake seguiu — senão ele ficaria
   * **mais restritivo que o banco**, que é a direção do §7.1 que esconde
   * melhor, porque a suíte fica verde. O veredito e o histórico moram no
   * docblock do `describe('upsert on (planItemId, userId)')` da suíte deste
   * arquivo.
   *
   * O `id` que chega é **descartado** quando o par já existe: a linha mantém a
   * chave primária que tem, e é o que o Postgres faz. Sem isso, a corrida
   * trocaria a PK de um log existente.
   *
   * **Nenhuma exceção emulada aqui**, e é de propósito (§7.1.1: uma semântica
   * emulada a menos é uma fonte de bug a menos). O único `P2002` que o banco
   * ainda dá neste caminho é colisão de **chave primária** — mesmo `id`, par
   * diferente —, e nenhum UseCase consegue produzi-la: os ids saem de
   * `randomUUID()`. Emular o que não tem chamador é a especulação que o
   * `docs/WORKFLOW.md` proíbe.
   */
  async save(log: ReadingLog): Promise<ReadingLog> {
    // Conta a CHAMADA, não o sucesso: uma escrita que converge sobre uma linha
    // existente também foi uma tentativa, e é isso que o teste do UseCase quer
    // saber (§7.3).
    this.saveCallCount += 1;

    const existing = [...this.store.values()].find(
      (row) => row.planItemId === log.planItemId && row.userId === log.userId,
    );
    // `Map.set` sobre uma chave que já existe preserva a POSIÇÃO dela, então a
    // armadilha de ordem do `saved` continua valendo depois de um upsert.
    const row = existing ? { ...log, id: existing.id } : log;

    this.store.set(row.id, this.clone(row));
    return this.clone(row);
  }

  /**
   * "Esta pessoa já marcou este dia?" — e o par `(planItemId, userId)` **é a
   * identidade** do registro.
   *
   * É por isso que nenhum dos dois UseCases da fatia recebe id de log: o log de
   * outra pessoa é **inalcançável** por esta busca, e não porque um `if` o
   * proíba. Um guard de autoria sobre uma busca que já é por autor seria uma
   * regra a manter em dia sem nada a guardar.
   */
  async byPlanItemAndUser(
    planItemId: string,
    userId: string,
  ): Promise<ReadingLog | null> {
    this.byPlanItemAndUserCallCount += 1;

    const found = [...this.store.values()].find(
      (log) => log.planItemId === planItemId && log.userId === userId,
    );
    return found ? this.clone(found) : null;
  }

  /**
   * "Quem leu o quê neste livro" — o `find` que a Tarefa 32 trouxe, junto da
   * implementação Prisma (§6.9).
   *
   * ⚠️ **Nenhuma semântica de `NULL` a emular aqui**, e é a diferença que
   * salta aos olhos em relação ao `NoteRepositoryFake`, que precisa do
   * `sql-equality.ts` para isso: os três campos deste filtro batem em colunas
   * **não anuláveis**, então `===` é fiel ao `=` do Postgres sem ressalva. A
   * regra do §7.1 que o `sql-equality.ts` codifica (`WHERE col = 'x'` contra
   * coluna nula é FALSO) não tem o que decidir quando não há coluna nula —
   * importá-lo aqui seria pagar acoplamento por uma regra que não se aplica.
   *
   * **Campo ausente não filtra**, que é o que faz `{ bookId }` sozinho devolver
   * o livro inteiro — o caso da sobreposição da tela.
   *
   * **Sem teto de linhas**, como o port declara: um `take` aqui apagaria
   * leitores em silêncio. O motivo inteiro (e a medição que desmentiu a
   * previsão do `docs/BACKLOG.md`) mora no docblock do port — uma verdade, um
   * lugar.
   */
  async find(filter: ReadingLogFilter): Promise<ReadingLog[]> {
    this.findCallCount += 1;
    // Uma CÓPIA, não a referência: o chamador pode reusar (e mutar) o objeto
    // que passou, e um filtro pinado que mudasse depois não pinaria nada.
    this.findFiltersSeen.push({ ...filter });

    return this.inReverseInsertionOrder()
      .filter((log) => log.bookId === filter.bookId)
      .filter(
        (log) => filter.userId === undefined || log.userId === filter.userId,
      )
      .filter(
        (log) =>
          filter.planItemId === undefined ||
          log.planItemId === filter.planItemId,
      )
      .map((log) => this.clone(log));
  }

  /**
   * Dos ids pedidos, quais alguém já leu — a leitura da segunda guarda do
   * `replacePlanItems` (Tarefa 32c), espelho do `planItemIdsWithAnyNote` do
   * `NoteRepositoryFake`.
   *
   * Duas fidelidades, e as duas são contrato do port, não detalhe:
   *
   * 1. **É um CONJUNTO.** Duas pessoas que leram o mesmo dia são duas linhas
   *    legítimas (o `@@unique` é `(planItemId, userId)`) e **um** id — senão a
   *    mensagem da guarda diria "2 dias" para um dia só.
   * 2. **Lista vazia sai antes do laço.** No Prisma seria um `IN ()`, que o
   *    port declara como "sem ida ao banco" — e lá isso é uma consulta a menos
   *    em toda troca de plano que não remove nada.
   *
   * ⚠️ **A saída antecipada desta linha NÃO tem acusador aqui, e o lugar onde
   * ela é provada é outro arquivo.** Medido na rodada de correção: removê-la
   * deixa a suíte do backend em **1420/1420 — zero acusadores**, porque em
   * memória não existe "ida ao banco" a contar e o resultado é `[]` nas duas
   * implementações. A propriedade se prova onde ela É decidível (§7.10), e lá
   * ela tem acusador: o teste de contrato
   * `asks the database nothing for an empty list, and once for a real one`,
   * em `repositories/__tests__/prisma-reading-log-repository.contract.integration.test.ts`,
   * que conta as consultas realmente emitidas por `$on('query')`. **O ponteiro
   * é pelo NOME do teste, nunca pela linha** (§7.4): um número envelhece
   * sozinho, e o próximo leitor confere a linha errada e conclui que a dívida
   * foi paga. A linha fica aqui porque o fake que divergisse do port seria a
   * infidelidade do §7.1 — só não é ela que a guarda.
   *
   * **Nenhuma semântica de `NULL` a emular**, ao contrário do irmão da nota:
   * `ReadingLog.planItemId` é NOT NULL (não existe leitura avulsa), então não
   * há a linha "o `IN (...)` contra coluna nula é falso" para reproduzir.
   */
  async planItemIdsWithAnyReadingLog(
    planItemIds: readonly string[],
  ): Promise<string[]> {
    this.planItemIdsWithAnyReadingLogCallCount += 1;

    if (planItemIds.length === 0) return [];

    const asked = new Set(planItemIds);
    const found = new Set<string>();
    for (const log of this.store.values()) {
      if (asked.has(log.planItemId)) found.add(log.planItemId);
    }
    return [...found];
  }

  /**
   * Hard delete, e **idempotente**: `Map.delete` de uma chave que não existe é
   * um no-op silencioso.
   *
   * Isso é fidelidade ao que o port CONTRATA, e não indulgência.
   *
   * ⚠️ A pergunta do §7.1 é "o Postgres faria isto?", e a Tarefa 32 respondeu:
   * o repositório usa `deleteMany`, que devolve `{ count: 0 }` em vez de
   * lançar. **O dono dessa decisão é o docblock de
   * `ports/reading-log-repository.ts` (`delete`)**, com a medição do `P2025`
   * colada lá. Não repita a afirmação aqui: uma verdade sobre o banco copiada
   * para um segundo arquivo é como a frase errada da Tarefa 23 viajou por
   * quatro (§7.1).
   */
  async delete(id: string): Promise<void> {
    // Conta a CHAMADA, não o sucesso: apagar um id que não está lá também foi
    // uma ida ao banco, e é exatamente o par que a regra 14 do `unmarkRead`
    // precisa distinguir — "não chamou" × "chamou e não havia o que apagar".
    this.deleteCallCount += 1;

    this.store.delete(id);
  }

  /**
   * O acervo, para os testes olharem.
   *
   * ⚠️ **ARMADILHA DELIBERADA — não "conserte" esta ordem.** Enumera na ordem
   * INVERSA à de inserção. Não é bug: nasceu de um teste de ordenação da Tarefa
   * 07 que passava com a implementação errada só porque os fixtures estavam na
   * ordem esperada — um falso verde perfeito. A ordem que o Postgres devolve
   * sem `ORDER BY` é indefinida de verdade (depende de plano de execução e de
   * `VACUUM`), então "invertida" é tão fiel quanto qualquer outra — e é a única
   * que **falha** quando alguém confia na ordem do repositório. → §7.2.
   *
   * Ela nasce **antes** de existir um `find` (que é da Tarefa 32), pelo mesmo
   * motivo pelo qual o fake do grifo a teve na Tarefa 22 sem `find`: o
   * `computeBookProgress` da Tarefa 31 encontra a armadilha pronta em vez de
   * uma ordem "natural" de que alguém poderia depender no meio do caminho.
   *
   * O corolário, que é a parte fácil de esquecer: um teste cujo assunto **não
   * é** a ordem não deve depender dela — ordene antes de comparar, ou use
   * `arrayContaining` + `toHaveLength`. A ordem tem teste dedicado
   * (`enumerates in reverse insertion order`); é lá que ela é assunto.
   */
  get saved(): ReadingLog[] {
    return this.inReverseInsertionOrder().map((log) => this.clone(log));
  }

  /**
   * Quantas vezes `save` foi chamado — a chamada, não o sucesso.
   *
   * Existe para o `markRead` poder afirmar duas coisas que o resultado não
   * distingue (§7.3): que o corte de tenant **recusou antes de escrever**
   * (`toBe(0)`), e que a segunda marcação do mesmo dia **não escreve de novo**
   * (`toBe(1)`) — sem o contador, um `save` que sobrescrevesse a mesma linha
   * passaria por idempotente, e "chamou à toa" é um `UPDATE` por toque.
   *
   * O lado POSITIVO é assertado na suíte do fake e na do UseCase: um contador
   * só afirmado como `toBe(0)` é meio contador, porque um incremento que alguém
   * apague deixa todo `toBe(0)` passar por acidente — e aí ele é a asserção
   * vazia do §7.4. Mesmo padrão do `compareCalls` do `PasswordHasherFake`
   * (§6.4).
   */
  get saveCalls(): number {
    return this.saveCallCount;
  }

  /**
   * Quantas vezes `delete` foi chamado — a chamada, não o sucesso.
   *
   * É a metade sem a qual a regra 14 do `unmarkRead` não existe: desmarcar o
   * que não está marcado tem de ser um no-op **sem ida ao banco**, e um
   * `delete` de id inexistente disfarçado de no-op dá exatamente o mesmo
   * resultado observável. Só o contador os separa.
   */
  get deleteCalls(): number {
    return this.deleteCallCount;
  }

  /**
   * Quantas vezes `byPlanItemAndUser` foi chamado.
   *
   * Existe pelo motivo do `findCalls` dos outros fakes: um ator sem membership
   * ativo não pode gerar nem uma leitura, senão a rota vira oráculo de
   * existência (e conta de banco) para quem não é do clube. Sem contador,
   * "recusou depois de consultar" e "recusou antes" dão o mesmo erro.
   */
  get byPlanItemAndUserCalls(): number {
    return this.byPlanItemAndUserCallCount;
  }

  /**
   * Quantas vezes `find` foi chamado.
   *
   * O corte de tenant do `getBookWithPlan` precisa dele, e precisa **para cada
   * leitura de conteúdo** (§7.3): a auditoria da Tarefa 10 achou um mutante que
   * lia o plano antes do corte e sobrevivia a 906 testes, porque o único
   * contador afirmado era o das notas. Quem já leu cada dia é conteúdo do clube
   * tanto quanto o plano e a anotação.
   */
  get findCalls(): number {
    return this.findCallCount;
  }

  /**
   * Os filtros que o `find` recebeu, em cópia.
   *
   * O contador não distingue "o filtro foi para o repositório" de "o resultado
   * deu certo" (§7.3) — este distingue. É por ele que o `getBookWithPlan` prova
   * que manda **um** filtro só, com o `bookId` do livro e **nenhuma chave à
   * toa**: nada disso muda o resultado num clube de duas pessoas.
   */
  get findFilters(): readonly ReadingLogFilter[] {
    return this.findFiltersSeen.map((filter) => ({ ...filter }));
  }

  /**
   * Quantas vezes `planItemIdsWithAnyReadingLog` foi chamado — como o
   * `findCalls`, e conta a chamada, não o sucesso.
   *
   * Existe para o `replacePlanItems` poder afirmar que a segunda guarda roda
   * **depois** do corte de tenant e **depois** da validação do rascunho: quem
   * não é admin daquele clube não descobre que alguém leu, e um rascunho
   * malformado não chega a consultar. Sem contador, "recusou antes de ler" e
   * "leu e depois recusou" dão o mesmo erro para o cliente (§7.3).
   */
  get planItemIdsWithAnyReadingLogCalls(): number {
    return this.planItemIdsWithAnyReadingLogCallCount;
  }

  private inReverseInsertionOrder(): ReadingLog[] {
    return [...this.store.values()].reverse();
  }

  /**
   * Clona nos dois sentidos (entrada do save e saída da leitura): nem o
   * chamador contamina o store, nem o store devolve referência sua.
   *
   * Só o `readAt` precisa de cópia — o Prisma devolve `Date` nova a cada
   * leitura —, e não há clone profundo a fazer: a entidade não tem nenhum campo
   * mutável por dentro (nada de `doc`, que é a árvore do ProseMirror). É o
   * `clone` mais curto do projeto, e é assim porque a entidade é a mais rasa.
   */
  private clone(log: ReadingLog): ReadingLog {
    return { ...log, readAt: new Date(log.readAt) };
  }
}
