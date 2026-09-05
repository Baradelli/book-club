import type { Book } from '../domain/book';
import type { AssertMembership } from './assert-membership';
import type { BookRepository } from './ports/book-repository';

export interface ListBooksInput {
  actorUserId: string;
  clubId: string;
  /** Ausente ou `false` = só os ACTIVE. */
  includeArchived?: boolean;
}

/**
 * A estante do clube. **Não** exige papel: o livro é do grupo, e um MEMBER que
 * não consegue listar os livros do próprio clube não faria sentido.
 *
 * Aqui o clube vem do input porque não há livro de onde tirá-lo — e é o
 * `assertMembership` que faz o corte: clube em que o ator não é membro ativo é
 * 404, exista ele ou não.
 */
export class ListBooks {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
  ) {}

  async execute(input: ListBooksInput): Promise<Book[]> {
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    const found = await this.books.find({
      clubId: input.clubId,
      ...(input.includeArchived ? {} : { status: 'ACTIVE' as const }),
    });

    // Copia antes de ordenar: o array é do repositório, e mutá-lo é smell
    // de fronteira — vira hábito e um dia o repositório o guarda em cache.
    return [...found].sort(compareByMonthDesc);
  }
}

/**
 * Do mês **mais recente** para o mais antigo. `month` é "YYYY-MM", então a
 * comparação de string ordena igual ao calendário — a mesma dependência de
 * formato do plano.
 *
 * ⚠️ **NÃO é "mês corrente primeiro"**, e a diferença morde. Um livro de mês
 * **futuro** — o do mês que vem, que o admin cadastra adiantado — vem na frente
 * do corrente, porque `"2026-10" > "2026-09"`. Quem precisa de "o livro de
 * agora" tem de **descartar os futuros no consumidor**; é o que a home faz
 * (`todayCandidates` em `packages/app/src/pages/home.tsx`).
 *
 * Está escrito porque a frase antiga ("mês corrente primeiro") foi copiada para
 * a spec da Tarefa 16 e de lá para a home, que passou a pedir o plano do livro
 * errado e a esconder o atalho da leitura de hoje. O código sempre esteve certo;
 * o comentário é que descrevia outra coisa.
 *
 * Os dois desempates existem para a ordem ser DETERMINÍSTICA: sem eles, dois
 * livros do mesmo mês sairiam na ordem em que o repositório os enumerou, que
 * é diferente entre o fake e o Prisma.
 */
function compareByMonthDesc(a: Book, b: Book): number {
  if (a.month !== b.month) return a.month < b.month ? 1 : -1;

  const byCreatedAt = b.createdAt.getTime() - a.createdAt.getTime();
  if (byCreatedAt !== 0) return byCreatedAt;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
