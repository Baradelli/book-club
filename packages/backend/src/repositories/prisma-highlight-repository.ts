import type {
  Highlight as PrismaHighlight,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { Prisma as PrismaNamespace } from '@prisma/client';

import type { Highlight } from '../domain/highlight';
import { assertHighlightColor } from '../domain/highlight';
import { assertNoteDoc } from '../domain/note';
import type {
  HighlightFilter,
  HighlightPatch,
  HighlightRepository,
} from '../usecases/ports/highlight-repository';
import { toLikePattern } from './like-pattern';

/**
 * Teto de linhas do `find`. **Válvula de segurança, não paginação.**
 *
 * **O mesmo 500 da nota, e é de propósito.** A Tarefa 23 mediu ~1,4 KiB de heap
 * por grifo (contra ~6,8 KiB por nota, que carrega o `doc` inteiro), então com o
 * mesmo orçamento de heap o grifo caberia em ~1.200 linhas — mas 500 já é muito
 * mais do que qualquer tela mostra, e **um número só entre os repositórios é uma
 * coisa a menos para raciocinar**. ⚠️ E o teto **não** sai da razão grifo/nota:
 * ela varia com o fixture (2,43× a 3,30×, medido por dois harnesses na Tarefa
 * 23) e não sustenta peso.
 *
 * O `orderBy` ao lado é OBRIGATÓRIO: `take` sem ordem definida corta um conjunto
 * que o Postgres pode devolver em qualquer ordem (depende do plano de execução e
 * de `VACUUM`), então duas chamadas iguais poderiam trazer grifos diferentes.
 * Com `createdAt desc` o corte é "os 500 mais recentes".
 *
 * E o `id` como SEGUNDO critério não é decoração: `createdAt desc` sozinho não é
 * ordem total, e empate no mesmo milissegundo é o caso normal (duas pessoas do
 * clube grifando ao mesmo tempo, dois dispositivos da mesma pessoa). Sem
 * desempate, quem cai dentro dos 500 na fronteira é escolhido pelo plano de
 * execução, e a reordenação determinística do `listHighlights` (`createdAt
 * desc`, depois `id asc`) ESCONDERIA a instabilidade em vez de denunciá-la. A
 * ordem daqui é a mesma dele de propósito.
 *
 * ⚠️ **O `sort` do `listHighlights` NÃO substitui este `orderBy`:** ele ordena o
 * que chegou, e o que chegou é decidido pelo corte do banco.
 *
 * ⚠️ **Nada disto é decidível na suíte unitária** — o fake não tem teto de
 * linhas, então nenhum mutante unitário acusa `take` ausente, `take` sem
 * `orderBy`, ou `orderBy` sem o desempate (§7.10). As três se provam no teste de
 * contrato (`cuts the result at the row limit, keeping the newest`,
 * `returns the newest first...`, `breaks a createdAt tie by id...`).
 *
 * A primeira tela que paginar de verdade troca isto por cursor.
 */
const FIND_ROW_LIMIT = 500;

/**
 * O `commentDoc` como o Prisma aceita **receber** uma coluna `Json?`.
 *
 * ⚠️ **`null` literal é ERRO DE COMPILAÇÃO aqui.** Numa coluna `Json?` o tipo de
 * entrada do Prisma é `DbNull | JsonNull | InputJsonValue`, e as duas primeiras
 * gravam coisas DIFERENTES: `Prisma.JsonNull` grava o JSON `'null'` (uma linha
 * com valor, que `IS NULL` não acha), `Prisma.DbNull` grava SQL `NULL`. O
 * domínio quer **ausência**, então é `DbNull` — e o teste de contrato prova as
 * duas metades: a coluna é SQL `NULL`, e o domínio recebe `null` de volta (não a
 * string `"null"`, não um sentinela, não um objeto). Errar aqui faria o
 * `toDomain` devolver um valor onde a tela da Tarefa 25 espera `null` para
 * decidir se mostra o comentário.
 *
 * O `{ toJSON(): unknown }` do caminho não-nulo é o mesmo truque do
 * `PrismaNoteRepository`: `NoteDoc` tem index signature de `unknown` (o domínio
 * não interpreta `attrs`/`marks`, só atravessa — ADR 0001) e `unknown` não é
 * assinável a `Prisma.InputJsonValue`, que é uma união recursiva fechada.
 * `{ toJSON(): unknown }` é um dos membros dessa união — a porta que o próprio
 * tipo do Prisma abre —, então o comentário atravessa **sem cast e sem cópia**,
 * com os `attrs` de qualquer extensão futura intactos.
 */
function toCommentInput(
  commentDoc: Highlight['commentDoc'],
): Prisma.InputJsonValue | Prisma.NullTypes.DbNull {
  if (commentDoc === null) return PrismaNamespace.DbNull;
  return { toJSON: () => commentDoc };
}

function toDomain(record: PrismaHighlight): Highlight {
  return {
    id: record.id,
    clubId: record.clubId,
    bookId: record.bookId,
    userId: record.userId,
    quote: record.quote,
    // A coluna é `String` (o `CLAUDE.md` lista `Highlight.color` entre os campos
    // validados por `z.enum`, porque paleta configurável por clube é o futuro
    // registrado) e o domínio quer `HighlightColor`. O assert é o único jeito de
    // estreitar sem cast (que o `CLAUDE.md` proíbe), e é o comportamento certo:
    // uma cor de fora da paleta no banco é erro de verdade, e tem de aparecer na
    // leitura — não na tela, pintando um grifo transparente.
    color: assertHighlightColor(record.color),
    page: record.page,
    reference: record.reference,
    // ⚠️ O desvio do `null` vem ANTES do assert, e é o caso mais comum de todos:
    // grifo sem comentário é legítimo (decisão C da Tarefa 22). Sem ele o
    // `assertNoteDoc` estouraria em todo grifo sem comentário. E com o
    // comentário PRESENTE o assert é o que faz um `commentDoc` corrompido no
    // banco estourar na LEITURA, não três camadas depois dentro do `docToText`.
    commentDoc:
      record.commentDoc === null ? null : assertNoteDoc(record.commentDoc),
    commentText: record.commentText,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Os campos que uma escrita completa (`save`) grava, **sem `id` e sem
 * `createdAt`** — é exatamente o `update` do upsert.
 *
 * Os dois de fora pertencem à linha que JÁ existe, não à chamada que chega:
 * escrever o `id` trocaria a chave primária, e escrever o `createdAt`
 * reescreveria o nascimento — e o grifo pularia para o topo do `listHighlights`,
 * que ordena por `createdAt desc`. É o precedente do `PrismaNoteRepository`.
 *
 * (No grifo o upsert é sempre por `id` e não há chave natural nenhuma — o grifo
 * é ILIMITADO, a tabela não tem `@@unique` —, então na prática este ramo de
 * UPDATE só é alcançado por um `save` do mesmo `id`. Continua sendo o desenho
 * certo: o dia em que a fila offline reenviar um grifo, o reenvio é UPDATE em
 * vez de segundo grifo.)
 */
function toUpsertUpdateData(highlight: Highlight) {
  return {
    clubId: highlight.clubId,
    bookId: highlight.bookId,
    userId: highlight.userId,
    quote: highlight.quote,
    color: highlight.color,
    page: highlight.page,
    reference: highlight.reference,
    commentDoc: toCommentInput(highlight.commentDoc),
    commentText: highlight.commentText,
    status: highlight.status,
    archivedAt: highlight.archivedAt,
    updatedAt: highlight.updatedAt,
  };
}

/**
 * Só os campos presentes no patch vão para o `data` — `undefined` é ausência,
 * `null` é valor. Mesma semântica do `PrismaNoteRepository`.
 *
 * **Não há allowlist aqui, e é o dividendo do tipo estreito.** O que pode ser
 * patcheado é o `HighlightPatch` do port, e ele já não tem `id` (trocaria a
 * chave primária de verdade no Postgres), `clubId`/`bookId` (mover conteúdo
 * entre tenants), `userId` (trocar a autoria) nem `createdAt`. Uma allowlist
 * aqui contra um `Partial<Highlight>` no port foi exatamente a divergência que o
 * ADR 0007 descreve, e que o §7.1.1 resolveu estreitando o tipo: o fake obedecia
 * ao patch proibido e o repositório o ignorava em silêncio.
 *
 * As NOVE chaves são mapeadas uma a uma, e é a mesma disciplina do
 * `HighlightRepositoryFake.update`: o compilador recusa o literal proibido, e a
 * cópia campo a campo recusa o resto (um patch montado por variável atravessa a
 * checagem de propriedade em excesso do TypeScript).
 *
 * E `updatedAt` está no patch porque o dono deste instante é o domínio: o schema
 * nasceu **sem** `@updatedAt`. → ADR 0008.
 */
function toUpdateData(patch: HighlightPatch): Prisma.HighlightUpdateInput {
  const data: Prisma.HighlightUpdateInput = {};
  if (patch.quote !== undefined) data.quote = patch.quote;
  if (patch.color !== undefined) data.color = patch.color;
  if (patch.page !== undefined) data.page = patch.page;
  if (patch.reference !== undefined) data.reference = patch.reference;
  if (patch.commentDoc !== undefined) {
    data.commentDoc = toCommentInput(patch.commentDoc);
  }
  if (patch.commentText !== undefined) data.commentText = patch.commentText;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.archivedAt !== undefined) data.archivedAt = patch.archivedAt;
  if (patch.updatedAt !== undefined) data.updatedAt = patch.updatedAt;
  return data;
}

export class PrismaHighlightRepository implements HighlightRepository {
  constructor(private prisma: PrismaClient) {}

  /** Upsert por `id` — a convenção dos outros repositórios. */
  async save(highlight: Highlight): Promise<Highlight> {
    const update = toUpsertUpdateData(highlight);

    const record = await this.prisma.highlight.upsert({
      where: { id: highlight.id },
      // Só o CREATE leva identidade e nascimento — os dois campos que são da
      // linha, não da chamada. → `toUpsertUpdateData`.
      create: { id: highlight.id, createdAt: highlight.createdAt, ...update },
      update,
    });
    return toDomain(record);
  }

  /** Inclusive arquivado — o port é explícito, e o `highlightForAuthor` depende. */
  async byId(id: string): Promise<Highlight | null> {
    const record = await this.prisma.highlight.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async update(id: string, patch: HighlightPatch): Promise<Highlight> {
    const record = await this.prisma.highlight.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }

  /**
   * O acervo filtrado. Cada filtro em AND com o `clubId`, que nunca é opcional —
   * é o corte de tenant.
   *
   * `status` ausente devolve OS DOIS, como no `NoteFilter`: a regra de produto
   * ("só os ACTIVE") vive no `listHighlights`.
   *
   * ⚠️ **Todo filtro é igualdade menos o `text`, e é o que faz a coluna nula
   * ficar de fora.** No Postgres `WHERE "page" = 45` contra `NULL` é **falso**,
   * então pedir uma página não traz o grifo sem página — a fidelidade do §7.1
   * que o fake reproduz, e que só aqui é decidível contra o banco.
   */
  async find(filter: HighlightFilter): Promise<Highlight[]> {
    const records = await this.prisma.highlight.findMany({
      where: {
        clubId: filter.clubId,
        bookId: filter.bookId,
        // `authorId` no filtro é a coluna `userId`: o vocabulário do port fala
        // de AUTORIA, o do banco fala de dono da linha.
        userId: filter.authorId,
        // Igualdade byte-sensível de texto, e é por isso que a borda não
        // normaliza caixa: `#FACC15` não casaria `#facc15`, e o filtro por cor
        // perderia metade dos grifos.
        color: filter.color,
        page: filter.page,
        status: filter.status,
        ...(filter.text === undefined
          ? {}
          : {
              /*
                ⚠️ **A BUSCA (Tarefa 29) — `quote` OU `commentText`, e o `OR`
                continua em AND com tudo acima.** No Prisma as chaves de
                primeiro nível do `where` são AND entre si, e o `OR` é UM grupo:
                `clubId AND … AND (quote ILIKE … OR commentText ILIKE …)`. Um
                `OR` que subisse para o topo levaria o corte de tenant embora.

                **Duas colunas e não uma** (decisão A): o `quote` é o conteúdo
                do grifo (ADR 0004, "o trecho grifado") e uma busca que o
                ignorasse não acharia a frase que a pessoa grifou. Registrado
                como pergunta do dono; se ele discordar, é uma cláusula a
                remover.

                O `toLikePattern` é o escape de `%`/`_`/`\` —
                `./like-pattern.ts`, **uma** função para os dois repositórios
                (decisão B; a saída medida da Tarefa 23 para o caso gêmeo foi
                extrair, não copiar).

                `mode: 'insensitive'` é o que faz `ILIKE` em vez de `LIKE`.
                ⚠️ **Acento continua significativo, e é DECISÃO**: a decisão
                fechada do MVP 2 diz `ILIKE`, e `ILIKE` é accent-sensitive. O
                teste de contrato `matches case but not accent in the quote and
                in the comment` a pina contra o banco. `unaccent` é fatia
                própria e está registrado como pergunta do dono.
              */
              OR: [
                {
                  quote: {
                    contains: toLikePattern(filter.text),
                    mode: 'insensitive' as const,
                  },
                },
                {
                  commentText: {
                    contains: toLikePattern(filter.text),
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }),
      },
      // Válvula de segurança, e o `orderBy` é obrigatório junto dela — TOTAL,
      // com o `id` desempatando, que é a mesma ordem do `listHighlights`.
      // → FIND_ROW_LIMIT.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: FIND_ROW_LIMIT,
    });
    return records.map(toDomain);
  }
}
