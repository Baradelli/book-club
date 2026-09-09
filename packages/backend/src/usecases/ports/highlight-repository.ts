import type { HighlightColor } from '@clube/shared';

import type { GeneralStatus } from '../../domain/club';
import type { Highlight } from '../../domain/highlight';

/**
 * O filtro do acervo de grifos. Mesmo formato do `NoteFilter`: o `clubId` é
 * obrigatório porque é o corte de tenant, e todo o resto é opcional.
 *
 * **Tudo é igualdade** — o `NoteFilter` inteiro também é, tirando o `text`. Sem
 * faixa de página (`pageFrom`/`pageTo`): é aditiva e ninguém pediu (decisão C
 * da Tarefa 23).
 *
 * **Sem `text`.** A busca de grifo é a Tarefa 29, e é ela a chamadora — campo de
 * filtro sem chamador é especulação (`docs/WORKFLOW.md`). Ela ainda tem uma
 * pergunta de produto a fechar: se o `text` casa `quote` **ou** `commentText`
 * (a decisão fechada do MVP 2 nomeia só os campos derivados, e uma busca de
 * grifos que ignore o `quote` não acha *a frase que a pessoa grifou*).
 */
export interface HighlightFilter {
  /** OBRIGATÓRIO. É o corte de tenant, sempre em AND com o resto. */
  clubId: string;
  bookId?: string;
  /**
   * O autor. É o "de \<pessoa\>" do filtro de navegação (→ ADR 0002): uma lente
   * sobre o mesmo acervo, **nunca** uma permissão. Dentro do clube não existe
   * grifo privado.
   */
  authorId?: string;
  /**
   * Uma das cinco da paleta fixa de `@clube/shared`, e **igualdade exata**: o
   * valor gravado é o hex minúsculo de 6 dígitos, e há uma grafia só por cor
   * (duas grafias do mesmo amarelo fariam o filtro perder metade dos grifos).
   *
   * Chega **já tipado**, e o UseCase não revalida: quem valida enum de query
   * string é o `z.enum` da borda (Tarefa 24) — é o precedente exato do
   * `kind?: NoteKind` do `NoteFilter`. Duas validações da mesma regra são dois
   * donos, que é como as duas divergem na primeira correção.
   */
  color?: HighlightColor;
  /**
   * A página, igualdade exata.
   *
   * ⚠️ **É a única coluna filtrável NULA** (grifo sem página é caso legítimo —
   * `Highlight.page` é anulável de propósito). No Postgres `WHERE "page" = 45`
   * contra `NULL` é **falso**, então pedir uma página **não** traz o grifo sem
   * página. O fake reproduz isso, e tem teste: fidelidade afirmada em comentário
   * e não em teste é fidelidade que o próximo refactor apaga
   * (`docs/CONVENCOES-CODIGO.md` §7.1).
   *
   * ⚠️ **A INTEGRALIDADE é responsabilidade da BORDA, e o tipo daqui não a
   * expressa.** `number` em TypeScript é ponto flutuante, e a coluna é `Int?`
   * (Tarefa 24). São DUAS divergências fake × Prisma, e elas não se parecem —
   * **as duas medidas na rodada de correção da Tarefa 24**, contra o Postgres
   * do projeto:
   *
   * - **Fração: o Prisma TRUNCA.** `find({ clubId, page: 45.5 })` devolve
   *   **lista vazia** no fake e, no Prisma, chega ao SQL com o parâmetro **`45`**
   *   e devolve **o grifo da página 45** — resultado byte-idêntico ao de
   *   `find({ clubId, page: 45 })`, provado com uma linha de `page = 45` no
   *   banco. Ou seja: **vazio (fake) × os grifos de OUTRA página (Postgres)**.
   *   É resultado errado em silêncio, a direção restritiva do §7.1 — a que fica
   *   verde.
   * - **Fora do int32: o Prisma LANÇA.** `page: 2147483648` dá
   *   `ConversionError` (*"Unable to fit integer value '2147483648' into an
   *   INT4"*), e aí sim `?page=2147483648` viraria **500** onde a suíte unitária
   *   diz "lista vazia".
   *
   * ⚠️ **A versão anterior deste parágrafo dizia que a fração LANÇA, e era
   * falsa** — a afirmação nasceu numa pergunta da auditoria da Tarefa 23, virou
   * docblock aqui e foi copiada para a spec e para a borda da 24 antes de
   * alguém medi-la. Nenhum teste unitário pode acusar nenhuma das duas (o fake
   * não tem coluna tipada), e é justamente por isso que a frase sobreviveu:
   * afirmação sobre o banco escrita em comentário e não medida é a mesma classe
   * do §7.1.
   *
   * Quem fecha as duas pontas é o `z.coerce.number().int().min(1).max(2147483647)`
   * do schema de query — o `.int()` para a fração, o `.max()` para o int32 —, e
   * não um `Number.isInteger` aqui, que criaria **dois donos** da mesma regra (o
   * mesmo argumento da decisão D sobre a `color`). ⚠️ Quem for escrever a busca
   * de grifo (Tarefa 29) e reusar este filtro: a guarda da borda é obrigatória,
   * e o motivo é o truncamento — **não** um erro que o banco levantaria.
   */
  page?: number;
  /** Ausente = os dois status. */
  status?: GeneralStatus;
}

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
 * O mínimo das Tarefas 22 e 23 — quatro métodos, e a interface cresce com quem
 * a usa.
 *
 * O `find` chegou **junto** do `listHighlights` que o usa (Tarefa 23), porque foi
 * assim que o `NoteFilter` da Tarefa 10 nasceu bem: método de port sem chamador
 * é especulação (`docs/WORKFLOW.md`).
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
  /**
   * O acervo filtrado.
   *
   * **Sem promessa de ordem:** quem ordena é o `listHighlights`, porque a ordem
   * é regra de produto, não de persistência. O fake enumera INVERTIDO de
   * propósito, para ninguém depender dela (§7.2).
   *
   * **Sem paginação** (decisão F da Tarefa 23): o teto é **válvula** no
   * repositório Prisma da Tarefa 24, como o `take: 500` que a Tarefa 11 mediu e
   * adotou na nota — não paginação. A primeira tela que paginar troca por cursor.
   *
   * ⚠️ **A VÁLVULA NÃO É DECIDÍVEL NO UNITÁRIO, e é por isso que este parágrafo
   * existe** (§7.10: afirmação de indecidibilidade vem com onde a propriedade
   * **É** provada). O fake não tem teto de linhas, então nenhum mutante da suíte
   * unitária pode acusar `take` ausente, `take` **sem** `orderBy` ao lado, nem
   * `orderBy` sem o desempate por `id`. As três propriedades se provam no
   * **teste de contrato** do `PrismaHighlightRepository` (Tarefa 24), contra o
   * banco:
   *
   * - o `orderBy` é **obrigatório junto do `take`**, porque um `take` sem ordem
   *   total corta um conjunto que o Postgres devolve em qualquer ordem (plano de
   *   execução, `VACUUM`) — o corte sairia não-determinístico, e a "válvula"
   *   esconderia linhas diferentes a cada request. O `PrismaNoteRepository` já
   *   documenta exatamente isso.
   * - o desempate por `id` no `orderBy` do SQL é o que faz a fronteira do `take`
   *   ser estável quando dois grifos empatam em `createdAt` — o mesmo empate que
   *   o `listHighlights` desempata em memória.
   *
   * O `sort` do UseCase **não** substitui o `orderBy`: ele ordena o que chegou,
   * e o que chegou é decidido pelo corte do banco.
   */
  find(filter: HighlightFilter): Promise<Highlight[]>;
}
