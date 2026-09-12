import type { CalendarDay } from '@clube/shared';

import type { ReadingPlanItem } from '../domain/book';
import type { BookRepository } from '../usecases/ports/book-repository';
import type { MembershipRepository } from '../usecases/ports/membership-repository';
import type { ReadingLogRepository } from '../usecases/ports/reading-log-repository';
import type { ReadingPlanItemRepository } from '../usecases/ports/reading-plan-item-repository';

/**
 * ⚠️ **QUEM É CONSIDERADO — a metade do dispatcher que é SELEÇÃO, separada da
 * que é DECISÃO (regra 20 da Tarefa 37).**
 *
 * A regra manda dividir o `scheduler.ts` se ele passar de ~200 linhas, e nomeia
 * o candidato óbvio: *"a seleção de candidatos (quem é considerado), que é
 * separável da decisão (manda ou não manda)"*. Ela nasceu dividida — a costura
 * aqui é entre "o que esta pessoa tem para ler hoje" (quatro repositórios, uma
 * pergunta) e "dado isso, mando?" (a janela, o claim, o envio).
 *
 * ## ⚠️ O corte de tenant mora aqui, e é o do projeto — não um novo
 *
 * `CLAUDE.md`: *"Antes de ler ou escrever qualquer coisa de um clube, confirme
 * que existe um `Membership` **ativo** daquele usuário naquele clube."* É
 * exatamente o que o `activeBookIdsOf` faz, e ele o faz com os dois
 * repositórios que já são donos dessa regra (`Membership` e `Book`). Não há
 * corte novo, não há junção escondida num `where`, e o
 * `ReadingPlanItemRepository` continua sem saber o que é um clube — quem chega
 * a ele já traz os livros cortados (ver o docblock do `ReadingPlanItemFilter`).
 *
 * ⚠️ **E aqui não há 404 nem erro**: o dispatcher não é uma requisição, não tem
 * ator e não responde a ninguém. "Esta pessoa não tem clube ativo" é um
 * resultado normal — a pessoa que saiu do clube simplesmente não é lembrada.
 */

export interface ReminderCandidateDeps {
  memberships: MembershipRepository;
  books: BookRepository;
  planItems: ReadingPlanItemRepository;
  readingLogs: ReadingLogRepository;
}

/**
 * O que esta pessoa tem para ler hoje — e os três estados são **decisões
 * diferentes**, não graus do mesmo.
 *
 * - `NO_PLAN` — não há trecho hoje (decisão B): um lembrete ali seria "leia"
 *   sem dizer o quê, e é o estado normal do clube entre dois livros. **Não é
 *   erro e não vira log de erro.**
 * - `ALREADY_READ` — há trecho e ela já registrou a leitura: é a **supressão
 *   anti-culpa** do `NOTIFICACOES.md` §1, *"o app não cobra quem já fez"*.
 * - `TO_READ` — há trecho e ela ainda não leu. É o único caso em que se manda.
 *
 * Os dois primeiros viram `skipped` no resultado, e é de propósito que eles
 * sejam **distinguíveis aqui** mesmo somando no mesmo contador: quem lê este
 * código precisa ver que "não há o que ler" e "ela já leu" são regras
 * diferentes, com donos diferentes no produto.
 */
export type ReadingOfTheDay =
  | { status: 'NO_PLAN' }
  | { status: 'ALREADY_READ' }
  | { status: 'TO_READ'; planItem: ReadingPlanItem; bookId: string };

/**
 * Os livros **ativos** dos clubes em que a pessoa tem membresia **ativa**.
 *
 * ⚠️ **Membresia `ACTIVE`, e o status do CLUBE não entra** — é o ADR 0009 na
 * letra: *"O `assertMembership` continua conferindo só o `Membership`. O status
 * do `Club` não entra no guard de tenant."* Arquivar um clube o tira do
 * seletor; não torna o acervo ilegível para quem era membro, e não é aqui que
 * essa decisão se reabre.
 *
 * ⚠️ **Livro `ACTIVE`, e esse SIM entra.** Arquivar o livro é como o clube o
 * tira da estante, e o plano de um livro arquivado não é "a leitura de hoje" —
 * é história. Lembrar alguém de um trecho de um livro que o clube já encerrou é
 * a forma mais boba de o lembrete perder a confiança de quem o recebe.
 */
async function activeBookIdsOf(
  deps: ReminderCandidateDeps,
  userId: string,
): Promise<string[]> {
  const memberships = await deps.memberships.findByUser(userId);
  const activeClubIds = memberships
    .filter((membership) => membership.status === 'ACTIVE')
    .map((membership) => membership.clubId);

  const bookIds: string[] = [];
  for (const clubId of activeClubIds) {
    const books = await deps.books.find({ clubId, status: 'ACTIVE' });
    bookIds.push(...books.map((book) => book.id));
  }
  return bookIds;
}

/**
 * ⚠️ **A ORDEM DETERMINÍSTICA — e ela existe porque o port NÃO promete ordem.**
 *
 * Quando alguém está em dois clubes que leem no mesmo dia, há dois trechos e um
 * lembrete só (o claim é um por pessoa por dia). Qual deles a mensagem nomeia
 * não pode depender do plano de execução do Postgres: duas passadas do cron
 * escolheriam trechos diferentes, e o fake enumera INVERTIDO justamente para
 * ninguém confiar na ordem do repositório (§7.2).
 *
 * `bookId` e depois `order`: o primeiro é estável entre execuções, o segundo é
 * a ordem do plano dentro do livro.
 */
function inStableOrder(items: ReadingPlanItem[]): ReadingPlanItem[] {
  return [...items].sort(
    (a, b) => a.bookId.localeCompare(b.bookId) || a.order - b.order,
  );
}

/**
 * "O que esta pessoa tem para ler hoje, e ela já leu?"
 *
 * ⚠️ **`day` é `CalendarDay` e a comparação é de STRING** (decisão A): ele vem
 * do `localDay(now, settings.timezone)`, que devolve exatamente a forma de
 * `ReadingPlanItem.date`. Não há aritmética de data em lugar nenhum deste
 * caminho — nem range, nem `startOf('day')`, nem comparação de `Date`.
 *
 * ⚠️ **A supressão é pelo par `(planItemId, userId)`** (decisão 2 do MVP 3: o
 * `ReadingLog` é ancorado em `planItemId`, não em data), e é por isso que ela
 * não precisa de faixa de instantes: a pergunta "ela leu o trecho de hoje?" é
 * literalmente a chave única do `ReadingLog`.
 */
export async function readingOfTheDay(
  deps: ReminderCandidateDeps,
  userId: string,
  day: CalendarDay,
): Promise<ReadingOfTheDay> {
  const bookIds = await activeBookIdsOf(deps, userId);
  const items = inStableOrder(
    await deps.planItems.find({ bookIds, date: day }),
  );

  if (items.length === 0) return { status: 'NO_PLAN' };

  for (const planItem of items) {
    const log = await deps.readingLogs.byPlanItemAndUser(planItem.id, userId);
    if (log === null) {
      return { status: 'TO_READ', planItem, bookId: planItem.bookId };
    }
  }

  return { status: 'ALREADY_READ' };
}
