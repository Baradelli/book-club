import type { Note as PrismaNote, Prisma, PrismaClient } from '@prisma/client';

import type { Note, PlanItemWriter } from '../domain/note';
import { assertNoteDoc } from '../domain/note';
import type {
  NoteFilter,
  NotePatch,
  NoteRepository,
} from '../usecases/ports/note-repository';
import { toLikePattern } from './like-pattern';

/**
 * Teto de linhas do `find`. **Válvula de segurança, não paginação.**
 *
 * A Tarefa 10 mediu ~6,8 KiB de heap por nota carregada (o `doc` é a maior
 * coluna da tabela), o que põe a quebra na ordem de 10 mil notas por clube —
 * alcançável por um clube antigo, e sem nada na tela que anuncie o corte.
 *
 * O `orderBy` ao lado é OBRIGATÓRIO: `take` sem ordem definida corta um
 * conjunto que o Postgres pode devolver em qualquer ordem (depende do plano de
 * execução e de `VACUUM`), então duas chamadas iguais poderiam trazer notas
 * diferentes. Com `createdAt desc` o corte é "as 500 mais recentes".
 *
 * E o `id` como SEGUNDO critério não é decoração: `createdAt desc` sozinho não
 * é ordem total, e empate no mesmo milissegundo é o caso normal (duas pessoas
 * do clube salvando ao mesmo tempo, dois dispositivos da mesma pessoa, a
 * corrida do `save`). Sem desempate, quem cai dentro das 500 na fronteira é
 * escolhido pelo plano de execução, e a reordenação determinística do
 * `listNotes` (`createdAt desc`, depois `id asc`) ESCONDERIA a instabilidade
 * em vez de denunciá-la. A ordem daqui é a mesma dele de propósito: o corte e a
 * tela concordam sobre quem são "as 500 mais recentes".
 *
 * A primeira tela que paginar de verdade (MVP 2) troca isto por cursor.
 */
const FIND_ROW_LIMIT = 500;

function toDomain(record: PrismaNote): Note {
  return {
    id: record.id,
    clubId: record.clubId,
    bookId: record.bookId,
    userId: record.userId,
    kind: record.kind,
    planItemId: record.planItemId,
    title: record.title,
    reference: record.reference,
    // O Prisma devolve `Prisma.JsonValue` e o domínio quer `NoteDoc`. O assert
    // é o único jeito de estreitar sem cast (que o `CLAUDE.md` proíbe), e é o
    // comportamento certo: um `doc` corrompido no banco não é um `null` para
    // tratar adiante — é erro de verdade, e tem de aparecer na leitura, não
    // três camadas depois no `docToText`.
    doc: assertNoteDoc(record.doc),
    plainText: record.plainText,
    status: record.status,
    archivedAt: record.archivedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * O `doc` como o Prisma aceita receber uma coluna `Json`.
 *
 * `NoteDoc` tem index signature de `unknown` — de propósito: o domínio não
 * interpreta o que o editor põe em `attrs`/`marks`, só atravessa (ADR 0001). E
 * `unknown` não é assinável a `Prisma.InputJsonValue`, que é uma união
 * recursiva fechada.
 *
 * `{ toJSON(): unknown }` é um dos membros dessa união — a porta que o próprio
 * tipo do Prisma abre para valores que sabem se serializar. Então o `doc`
 * atravessa **sem cast e sem cópia**, e o que é gravado é o mesmo objeto que o
 * domínio deu, com os `attrs` de qualquer extensão futura intactos. É o
 * round-trip lossless que o ADR 0001 escolheu, e a regra 1 do contrato o prova
 * contra o Postgres.
 */
function toInputJson(doc: Note['doc']): Prisma.InputJsonValue {
  return { toJSON: () => doc };
}

/**
 * Os campos que uma escrita completa (`save`) grava, **sem `id` e sem
 * `createdAt`** — é exatamente o `update` do upsert.
 *
 * Os dois campos de fora são os dois que pertencem à linha que JÁ existe, não
 * à chamada que chega:
 *
 * - **`id`**: na corrida de dois autosaves da nota do dia, o segundo `execute`
 *   chega com um `id` que a linha gravada não tem — escrevê-lo trocaria a
 *   chave primária de uma nota existente, e toda FK que apontasse para ela
 *   ficaria pendurada.
 * - **`createdAt`**: pelo mesmo motivo, um passo adiante. Os dois `execute`
 *   leem `null` no `byPlanItemAndUser` e cada um constrói a nota com o SEU
 *   `now`; o `UPDATE` do segundo reescreveria o nascimento do primeiro, e a
 *   nota que corre pularia para o topo do `listNotes` (que ordena por
 *   `createdAt desc`) enquanto a que não corre, não. `last-write-wins` é a
 *   política declarada do CONTEÚDO; do `createdAt` nunca foi.
 */
function toUpsertUpdateData(note: Note) {
  return {
    clubId: note.clubId,
    bookId: note.bookId,
    userId: note.userId,
    kind: note.kind,
    planItemId: note.planItemId,
    title: note.title,
    reference: note.reference,
    doc: toInputJson(note.doc),
    plainText: note.plainText,
    status: note.status,
    archivedAt: note.archivedAt,
    updatedAt: note.updatedAt,
  };
}

/**
 * Só os campos presentes no patch vão para o `data` — `undefined` é ausência,
 * `null` é valor. Mesma semântica do `PrismaBookRepository`.
 *
 * **Não há allowlist aqui.** O que pode ser patcheado é o `NotePatch` do port,
 * e ele já não tem `id` (trocaria a chave primária de verdade no Postgres),
 * `clubId`/`bookId` (mover conteúdo entre tenants), `userId` (trocar a
 * autoria), `kind`/`planItemId` (reancorar a nota em outro dia) nem
 * `createdAt`. Uma allowlist aqui contra um `Partial<Note>` no port foi
 * exatamente a divergência que o ADR 0007 descreve: o fake obedecia ao patch
 * proibido e este arquivo o ignorava em silêncio.
 * → `docs/CONVENCOES-CODIGO.md` §7.1.
 *
 * E `updatedAt` está no `NotePatch`, porque o dono deste instante é o domínio:
 * o schema nasceu sem `@updatedAt`. → ADR 0008.
 */
function toUpdateData(patch: NotePatch): Prisma.NoteUpdateInput {
  const data: Prisma.NoteUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.reference !== undefined) data.reference = patch.reference;
  if (patch.doc !== undefined) data.doc = toInputJson(patch.doc);
  if (patch.plainText !== undefined) data.plainText = patch.plainText;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.archivedAt !== undefined) data.archivedAt = patch.archivedAt;
  if (patch.updatedAt !== undefined) data.updatedAt = patch.updatedAt;
  return data;
}

export class PrismaNoteRepository implements NoteRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * Upsert, e o ALVO depende do tipo da nota.
   *
   * **`PLAN`: upsert em `(planItemId, userId)`**, não em `id`. Dois autosaves
   * sobrepostos da mesma pessoa no mesmo dia leem `null` no
   * `byPlanItemAndUser` e **ambos** tentam criar; com upsert por `id` isso é
   * um `P2002`, que a borda relança como **500** — e o editor autossalva e a
   * fila offline reenvia, então a corrida é real, não hipotética. Com o alvo
   * no índice composto, o segundo vira UPDATE da linha do primeiro: o `id`
   * gerado pelo segundo `execute` é descartado, e como o `save` devolve a
   * linha do banco, o UseCase devolve o id certo.
   *
   * **`FREE`: upsert em `id`.** O índice composto não aceita `null`, e é
   * justamente o `null` que faz a anotação avulsa ser ilimitada.
   */
  async save(note: Note): Promise<Note> {
    const update = toUpsertUpdateData(note);
    const planItemId = note.planItemId;

    const record = await this.prisma.note.upsert({
      where:
        planItemId === null
          ? { id: note.id }
          : { planItemId_userId: { planItemId, userId: note.userId } },
      // Só o CREATE leva identidade e nascimento — os dois campos que são da
      // linha, não da chamada. → `toUpsertUpdateData`.
      create: { id: note.id, createdAt: note.createdAt, ...update },
      update,
    });
    return toDomain(record);
  }

  /** Inclusive arquivada — o port é explícito, e o `noteForAuthor` depende. */
  async byId(id: string): Promise<Note | null> {
    const record = await this.prisma.note.findUnique({ where: { id } });
    return record ? toDomain(record) : null;
  }

  async update(id: string, patch: NotePatch): Promise<Note> {
    const record = await this.prisma.note.update({
      where: { id },
      data: toUpdateData(patch),
    });
    return toDomain(record);
  }

  /** Inclusive arquivada: o índice único não olha `status`. → o port. */
  async byPlanItemAndUser(
    planItemId: string,
    userId: string,
  ): Promise<Note | null> {
    const record = await this.prisma.note.findUnique({
      where: { planItemId_userId: { planItemId, userId } },
    });
    return record ? toDomain(record) : null;
  }

  /**
   * O acervo filtrado. Cada filtro em AND com o `clubId`, que nunca é
   * opcional — é o corte de tenant.
   *
   * `status` ausente devolve OS DOIS, como no `BookFilter`: a regra de produto
   * ("só os ACTIVE") vive no `listNotes`.
   */
  async find(filter: NoteFilter): Promise<Note[]> {
    const records = await this.prisma.note.findMany({
      where: {
        clubId: filter.clubId,
        bookId: filter.bookId,
        // `authorId` no filtro é a coluna `userId`: o vocabulário do port fala
        // de AUTORIA, o do banco fala de dono da linha.
        userId: filter.authorId,
        kind: filter.kind,
        planItemId: filter.planItemId,
        status: filter.status,
        ...(filter.text === undefined
          ? {}
          : {
              plainText: {
                contains: toLikePattern(filter.text),
                /*
                  É isto que faz `ILIKE` em vez de `LIKE`. **Acento continua
                  significativo**, e é DECISÃO, não pendência: a decisão fechada
                  do MVP 2 diz `ILIKE`, e `ILIKE` é accent-sensitive
                  (`'coração' ILIKE '%coracao%'` é falso). O teste de contrato
                  `matches case but not accent` a pina desde a Tarefa 11, e o
                  fake a reproduz de propósito
                  (`usecases/_fakes/sql-equality.ts`).

                  Ligar a extensão `unaccent` (DDL no banco + índice funcional +
                  ADR) é **fatia própria**, e está registrado como pergunta do
                  dono na spec da Tarefa 29. Não "conserte" aqui.
                */
                mode: 'insensitive',
              },
            }),
      },
      // Válvula de segurança, e o `orderBy` é obrigatório junto dela — TOTAL,
      // com o `id` desempatando, que é a mesma ordem do `listNotes`.
      // → FIND_ROW_LIMIT.
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: FIND_ROW_LIMIT,
    });
    return records.map(toDomain);
  }

  /**
   * Os pares (dia de leitura, autor) das notas ACTIVE do livro.
   *
   * `select` de duas colunas, e é a razão de o método existir: carregar as ~60
   * notas de um livro inteiras — com o `doc`, a maior coluna da tabela — para
   * desenhar bolinhas de autoria na tela é trafegar o acervo do clube.
   */
  async planItemWritersByBook(bookId: string): Promise<PlanItemWriter[]> {
    const rows = await this.prisma.note.findMany({
      where: { bookId, status: 'ACTIVE', planItemId: { not: null } },
      select: { planItemId: true, userId: true },
    });

    // `flatMap` e não `map`: é o que deixa o `planItemId` estreitar de
    // `string | null` para `string` sem um `??` de fallback — e fallback em
    // campo de identidade é como um id errado entra numa resposta calada. O
    // `WHERE ... IS NOT NULL` acima já garante que nenhuma linha é descartada
    // aqui; o tipo é que não sabe disso.
    return rows.flatMap(({ planItemId, userId }) =>
      planItemId === null ? [] : [{ planItemId, userId }],
    );
  }

  /**
   * Dos ids dados, quais têm alguma nota — **inclusive arquivada**.
   *
   * Sem cláusula de `status`: quem barra a remoção de um dia do plano é a FK
   * (`onDelete: Restrict`), e a FK não olha `status`. → o port.
   *
   * **Sem `take`**, de propósito, e é o oposto da decisão do `find`: um corte
   * aqui faria a guarda **perder** um dia com anotação e liberar uma remoção
   * que a FK depois recusa — a válvula de segurança viraria a falha. As linhas
   * são `(planItemId)` de um conjunto de dias que o admin acabou de mandar, e
   * o `select` de uma coluna as torna baratas.
   *
   * A deduplicação é em memória e é CONTRATO, não otimização: dois autores no
   * mesmo dia dão UM id, senão a mensagem da guarda diria "2 dias" para um dia
   * só. (`distinct` do Prisma também é aplicado no cliente, então não pouparia
   * tráfego.)
   */
  async planItemIdsWithAnyNote(
    planItemIds: readonly string[],
  ): Promise<string[]> {
    // O port promete "lista vazia não vai ao banco". Sem isto seria um
    // `IN ()`, uma ida ao banco garantidamente vazia em toda troca de plano
    // que não remove nada — que é o caso comum.
    if (planItemIds.length === 0) return [];

    const rows = await this.prisma.note.findMany({
      where: { planItemId: { in: [...planItemIds] } },
      select: { planItemId: true },
    });

    const found = new Set<string>();
    for (const { planItemId } of rows) {
      // O `IN (...)` já exclui a coluna nula (a anotação avulsa): `NULL` não é
      // igual a nada. O tipo é que não sabe disso.
      if (planItemId !== null) found.add(planItemId);
    }
    return [...found];
  }
}
