import type { Note, NoteKind } from '../domain/note';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import type { NoteRepository } from './ports/note-repository';

export interface ListNotesInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listBooks`. */
  clubId: string;
  bookId?: string;
  /** O autor. É o "de \<pessoa\>" do filtro. */
  authorId?: string;
  kind?: NoteKind;
  planItemId?: string;
  /** Busca `ILIKE` no `plainText`. Vazio ou só espaços = não filtra. */
  text?: string;
}

export type ListNotesOutput = Note[];

/**
 * O acervo do clube, como o clube escolhe olhar.
 *
 * **Não** exige papel: `Tudo · Minhas · de X` é **navegação, não permissão** —
 * toda anotação de um clube é visível para todo membro ativo dele desde o
 * instante em que é salva. → ADR 0002. Nada aqui é, nem deve ser nomeado como,
 * privacidade: o `authorId` é uma lente sobre o mesmo acervo.
 *
 * Aqui o clube vem do input porque não há recurso de onde tirá-lo — o mesmo
 * caso do `listBooks` —, e é o `assertMembership` que faz o corte: clube em que
 * o ator não é membro ativo é 404, exista ele ou não.
 */
export class ListNotes {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: ListNotesInput): Promise<ListNotesOutput> {
    // ANTES da consulta, sempre: um ator de fora não pode gerar nem uma
    // leitura — senão a rota vira oráculo de existência (e conta de banco) para
    // quem não é do clube.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    // O MESMO `optionalText` do livro e do item do plano: `''`/espaços viram
    // `null`, o resto vem sem as pontas. A normalização é daqui e não do
    // repositório — mandar `'   '` adiante filtraria por três espaços, e um
    // campo de busca em que apertar espaço esconde o acervo é pior que nenhum.
    const text = optionalText(input.text);

    const found = await this.notes.find({
      // Primeiro e não-negociável: o corte de tenant. Todo o resto entra em AND
      // com ele, e nenhum filtro o substitui.
      clubId: input.clubId,
      ...(input.bookId === undefined ? {} : { bookId: input.bookId }),
      ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.planItemId === undefined
        ? {}
        : { planItemId: input.planItemId }),
      ...(text === null ? {} : { text }),
      // Arquivada é invisível: não há tela de arquivadas no MVP 1, e não há
      // flag para pedi-las (decisão C da spec — flag sem chamador é
      // especulação). O corte é do REPOSITÓRIO de propósito: filtrar depois
      // seria carregar o acervo inteiro para descartar parte dele.
      status: 'ACTIVE' as const,
    });

    // Copia antes de ordenar: o array é do repositório, e mutá-lo é smell de
    // fronteira — vira hábito e um dia o repositório o guarda em cache.
    return [...found].sort(compareByCreatedAtDesc);
  }
}

/**
 * A anotação mais recente primeiro.
 *
 * `createdAt` e não `updatedAt`: a nota do dia é reescrita a cada autosave, e
 * por `updatedAt` a lista pularia embaixo do dedo de quem está digitando.
 *
 * O desempate por `id` existe para a ordem ser DETERMINÍSTICA: duas pessoas
 * salvando no mesmo instante é o caso normal de um clube, e sem ele a ordem
 * sairia como o repositório enumerou — que é diferente entre o fake e o Prisma.
 */
function compareByCreatedAtDesc(a: Note, b: Note): number {
  const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
