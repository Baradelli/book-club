import type { Book, ReadingPlanItem } from '../domain/book';
import type { PlanItemWriters } from '../domain/plan-item-writers';
import { groupWritersByPlanItem } from '../domain/plan-item-writers';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface GetBookWithPlanInput {
  actorUserId: string;
  bookId: string;
}

export interface GetBookWithPlanOutput {
  book: Book;
  planItems: ReadingPlanItem[];
  /**
   * "Quem já escreveu em cada dia" — só os dias que têm nota, na ordem do
   * plano. Lista vazia é resposta legítima: ninguém escreveu ainda.
   */
  writers: PlanItemWriters[];
}

/**
 * Abrir o livro: o cadastro, o plano ordenado e **quem já escreveu em cada
 * dia**.
 *
 * **Não** exige papel — o livro é do grupo, e todo membro ativo abre.
 *
 * O `writers` entrou na Tarefa 11, e é o "o Fastify agrega para o front" do
 * `CLAUDE.md`: uma abertura de livro é UM corte de tenant, não dois. Compor
 * este UseCase com o `listPlanItemWriters` na rota faria o `bookForActor` rodar
 * duas vezes por tela aberta. Na Tarefa 07 o campo não existia porque `Note`
 * ainda não existia, e um `writers` permanentemente vazio seria pior que a
 * ausência dele — a tela mostraria "ninguém escreveu" com convicção.
 *
 * A leitura é o `planItemWritersByBook`, e não um `find`: o `doc` é a maior
 * coluna da tabela, e carregar as ~60 notas de um livro inteiras para desenhar
 * bolinhas de autoria é trafegar o acervo do clube. O agrupamento é a função
 * pura `groupWritersByPlanItem`, a MESMA que o `listPlanItemWriters` chama —
 * duas cópias divergiriam, e a divergência apareceria como uma bolinha que
 * muda ao recarregar.
 */
export class GetBookWithPlan {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly notes: NoteRepository,
  ) {}

  async execute(input: GetBookWithPlanInput): Promise<GetBookWithPlanOutput> {
    // O corte de tenant, ANTES de qualquer leitura de conteúdo: nem o plano
    // (os temas de cada dia são conteúdo do clube) nem as notas são lidos por
    // quem não é membro ativo.
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
    });

    const found = await this.planItems.findByBook(book.id);
    const writers = await this.notes.planItemWritersByBook(book.id);

    // O port já promete ordem de `order`, e ordenar aqui de novo é barato: a
    // tela do livro não pode virar um plano fora de ordem porque alguém
    // perdeu o `orderBy` no repositório Prisma.
    const planItems = [...found].sort((a, b) => a.order - b.order);

    return {
      book,
      planItems,
      // O agrupamento recebe o plano JÁ ordenado, mas ordena de novo por dentro
      // — a função é pura e não confia no chamador, e é o que a torna reusável
      // pelo `listPlanItemWriters` sem uma pré-condição escondida.
      writers: groupWritersByPlanItem(planItems, writers),
    };
  }
}
