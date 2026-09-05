import type { PlanItemWriters } from '../domain/plan-item-writers';
import { groupWritersByPlanItem } from '../domain/plan-item-writers';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

export interface ListPlanItemWritersInput {
  actorUserId: string;
  bookId: string;
}

/**
 * Reexportado daqui para quem já importava: o tipo mudou de casa para o
 * `domain/plan-item-writers.ts` na Tarefa 11, junto do agrupamento puro que o
 * `getBookWithPlan` também usa.
 */
export type { PlanItemWriters };

export type ListPlanItemWritersOutput = PlanItemWriters[];

/**
 * "Em quais dias cada pessoa já escreveu" — a sobreposição de autoria da tela
 * do livro.
 *
 * **Não** exige papel: é a régua de incentivo do grupo, e o acervo é do clube
 * (→ ADR 0002). E é **calculado** a partir das notas, nunca guardado num
 * contador — da mesma família do progresso do grupo.
 *
 * A Tarefa 11 resolveu a agregação: o `getBookWithPlan` passou a devolver
 * `writers` ao abrir o livro (é o "o Fastify agrega para o front" do
 * `CLAUDE.md`), e **este UseCase continua existindo** porque a tela precisa
 * atualizar só a sobreposição depois de alguém escrever, sem rebuscar o livro
 * inteiro. Para não haver duas implementações do agrupamento, os dois chamam a
 * MESMA função pura — `groupWritersByPlanItem`, no `domain/`.
 *
 * Só **entradas com nota** saem daqui: item do plano em que ninguém escreveu
 * não aparece, porque o front sobrepõe no plano que ele já tem, e devolver
 * todos com `userIds: []` duplicaria o plano numa resposta que já vem ao lado
 * dele.
 */
export class ListPlanItemWriters {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly notes: NoteRepository,
  ) {}

  async execute(
    input: ListPlanItemWritersInput,
  ): Promise<ListPlanItemWritersOutput> {
    // O corte de tenant, ANTES de qualquer leitura de conteúdo: o clube sai de
    // `book.clubId`, nunca do input. Livro inexistente, arquivado ou de outro
    // clube param aqui.
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
    });

    const plan = await this.planItems.findByBook(book.id);
    const writers = await this.notes.planItemWritersByBook(book.id);

    // A MESMA função que o `getBookWithPlan` chama, e é o ponto da extração:
    // ordem do plano, nenhum `planItemId` fora dele, nenhum dia vazio.
    // → domain/plan-item-writers.ts.
    return groupWritersByPlanItem(plan, writers);
  }
}
