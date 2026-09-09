import type { Highlight } from '../../domain/highlight';

/**
 * O que o `update` de grifo honra. **NÃO é `Partial<Highlight>`, de propósito.**
 *
 * O `HighlightPatch` já nasce estreito porque o CONVENCOES-CODIGO §7.1.1 manda,
 * citando esta fatia pelo nome ("quem escrever o port de `Highlight` (Tarefa 22)
 * já nasce com o tipo estreito"). A quinta aparição da classe de bug do ADR
 * 0007 saiu justamente de um `Partial<Note>` no port: ele **promete o que o
 * repositório Prisma não cumpre**, porque inclui identidade (`id`), tenant
 * (`clubId`/`bookId`) e autoria (`userId`) — campos que nenhum UseCase patcheia
 * e que o `toUpdateData` filtrava calado, enquanto o fake obedecia. Então
 * `update(id, { userId: 'x' })` trocava a autoria no fake e era **no-op
 * silencioso no Postgres**: todo teste de autoria escrito contra o fake
 * afirmaria uma regra que o banco não tem.
 *
 * A lista é a dos PERMITIDOS (um `Pick`), e não a dos proibidos, porque a lista
 * de permitidos não envelhece: um campo novo na entidade nasce fora do patch.
 *
 * `status` e `archivedAt` **estão** aqui — é por eles que o `archiveHighlight`
 * escreve, exatamente como o `NotePatch` os tem para o `archiveNote`. Quem os
 * mantém fora do alcance do `editHighlight` é o **input** daquele UseCase, que
 * não os declara e monta o patch campo por campo: não existe segundo caminho
 * para arquivar, nem nenhum para DESARQUIVAR (que é MVP 4).
 *
 * `createdAt` fica fora — nada reescreve quando o grifo nasceu — e `updatedAt`
 * entra, porque o domínio é o dono dele (ADR 0008: sem `@updatedAt` no schema).
 *
 * ⚠️ O tipo estreito **não fecha o buraco sozinho**: a checagem de propriedade
 * em excesso do TypeScript só vale para literal FRESCO, e um patch montado por
 * variável atravessa. Quem fecha o resto é o `HighlightRepositoryFake.update`,
 * copiando campo a campo as chaves daqui em vez de espalhar o patch — o
 * compilador recusa o literal, o fake recusa o resto.
 */
export type HighlightPatch = Partial<
  Pick<
    Highlight,
    | 'quote'
    | 'color'
    | 'page'
    | 'reference'
    | 'commentDoc'
    | 'commentText'
    | 'status'
    | 'archivedAt'
    | 'updatedAt'
  >
>;

/**
 * O mínimo da Tarefa 22 — três métodos, e a interface cresce com quem a usa.
 *
 * **Sem `find`**: o acervo filtrado é a Tarefa 23, junto do `listHighlights` que
 * o usa, porque foi assim que o `NoteFilter` da Tarefa 10 nasceu bem. Método de
 * port sem chamador é especulação (`docs/WORKFLOW.md`).
 *
 * **Sem `delete`**: hard delete não está no escopo. Arquivar é tirar da vista, e
 * o acervo do clube continua íntegro, com autoria (ADR 0002).
 */
export interface HighlightRepository {
  /** Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03). */
  save(highlight: Highlight): Promise<Highlight>;
  /**
   * O grifo por id, **inclusive arquivado**. O repositório não esconde: quem
   * decide o que fazer com um grifo arquivado é o `highlightForAuthor`, e ele
   * trata arquivado e inexistente igual DE PROPÓSITO
   * (`HighlightNotFoundError`) — uma decisão de domínio que se perderia se a
   * persistência a antecipasse.
   */
  byId(id: string): Promise<Highlight | null>;
  /**
   * `undefined` no patch é "não mexe"; `null` grava nulo — como no Prisma.
   *
   * O patch é o `HighlightPatch` acima, e **não** `Partial<Highlight>`:
   * identidade, tenant, autoria e nascimento não se patcheiam.
   */
  update(id: string, patch: HighlightPatch): Promise<Highlight>;
}
