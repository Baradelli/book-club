import type { Book, ReadingPlanItem } from '../domain/book';
import type { PlanItemReaders } from '../domain/plan-item-readers';
import { groupReadersByPlanItem } from '../domain/plan-item-readers';
import type { PlanItemWriters } from '../domain/plan-item-writers';
import { groupWritersByPlanItem } from '../domain/plan-item-writers';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
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
  /**
   * "Quem já leu cada dia" — só os dias que têm leitura, na ordem do plano.
   * Lista vazia é resposta legítima: ninguém marcou ainda.
   *
   * Tipo PRÓPRIO, e não o `PlanItemWriters` de cima (decisão D da Tarefa 31):
   * o formato é o mesmo e o significado não é, e é este campo que viaja para o
   * `shared` e para a tela.
   *
   * ⚠️ **Nenhum contador, nenhum total e nenhum percentual** — nem aqui nem em
   * lugar nenhum desta resposta. Progresso é **presença** (decisão do dono,
   * `docs/ACEITE-MVP.md` MVP 3, pergunta 1) e é **calculado** a partir dos
   * logs, nunca guardado. É o contrato que torna o número irrenderizável.
   */
  readers: PlanItemReaders[];
}

/**
 * Abrir o livro: o cadastro, o plano ordenado, **quem já escreveu** e **quem
 * já leu** cada dia.
 *
 * **Não** exige papel — o livro é do grupo, e todo membro ativo abre.
 *
 * ⚠️ **O `readers` entrou na Tarefa 32 pelo mesmo argumento do `writers`, e é
 * por isso que NÃO existe `GET /books/:bookId/readers`.** Uma abertura de
 * livro é UM corte de tenant, não três, e a `/writers` gêmea que existe desde
 * a Tarefa 11 **nunca teve cliente** (medido: o app lê o `writers` daqui,
 * `packages/app/src/pages/book.tsx:289`). A 32b atualiza as duas sobreposições
 * rebuscando o livro.
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
    private readonly logs: ReadingLogRepository,
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
    /*
      UM filtro só, com o `bookId` do livro RESOLVIDO e nenhuma chave à toa —
      não um `find` por dia, que daria a mesma sobreposição e N idas ao banco
      (é o par que só o `findFilters` separa, §7.3).

      E o `bookId` sai de `book.id`, não do input: o mesmo motivo pelo qual o
      `ReadingLogFilter` não tem `clubId` — quem corta o tenant é o
      `bookForActor` acima, e uma segunda regra de tenant é uma regra a mais
      para ficar para trás.

      Aqui NÃO há a economia que o `planItemWritersByBook` faz: lá o método de
      projeção existe porque o `doc` é a maior coluna da tabela e carregar as
      ~60 notas inteiras é trafegar o acervo do clube. Uma linha de
      `ReadingLog` tem seis colunas curtas e nenhum JSON, então um método
      `planItemReadersByBook` seria um segundo endereço para a mesma leitura,
      sem nada a economizar — e o `find` já é o que a 32b vai reusar.
    */
    const logs = await this.logs.find({ bookId: book.id });

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
      // A MESMA conta por dentro (`groupUsersByPlanItem`), com o nome honesto:
      // chamar `groupWritersByPlanItem(planItems, logs)` compilaria — a
      // tipagem é estrutural e o `ReadingLog` tem os dois campos —, e é
      // exatamente por isso que a decisão B da Tarefa 31 recusou o reuso do
      // NOME. O teste `keeps the reading overlay independent from the writing
      // one` é o que acusa a troca.
      readers: groupReadersByPlanItem(planItems, logs),
    };
  }
}
