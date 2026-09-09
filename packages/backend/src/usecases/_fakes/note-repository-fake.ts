import type { Note, PlanItemWriter } from '../../domain/note';
import type {
  NoteFilter,
  NotePatch,
  NoteRepository,
} from '../ports/note-repository';
import { matches } from './sql-equality';

export class NoteRepositoryFake implements NoteRepository {
  private store = new Map<string, Note>();
  private saveCallCount = 0;
  private updateCallCount = 0;
  private findFiltersSeen: NoteFilter[] = [];
  private planItemWritersByBookCallCount = 0;
  private planItemIdsWithAnyNoteCallCount = 0;

  async save(note: Note): Promise<Note> {
    // Conta a CHAMADA, não o sucesso: uma escrita recusada pelo índice também
    // foi uma tentativa, e é isso que o teste quer saber.
    this.saveCallCount += 1;

    this.assertUniquePlanItemAndUser(note);

    this.store.set(note.id, this.clone(note));
    return this.clone(note);
  }

  /**
   * A nota por id — **inclusive arquivada**, como o port manda. Esconder aqui
   * tiraria do domínio a decisão de tratar arquivada e inexistente igual.
   */
  async byId(id: string): Promise<Note | null> {
    const found = this.store.get(id);
    return found ? this.clone(found) : null;
  }

  /**
   * O patch é `NotePatch`, e é o que torna este método simples.
   *
   * `NotePatch` não tem `id`, `clubId`, `bookId`, `userId`, `kind` nem
   * `planItemId`, então **nenhum `update` pode criar par `(planItemId, userId)`
   * duplicado** — a validação do índice único vive só no `save`. É de propósito
   * que a semântica emulada aqui encolheu: cada semântica que este projeto
   * pediu ao fake para emular virou fonte de bug (§7.1), e a que estava aqui
   * era exatamente uma divergência contra o `toUpdateData` do Prisma.
   *
   * ⚠️ **Campo a campo, e não `{ ...existing, ...patch }`** — é o que fecha o
   * buraco que o tipo sozinho não fecha. A checagem de propriedade em excesso
   * do TypeScript só vale para **literal fresco**: `update(id, { userId })` é
   * recusado pelo compilador, mas um patch montado por variável atravessa, e o
   * spread obedeceria enquanto o `toUpdateData` do Prisma ignora em silêncio —
   * a divergência do §7.1 de volta, na direção que deixa a suíte verde. Aqui a
   * lista das sete chaves do `NotePatch` é a barreira de runtime, e a única
   * coisa que uma chave a mais no patch encontra é o chão.
   */
  async update(id: string, patch: NotePatch): Promise<Note> {
    // Conta a CHAMADA, não o sucesso: um update recusado também foi uma
    // tentativa de escrita, e é isso que o teste quer saber.
    this.updateCallCount += 1;

    const existing = this.store.get(id);
    if (!existing) {
      throw new Error(
        `NoteRepositoryFake: cannot update note ${id} — it was never saved`,
      );
    }

    // `undefined` é "não mexe" e `null` é "grave nulo", como no Prisma — é o
    // que o `!== undefined` de cada linha preserva, e é o mesmo que o
    // `toUpdateData` do `PrismaNoteRepository` faz, chave por chave.
    const next: Note = { ...existing };
    if (patch.title !== undefined) next.title = patch.title;
    if (patch.reference !== undefined) next.reference = patch.reference;
    if (patch.doc !== undefined) next.doc = patch.doc;
    if (patch.plainText !== undefined) next.plainText = patch.plainText;
    if (patch.status !== undefined) next.status = patch.status;
    if (patch.archivedAt !== undefined) next.archivedAt = patch.archivedAt;
    if (patch.updatedAt !== undefined) next.updatedAt = patch.updatedAt;

    // O clone corta o aliasing de `Date` e do `doc` que venham pelo patch.
    const updated = this.clone(next);

    this.store.set(id, updated);
    return this.clone(updated);
  }

  /**
   * A nota do dia daquela pessoa — **inclusive arquivada**, como o port manda.
   * O índice único não olha status, então esconder a arquivada aqui faria o
   * upsert do dia criar uma segunda nota e bater no índice.
   */
  async byPlanItemAndUser(
    planItemId: string,
    userId: string,
  ): Promise<Note | null> {
    /**
     * Fidelidade ao Postgres, não regra de domínio: `WHERE "planItemId" = NULL`
     * não devolve linha nenhuma — `NULL` não é igual a nada, nem a `NULL`. Sem
     * esta linha, o `find` casaria `null === null` e devolveria a primeira nota
     * FREE do autor, onde o banco devolve vazio. É a classe de bug do ADR 0007.
     *
     * O port declara `string`, então isto é inalcançável pelos tipos hoje — o
     * alargamento local existe só para o `===` compilar. Fica porque o
     * compilador não guarda a porta de quem passar um `null` por um caminho
     * `unknown` (corpo de request, cast, JS).
     */
    const key: string | null = planItemId;
    if (key === null) return null;

    const found = [...this.store.values()].find(
      (note) => note.planItemId === key && note.userId === userId,
    );
    return found ? this.clone(found) : null;
  }

  /**
   * O acervo filtrado. Cada filtro entra em **AND** com o `clubId`, que é o
   * corte de tenant e nunca é opcional.
   */
  async find(filter: NoteFilter): Promise<Note[]> {
    this.findFiltersSeen.push({ ...filter });

    return this.inReverseInsertionOrder()
      .filter(
        (note) =>
          note.clubId === filter.clubId &&
          matches(filter.bookId, note.bookId) &&
          matches(filter.authorId, note.userId) &&
          matches(filter.kind, note.kind) &&
          matches(filter.planItemId, note.planItemId) &&
          matchesText(filter.text, note.plainText) &&
          // `status` ausente no filtro = os dois status, como no `BookFilter`.
          matches(filter.status, note.status),
      )
      .map((note) => this.clone(note));
  }

  /**
   * Os pares (dia de leitura, autor) das notas ACTIVE do livro.
   *
   * Só as que têm `planItemId`: no Postgres é o `WHERE "planItemId" IS NOT
   * NULL`, e é o que deixa a anotação avulsa fora da sobreposição de autoria.
   */
  async planItemWritersByBook(bookId: string): Promise<PlanItemWriter[]> {
    this.planItemWritersByBookCallCount += 1;

    // `flatMap` e não `filter` + `map`: é o que deixa o `planItemId` estreitar
    // de `string | null` para `string` sem um `??` de fallback — e fallback em
    // campo de identidade é como um id errado entra numa resposta calada.
    return this.inReverseInsertionOrder().flatMap((note) => {
      const { planItemId } = note;
      if (planItemId === null) return [];
      if (note.bookId !== bookId) return [];
      if (note.status !== 'ACTIVE') return [];

      return [{ planItemId, userId: note.userId }];
    });
  }

  /**
   * Dos ids dados, quais têm alguma nota — **inclusive arquivada**.
   *
   * A única diferença em relação ao `planItemWritersByBook` acima é a ausência
   * do `status !== 'ACTIVE'`, e ela é o método: quem barra a remoção de um dia
   * do plano é a FK, e a FK não olha status.
   *
   * O `Set` não é otimização: é o contrato. Dois autores no mesmo dia dão UM
   * id, senão a mensagem da guarda diria "2 dias" para um dia só. E a lista
   * vazia sai antes do laço — no Prisma seria um `IN ()`, que o port declara
   * como "sem ida ao banco".
   */
  async planItemIdsWithAnyNote(
    planItemIds: readonly string[],
  ): Promise<string[]> {
    this.planItemIdsWithAnyNoteCallCount += 1;

    if (planItemIds.length === 0) return [];

    const asked = new Set(planItemIds);
    const found = new Set<string>();
    for (const note of this.store.values()) {
      const { planItemId } = note;
      // Fidelidade ao SQL, a mesma do `matches`: `IN (...)` contra uma coluna
      // nula é falso, então a avulsa nunca mantém um dia vivo.
      if (planItemId === null) continue;
      if (asked.has(planItemId)) found.add(planItemId);
    }
    return [...found];
  }

  get saved(): Note[] {
    return [...this.store.values()].map((note) => this.clone(note));
  }

  /**
   * Quantas vezes `save` foi chamado — a chamada, não o sucesso.
   *
   * Existe para os testes de caminho de erro dos UseCases poderem afirmar
   * "nada foi escrito" sem confundir "não chamou" com "chamou e o índice
   * recusou". Mesmo padrão do `compareCalls` do PasswordHasherFake
   * (CONVENCOES-CODIGO §6.4).
   */
  get saveCalls(): number {
    return this.saveCallCount;
  }

  /**
   * Quantas vezes `update` foi chamado — a chamada, não o sucesso.
   *
   * Existe pelo mesmo motivo do `saveCalls`, e ainda por um: `update` com patch
   * vazio é no-op, então `saved` inalterado não distingue "não chamou o repo"
   * de "chamou e o patch não mudou nada" — e "chamou à toa" é um `UPDATE` por
   * request em toda tela que salva sem mudar nada (regra 17 do `editNote`).
   */
  get updateCalls(): number {
    return this.updateCallCount;
  }

  /**
   * Quantas vezes `find` foi chamado.
   *
   * Existe para o teste do `listNotes` afirmar que **o corte de tenant vem
   * ANTES da consulta**: um ator sem membership não pode gerar nem uma leitura.
   * Sem contador, "recusou depois de consultar" e "recusou antes" dão o mesmo
   * erro. Mesmo padrão do `compareCalls` do PasswordHasherFake
   * (CONVENCOES-CODIGO §6.4).
   */
  get findCalls(): number {
    return this.findFiltersSeen.length;
  }

  /**
   * O filtro de cada chamada de `find`, na ordem em que veio — **cópias**, para
   * um chamador que reuse o objeto do filtro não reescrever o histórico.
   *
   * Existe porque o resultado não distingue "mandou um filtro só, completo" de
   * "mandou vários" nem revela o `status: 'ACTIVE'` que o UseCase acrescenta:
   * um `listNotes` que esquecesse o status devolveria o mesmo array em todo
   * cenário sem nota arquivada.
   */
  get findFilters(): readonly NoteFilter[] {
    return this.findFiltersSeen.map((filter) => ({ ...filter }));
  }

  /** Quantas vezes `planItemWritersByBook` foi chamado — como o `findCalls`. */
  get planItemWritersByBookCalls(): number {
    return this.planItemWritersByBookCallCount;
  }

  /**
   * Quantas vezes `planItemIdsWithAnyNote` foi chamado — como o `findCalls`.
   *
   * Existe para o `replacePlanItems` poder afirmar que a guarda roda **depois**
   * do corte de tenant e **depois** da validação do rascunho: quem não é admin
   * do clube não descobre que existem notas, e um rascunho malformado não
   * chega a consultar. Sem contador, "recusou antes de ler" e "leu e depois
   * recusou" dão o mesmo erro para o cliente.
   */
  get planItemIdsWithAnyNoteCalls(): number {
    return this.planItemIdsWithAnyNoteCallCount;
  }

  /**
   * ⚠️ **ARMADILHA DELIBERADA — não "conserte" esta ordem.**
   *
   * As duas leituras de coleção (`find` e `planItemWritersByBook`) enumeram na
   * ordem INVERSA à de inserção. Não é bug: os dois ports declaram
   * explicitamente que **não prometem ordem**, e a Tarefa 07 descobriu um teste
   * de ordenação que passava com a implementação errada só porque os fixtures
   * estavam na ordem esperada. Um fake que devolvesse na ordem "natural"
   * deixaria um `listNotes` sem `sort` passar verde.
   *
   * A ordem que o Postgres devolve sem `ORDER BY` é indefinida de verdade
   * (depende de plano de execução e de `VACUUM`), então "invertida" é tão
   * fiel quanto qualquer outra — e é a única que FALHA quando alguém confia na
   * ordem do repositório.
   */
  private inReverseInsertionOrder(): Note[] {
    return [...this.store.values()].reverse();
  }

  /**
   * Contrato do fake, não regra de domínio: emula o
   * `@@unique([planItemId, userId])` que o Postgres impõe.
   *
   * Só o `save` passa por aqui: o `NotePatch` do `update` não tem
   * `planItemId` nem `userId`, então um patch não consegue criar par duplicado.
   *
   * Duas fidelidades, e o ADR 0007 mostrou que errar em qualquer das duas é
   * bug:
   *
   * 1. **Linha por linha, contra o estado atual da tabela.** Cada escrita é
   *    conferida contra o que já está lá, e a linha do próprio id não colide
   *    consigo mesma (o `save` da nota do dia reescreve a que existe).
   * 2. **`NULL` não colide.** Índice único no Postgres não compara `NULL` com
   *    `NULL`: N anotações avulsas (`planItemId: null`) do mesmo autor no mesmo
   *    livro convivem. Tratar `null` como valor faria o fake reprovar a segunda
   *    avulsa — o oposto do "ilimitado" que o BACKLOG decidiu.
   *
   * E recusa ANTES de escrever: uma escrita parcial esconderia a regra "nada é
   * gravado se a validação falha" dos UseCases.
   */
  private assertUniquePlanItemAndUser(note: Note): void {
    if (note.planItemId === null) return;

    for (const existing of this.store.values()) {
      if (existing.id === note.id) continue;
      if (existing.planItemId !== note.planItemId) continue;
      if (existing.userId !== note.userId) continue;

      throw new Error(
        `NoteRepositoryFake: writing note ${note.id} violates unique(planItemId, userId) — ${existing.id} already belongs to user ${note.userId} on plan item ${note.planItemId}`,
      );
    }
  }

  /**
   * Clona nos dois sentidos (entrada do save e saída da leitura): nem o
   * chamador contamina o store, nem o store devolve referência sua.
   *
   * As `Date` precisam ser copiadas — o Prisma devolve `Date` nova a cada
   * leitura — e o `doc` precisa de clone PROFUNDO: é uma árvore, o único campo
   * mutável por dentro, e o Prisma o reparseia do JSON a cada leitura.
   */
  private clone(note: Note): Note {
    return {
      ...note,
      doc: structuredClone(note.doc),
      createdAt: new Date(note.createdAt),
      updatedAt: new Date(note.updatedAt),
      // null preservado: new Date(null) seria a epoch, não null.
      archivedAt: note.archivedAt === null ? null : new Date(note.archivedAt),
    };
  }
}

/**
 * A busca do `NoteFilter.text`: o `ILIKE '%...%'` do Postgres, com as duas
 * fidelidades que importam.
 *
 * 1. **Case-insensitive sim.** `toLowerCase` e não `toLocaleLowerCase`: a
 *    dobra de caixa do JS por locale depende do ICU do processo, e o banco não
 *    tem o locale do Node.
 * 2. **Accent-insensitive NÃO.** `'coração' ILIKE '%coracao%'` é **falso** no
 *    Postgres. Normalizar acento aqui (`NFD` + tirar diacríticos) seria
 *    infidelidade na direção PERMISSIVA: o teste passaria verde e a busca real
 *    não acharia nada — a classe de bug do ADR 0007. Busca sem acento exige a
 *    extensão `unaccent`, e é Tarefa 29, com migration e ADR.
 *
 * Só o `plainText` é comparado. `title` e `reference` ficam FORA por decisão
 * fechada do MVP 2 ("busca é `ILIKE` no `plainText`/`commentText`").
 */
function matchesText(text: string | undefined, plainText: string): boolean {
  if (text === undefined) return true;
  return plainText.toLowerCase().includes(text.toLowerCase());
}
