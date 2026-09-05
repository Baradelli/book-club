import type { GeneralStatus } from '../../domain/club';
import type { Note, NoteKind, PlanItemWriter } from '../../domain/note';

/**
 * O filtro do acervo de anotações. Mesmo formato do `BookFilter`: o `clubId` é
 * obrigatório porque é o corte de tenant, e todo o resto é opcional.
 */
export interface NoteFilter {
  /** OBRIGATÓRIO. É o corte de tenant, sempre em AND com o resto. */
  clubId: string;
  bookId?: string;
  /** O autor. É o "de \<pessoa\>" do filtro de navegação (→ ADR 0002). */
  authorId?: string;
  kind?: NoteKind;
  planItemId?: string;
  /**
   * Substring **case-insensitive** em `plainText` — e só nele, nunca no `title`
   * nem na `reference`. É o `ILIKE '%...%'` do Postgres, o que traz duas
   * consequências que o fake reproduz de propósito:
   *
   * 1. **Acento NÃO é ignorado**: `'coração' ILIKE '%coracao%'` é falso. Busca
   *    sem acento exigiria a extensão `unaccent` (Tarefa 29).
   * 2. Quem normaliza (`trim`, vazio = "não filtra") é o UseCase, não o
   *    repositório: aqui `text` já chega decidido.
   *
   * No contrato, `%`, `_` e `\` são **caracteres literais** — quem os escapa
   * antes de montar o `LIKE` é o repositório Prisma, não o chamador.
   */
  text?: string;
  /** Ausente = os dois status. */
  status?: GeneralStatus;
}

/**
 * O que o `update` de nota honra. **NÃO é `Partial<Note>`, de propósito.**
 *
 * Identidade (`id`), tenant (`clubId`/`bookId`), autoria (`userId`) e âncora
 * (`kind`/`planItemId`) não são patcheáveis: mover conteúdo entre clubes ou
 * trocar o autor não é operação que exista neste produto. `createdAt` também
 * fica fora — nada reescreve quando a nota nasceu.
 *
 * Antes, o tipo permitia pedir isso, e as duas implementações discordavam: o
 * fake aplicava toda chave do patch (menos `id`) e o `toUpdateData` do Prisma
 * tinha uma allowlist, então `update(id, { userId: 'x' })` **trocava a autoria
 * no fake** e era **no-op silencioso no Postgres** — a classe do ADR 0007, na
 * direção que esconde melhor (a suíte fica verde).
 *
 * ⚠️ O tipo estreito **não fecha o buraco sozinho**: a checagem de propriedade
 * em excesso do TypeScript só vale para literal FRESCO, e um patch montado por
 * variável atravessa. Quem fecha o resto é o `NoteRepositoryFake.update`,
 * copiando campo a campo as chaves daqui em vez de espalhar o patch — o
 * compilador recusa o literal, o fake recusa o resto.
 * → `docs/CONVENCOES-CODIGO.md` §7.1.1.
 */
export type NotePatch = Partial<
  Pick<
    Note,
    | 'title'
    | 'reference'
    | 'doc'
    | 'plainText'
    | 'status'
    | 'archivedAt'
    | 'updatedAt'
  >
>;

/**
 * O mínimo das Tarefas 08, 09 e 10. Sem `delete`: hard delete não está no
 * escopo — a interface cresce com quem a usa.
 */
export interface NoteRepository {
  /** Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03). */
  save(note: Note): Promise<Note>;
  /**
   * A nota por id, **inclusive arquivada**. O repositório não esconde: quem
   * decide o que fazer com uma nota arquivada é o `noteForAuthor`, e ele trata
   * arquivada e inexistente igual DE PROPÓSITO (`NoteNotFoundError`) — uma
   * decisão de domínio que se perderia se a persistência a antecipasse.
   */
  byId(id: string): Promise<Note | null>;
  /**
   * `undefined` no patch é "não mexe"; `null` grava nulo — como no Prisma.
   *
   * O patch é o `NotePatch` acima, e **não** `Partial<Note>`: identidade,
   * tenant, autoria e âncora não se patcheiam.
   */
  update(id: string, patch: NotePatch): Promise<Note>;
  /**
   * A nota do dia daquela pessoa, se existir. Devolve **inclusive arquivada**:
   * o índice `unique(planItemId, userId)` não distingue status, então esconder
   * a arquivada faria o upsert tentar criar uma segunda e bater no índice —
   * a nota do dia viraria um 409 permanente.
   */
  byPlanItemAndUser(planItemId: string, userId: string): Promise<Note | null>;
  /**
   * O acervo filtrado.
   *
   * **Sem promessa de ordem:** quem ordena é o `listNotes`, porque a ordem é
   * regra de produto, não de persistência.
   */
  find(filter: NoteFilter): Promise<Note[]>;
  /**
   * Os pares (dia de leitura, autor) das notas **ACTIVE** de um livro — só as
   * que têm `planItemId`, então avulsa não entra.
   *
   * Método próprio, e não um `find` seguido de `map`, por um motivo de peso: o
   * `doc` é a maior coluna da tabela (ProseMirror JSON), e carregar as ~60 notas
   * de um livro inteiras para calcular uma sobreposição de autoria é trafegar o
   * acervo do clube para desenhar bolinhas na tela. Aqui o Prisma faz `select`
   * de duas colunas.
   *
   * **Sem promessa de ordem**, pelo mesmo motivo do `find`: quem ordena é o
   * `listPlanItemWriters`, e a ordem dele é a do plano de leitura.
   *
   * Não recebe `clubId`: o corte de tenant é o livro, resolvido pelo
   * `bookForActor` antes da chamada — o mesmo desenho do `findByBook` do plano.
   */
  planItemWritersByBook(bookId: string): Promise<PlanItemWriter[]>;
  /**
   * Dos `planItemIds` dados, quais têm **alguma** nota — inclusive arquivada.
   *
   * **Cego a `status` de propósito.** Quem barra a remoção de um dia do plano é
   * a FK (`Note.planItemId` com `onDelete: Restrict`), e a FK não olha
   * `status`: uma nota arquivada ainda aponta para o item. Usar aqui o
   * `planItemWritersByBook` — que filtra `ACTIVE`, e de propósito, porque é
   * sobreposição de tela — faria a guarda do `replacePlanItems` liberar uma
   * remoção que o banco vai recusar, e o admin veria um 500 em vez do 400 que
   * explica o que houve.
   *
   * Devolve **ids de item de plano**, não de nota, e nada sobre autoria: a
   * guarda precisa saber **quantos** dias têm anotação, nunca de quem — o
   * admin não precisa saber quem escreveu para entender que não pode remover o
   * dia.
   *
   * **Sem promessa de ordem** e sem repetição: é um conjunto. Lista vazia na
   * entrada devolve lista vazia, sem ida ao banco.
   *
   * Não recebe `clubId` nem `bookId`: os ids vêm do plano que o
   * `replacePlanItems` acabou de ler do livro já cortado por tenant — o mesmo
   * desenho do `byId` do plano.
   */
  planItemIdsWithAnyNote(planItemIds: readonly string[]): Promise<string[]>;
}
