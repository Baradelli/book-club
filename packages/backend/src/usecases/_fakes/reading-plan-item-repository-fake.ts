import type { ReadingPlanItem } from '../../domain/book';
import type {
  PlanChange,
  ReadingPlanItemRepository,
} from '../ports/reading-plan-item-repository';

export class ReadingPlanItemRepositoryFake implements ReadingPlanItemRepository {
  private store = new Map<string, ReadingPlanItem>();
  private saveManyCallCount = 0;
  private replaceForBookCallCount = 0;
  private findByBookCallCount = 0;
  private removedIdsSeen: string[] = [];

  async saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]> {
    // Conta a CHAMADA, não o sucesso: um lote recusado pelo índice também foi
    // uma tentativa de escrita, e é isso que o teste quer saber.
    this.saveManyCallCount += 1;

    // Valida o lote inteiro ANTES de escrever: uma escrita parcial esconderia
    // uma regressão da atomicidade atrás de um plano meio salvo.
    this.assertUniqueDate(items);

    return this.write(items);
  }

  async byId(id: string): Promise<ReadingPlanItem | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  // Ordenado por `order`: é o que o port promete.
  async findByBook(bookId: string): Promise<ReadingPlanItem[]> {
    this.findByBookCallCount += 1;

    return [...this.store.values()]
      .filter((item) => item.bookId === bookId)
      .sort((a, b) => a.order - b.order)
      .map((item) => this.clone(item));
  }

  /**
   * Remoção + upsert numa só operação, como a implementação Prisma faz dentro
   * de um `$transaction`.
   *
   * A remoção é IDEMPOTENTE (id inexistente não estoura — um retry da mesma
   * substituição de plano não pode falhar) e é ESCOPADA ao livro: um id de
   * outro livro não apaga nada.
   *
   * A ordem é remover-depois-inserir, e ela importa aqui: é a remoção que
   * libera a `date` que um item novo do mesmo lote pode reivindicar.
   *
   * "Tudo ou nada": se o upsert violar o `unique(bookId, date)`, NADA foi
   * removido. É o que a transação dá no Postgres, e é o que a simulação sobre
   * uma cópia dá aqui.
   */
  async replaceForBook(
    bookId: string,
    change: PlanChange,
  ): Promise<ReadingPlanItem[]> {
    this.replaceForBookCallCount += 1;
    this.removedIdsSeen.push(...change.removeIds);

    const survivors = new Map(this.store);
    for (const id of change.removeIds) {
      // Escopo do livro: só apaga o que é deste livro.
      if (survivors.get(id)?.bookId === bookId) survivors.delete(id);
    }

    // A checagem roda contra o estado JÁ SEM os removidos, que é o que a
    // transação vê. Se ela estourar, o `this.store` continua intacto.
    this.assertUniqueDate(change.upsert, survivors);

    this.store = survivors;
    return this.write(change.upsert);
  }

  get saved(): ReadingPlanItem[] {
    return [...this.store.values()].map((item) => this.clone(item));
  }

  // Os contadores existem para o teste de caminho de erro do
  // `replacePlanItems` poder afirmar "nada foi escrito NEM apagado": `saved`
  // inalterado não distingue "não chamou" de "chamou com lote vazio". Mesmo
  // padrão do `compareCalls` do PasswordHasherFake (CONVENCOES-CODIGO §6.4).
  get saveManyCalls(): number {
    return this.saveManyCallCount;
  }

  get replaceForBookCalls(): number {
    return this.replaceForBookCallCount;
  }

  /**
   * Quantas vezes `findByBook` foi chamado.
   *
   * O plano de um livro é **conteúdo do clube** — os temas de cada dia —, então
   * "não leu o plano" é uma afirmação de tenant, não de desempenho: sem
   * contador, um UseCase que carregasse o plano ANTES do corte e só depois
   * recusasse daria o mesmo erro para o cliente e passaria verde.
   */
  get findByBookCalls(): number {
    return this.findByBookCallCount;
  }

  /** Todo id que alguma chamada pediu para remover, na ordem em que veio. */
  get removedIds(): readonly string[] {
    return [...this.removedIdsSeen];
  }

  private write(items: readonly ReadingPlanItem[]): ReadingPlanItem[] {
    const stored = items.map((item) => this.clone(item));
    for (const item of stored) {
      this.store.set(item.id, item);
    }
    return stored.map((item) => this.clone(item));
  }

  /**
   * Contrato do fake, não regra de domínio: emula o `@@unique([bookId, date])`
   * que o Postgres impõe.
   *
   * **`order` não entra aqui** — ele tem `@@index`, não `@@unique`. → ADR 0007.
   *
   * E a emulação é **sequencial**: `@@unique` do Prisma emite
   * `CREATE UNIQUE INDEX`, e índice único no Postgres não é deferível (só
   * `CONSTRAINT ... UNIQUE` seria). Cada linha é validada contra o estado da
   * tabela naquele instante — as linhas anteriores do lote já aplicadas, as
   * seguintes ainda não. Validar o lote em conjunto (o que este fake fazia)
   * mentia nos dois sentidos: aceitava um swap de datas que o banco recusa, e
   * — junto com o índice de `order` — recusava a renumeração que ele aceita.
   *
   * A simulação roda sobre uma CÓPIA e só a escrita grava: é a transação que
   * dá o "tudo ou nada" da escrita, não o índice.
   */
  private assertUniqueDate(
    items: readonly ReadingPlanItem[],
    initial: ReadonlyMap<string, ReadingPlanItem> = this.store,
  ): void {
    const simulated = new Map(initial);

    for (const item of items) {
      for (const existing of simulated.values()) {
        // O upsert do próprio id não colide consigo mesmo.
        if (existing.id === item.id) continue;
        if (existing.bookId !== item.bookId) continue;
        if (existing.date === item.date) {
          throw new Error(
            `ReadingPlanItemRepositoryFake: saving item ${item.id} violates unique(bookId, date) — ${existing.id} already uses ${item.date} in book ${item.bookId}`,
          );
        }
      }
      simulated.set(item.id, item);
    }
  }

  private clone(item: ReadingPlanItem): ReadingPlanItem {
    return { ...item, createdAt: new Date(item.createdAt) };
  }
}
