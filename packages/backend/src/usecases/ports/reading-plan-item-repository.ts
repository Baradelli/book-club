import type { ReadingPlanItem } from '../../domain/book';

/** O diff de um plano, como o `replacePlanItems` o calcula. */
export interface PlanChange {
  /** O plano NOVO inteiro, em ordem. Upsert por `id`. */
  upsert: readonly ReadingPlanItem[];
  /** Os itens cuja data desapareceu. **Idempotente**: id inexistente não é erro. */
  removeIds: readonly string[];
}

export interface ReadingPlanItemRepository {
  // `saveMany` e não `save`: o plano nasce como unidade de ~30 linhas. Um save
  // por item seriam 30 idas ao banco e abriria a porta a escrita parcial.
  //
  // É UPSERT POR `id`, e é isso que faz o diff do `replacePlanItems`
  // funcionar sem um `update` separado: o item cuja data sobrevive volta com o
  // mesmo id, então a `Note` que aponta para ele continua apontando.
  saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]>;
  /**
   * O item do plano por id. **Não confere clube**: quem faz o corte é o
   * `bookForActor`, que carrega o livro do item e tira o clube de
   * `book.clubId`. Duplicar o corte aqui criaria uma segunda regra de tenant
   * para manter em sincronia com aquela.
   */
  byId(id: string): Promise<ReadingPlanItem | null>;
  /** O plano do livro, ordenado por `order` crescente. */
  findByBook(bookId: string): Promise<ReadingPlanItem[]>;
  /**
   * Aplica o diff do plano de um livro numa só operação **atômica**.
   *
   * Por que um método só, e não `deleteMany` + `saveMany` (que é o que este
   * port tinha até a Tarefa 07): em memória as duas chamadas eram atômicas de
   * graça, mas contra o Postgres um crash entre elas deixa o plano
   * **truncado** — e é esta tabela que ancora as anotações das pessoas.
   * `CLAUDE.md` proíbe o UseCase importar Prisma, então o UseCase não pode
   * abrir transação; e um "port de unit-of-work" genérico vazaria o conceito
   * de transação para dentro do domínio. A saída é esta: o port declara a
   * OPERAÇÃO, e a implementação Prisma a envolve num `$transaction`.
   *
   * Remove antes de inserir. Não é mais obrigatório pelos índices (ADR 0007
   * tirou o único de `order`, e uma data do rascunho nunca é uma data
   * removida), mas mantém a menor contagem de linhas no pico e faz a guarda do
   * Bloco C ("não remover item que já tem nota") falhar antes de escrever.
   *
   * `bookId` não é decoração: a remoção é escopada a ele, então um id de outro
   * livro no `removeIds` não apaga nada.
   *
   * Devolve os itens do `upsert` como ficaram gravados, na ordem em que
   * vieram.
   */
  replaceForBook(
    bookId: string,
    change: PlanChange,
  ): Promise<ReadingPlanItem[]>;
}
