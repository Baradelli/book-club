import type { ReadingLog } from '../../domain/reading-log';
import type { ReadingLogRepository } from '../ports/reading-log-repository';

export class ReadingLogRepositoryFake implements ReadingLogRepository {
  private store = new Map<string, ReadingLog>();
  private saveCallCount = 0;
  private deleteCallCount = 0;
  private byPlanItemAndUserCallCount = 0;

  async save(log: ReadingLog): Promise<ReadingLog> {
    // Conta a CHAMADA, não o sucesso: uma escrita recusada pelo índice também
    // foi uma tentativa, e é isso que o teste do UseCase quer saber (§7.3).
    this.saveCallCount += 1;

    this.assertUniquePlanItemAndUser(log);

    this.store.set(log.id, this.clone(log));
    return this.clone(log);
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
   * Hard delete, e **idempotente**: `Map.delete` de uma chave que não existe é
   * um no-op silencioso.
   *
   * Isso é fidelidade ao que o port CONTRATA, e não indulgência.
   *
   * ⚠️ A pergunta do §7.1 é "o Postgres faria isto?", e aqui a resposta depende
   * de qual chamada de Prisma a Tarefa 32 escrever. **O dono dessa decisão é o
   * docblock de `ports/reading-log-repository.ts` (`delete`)** — inclusive a
   * separação entre o que ali está medido e o que não está. Não repita a
   * afirmação aqui: uma verdade sobre o banco copiada para um segundo arquivo
   * é como a frase errada da Tarefa 23 viajou por quatro (§7.1).
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

  private inReverseInsertionOrder(): ReadingLog[] {
    return [...this.store.values()].reverse();
  }

  /**
   * Contrato do fake, não regra de domínio: emula o
   * `@@unique([planItemId, userId])` que a Tarefa 32 declara no Postgres.
   *
   * ⚠️ **A fidelidade tem DUAS direções, e a restritiva é a que esconde
   * melhor** — a suíte fica verde (§7.1, sexta aparição da classe do ADR 0007):
   *
   * 1. **Recusa o segundo `save` do mesmo par**, linha por linha e contra o
   *    estado da tabela naquele instante — a linha do próprio id não colide
   *    consigo mesma. Sem isso, a idempotência do `markRead` passaria verde com
   *    um segundo `INSERT`, e o `P2002` só apareceria em produção.
   * 2. **Aceita** o mesmo `planItemId` com **outro** `userId` (o clube inteiro
   *    lê o mesmo trecho — é o produto) e o mesmo `userId` com **outro**
   *    `planItemId` (a pessoa lê o livro, um dia por vez). Um fake "cuidadoso"
   *    que recusasse qualquer um dos dois faria o caso central nascer provando
   *    o comportamento errado, sem nada ficar vermelho.
   *
   * ⚠️ **A metade do `NULL` do `NoteRepositoryFake` NÃO existe aqui**, e a
   * ausência é a diferença que salta aos olhos entre os dois fakes: o
   * `Note.planItemId` é anulável (é o que faz a anotação avulsa existir) e um
   * índice único do Postgres não compara `NULL` com `NULL`, então lá o `null`
   * precisa de um `return` antecipado. `ReadingLog.planItemId` é **não
   * anulável** — não existe leitura avulsa —, então não há `NULL` que colida
   * nem que deixe de colidir.
   *
   * E recusa **ANTES** de escrever: uma escrita parcial esconderia a regra
   * "nada é gravado se a validação falha" dos UseCases.
   */
  private assertUniquePlanItemAndUser(log: ReadingLog): void {
    for (const existing of this.store.values()) {
      if (existing.id === log.id) continue;
      if (existing.planItemId !== log.planItemId) continue;
      if (existing.userId !== log.userId) continue;

      throw new Error(
        `ReadingLogRepositoryFake: writing reading log ${log.id} violates unique(planItemId, userId) — ${existing.id} already belongs to user ${log.userId} on plan item ${log.planItemId}`,
      );
    }
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
