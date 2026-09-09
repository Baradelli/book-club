import type { HighlightColor } from '@clube/shared';

import type { Highlight } from '../domain/highlight';
import type { AssertMembership } from './assert-membership';
import type { HighlightRepository } from './ports/highlight-repository';

export interface ListHighlightsInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listNotes` e no `listBooks`. */
  clubId: string;
  bookId?: string;
  /** O autor. É o "de \<pessoa\>" do filtro. */
  authorId?: string;
  /**
   * Uma das cinco da paleta fixa de `@clube/shared`.
   *
   * Chega **já tipada**, e não é revalidada aqui (decisão D): quem valida enum
   * de query string é o `z.enum` da borda (Tarefa 24) — o precedente exato do
   * `kind?: NoteKind` do `listNotes`. Revalidar aqui criaria **dois donos** da
   * mesma regra, que é como as duas divergem na primeira correção.
   */
  color?: HighlightColor;
  /**
   * A página, **igualdade exata** (decisão C). Faixa (`pageFrom`/`pageTo`) é
   * aditiva e ninguém pediu.
   */
  page?: number;
}

export type ListHighlightsOutput = Highlight[];

/**
 * O acervo de grifos do clube, como o clube escolhe olhar: por livro, por
 * pessoa, por cor, por página.
 *
 * **Não** exige papel: `Tudo · Minhas · de X` é **navegação, não permissão** —
 * todo grifo de um clube é visível para todo membro ativo dele desde o instante
 * em que é salvo. → ADR 0002. Nada aqui é, nem deve ser nomeado como,
 * privacidade: o `authorId` é uma **lente** sobre o mesmo acervo.
 *
 * Aqui o clube vem do input porque não há recurso de onde tirá-lo — o mesmo caso
 * do `listNotes` e do `listBooks` —, e é o `assertMembership` que faz o corte:
 * clube em que o ator não é membro ativo é 404, exista ele ou não.
 *
 * **Sem paginação** (decisão F): o teto é **válvula** no repositório Prisma da
 * Tarefa 24, como o `take: 500` que a Tarefa 11 mediu e adotou na nota. A
 * primeira tela que paginar troca por cursor.
 */
export class ListHighlights {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly highlights: HighlightRepository,
  ) {}

  async execute(input: ListHighlightsInput): Promise<ListHighlightsOutput> {
    // ANTES da consulta, sempre: um ator de fora não pode gerar nem uma
    // leitura — senão a rota vira oráculo de existência (e conta de banco) para
    // quem não é do clube. É o `findCalls === 0` da regra 1.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    const found = await this.highlights.find({
      // Primeiro e não-negociável: o corte de tenant. Todo o resto entra em AND
      // com ele, e nenhum filtro o substitui.
      clubId: input.clubId,
      // Chave OMITIDA quando o filtro não veio, e não `key: undefined`: o
      // `HighlightFilter` é o contrato, e uma chave presente valendo `undefined`
      // é a diferença entre "não filtra" e "filtra por nada" para qualquer
      // implementação que itere as chaves do filtro.
      ...(input.bookId === undefined ? {} : { bookId: input.bookId }),
      ...(input.authorId === undefined ? {} : { authorId: input.authorId }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.page === undefined ? {} : { page: input.page }),
      // Arquivado é invisível, inclusive para o autor: não há tela de
      // arquivados (é MVP 4), e não há flag para pedi-los — flag sem chamador é
      // especulação. O corte é do REPOSITÓRIO de propósito: filtrar depois
      // seria carregar o acervo inteiro para descartar parte dele, e num cenário
      // sem grifo arquivado os dois desenhos devolvem o mesmo array (quem os
      // separa é o `findFilters` do fake, → §7.3).
      status: 'ACTIVE' as const,
    });

    // Copia antes de ordenar: o array é do repositório, e mutá-lo é smell de
    // fronteira — vira hábito e um dia o repositório o guarda em cache.
    return [...found].sort(compareByCreatedAtDesc);
  }
}

/**
 * O grifo mais recente primeiro.
 *
 * `createdAt` e não `updatedAt`: o comentário do grifo é reescrito a cada
 * autosave, e por `updatedAt` a lista pularia embaixo do dedo de quem está
 * digitando. É a mesma decisão do `listNotes`.
 *
 * **E não por `page` crescente** (decisão A), que seria a ordem de leitura do
 * livro e talvez seja o que a tela queira: `page` é **anulável**, e os grifos
 * sem página precisariam de uma posição arbitrária no meio da lista; e toda
 * outra listagem do app é "mais recente primeiro". A tela da Tarefa 25 pode
 * reordenar o que recebeu **sem** mexer aqui — o contrário muda o contrato para
 * todo chamador futuro.
 *
 * O desempate por `id` existe para a ordem ser DETERMINÍSTICA: duas pessoas
 * grifando no mesmo instante é o caso normal de um clube, e sem ele a ordem
 * sairia como o repositório enumerou — que é diferente entre o fake e o Prisma.
 */
function compareByCreatedAtDesc(a: Highlight, b: Highlight): number {
  const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
