import { InvalidHighlightError } from '../domain/errors';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

/**
 * ⚠️ **A GUARDA DO DIA ESCOLHIDO — decisão J da Tarefa 48a, e o dono único
 * dela.** O `createHighlight` e o `editHighlight` chamam isto; uma cópia da
 * regra em cada um é como uma delas fica para trás.
 *
 * Até a 38i o `planItemId` do grifo NÃO vinha do corpo (decisão E daquela
 * fatia: *"aceitá-lo do cliente deixaria qualquer um apontar o grifo para o
 * dia que quisesse"*). A 48a o abriu por decisão do dono, e é esta conferência
 * que fecha o que aquela frase temia: o dia precisa **existir** e ser **deste
 * livro**. Um dia de outro livro — do mesmo clube ou de outro — e um id
 * inventado recebem **a mesma resposta** (`InvalidHighlightError` → 400): não
 * há o que distinguir para o cliente, e distinguir "existe noutro clube" de
 * "não existe" seria o vazamento que o 404 de tenant evita.
 *
 * ⚠️ **Os dois lados do `||` têm acusador próprio.** Sem o `item === null`,
 * o id inventado faria a leitura de `item.bookId` em `null` lançar
 * `TypeError` — que não é erro de domínio, e a rota responderia **500** (a
 * FK do Postgres nem chegaria a ser tocada); quem acusa é
 * `refuses a day that does not exist`. Sem o `item.bookId !== bookId` (o
 * mutante 2 da spec), o dia de um livro irmão do mesmo clube seria gravado em
 * silêncio — e o grifo apareceria no filtro "Leitura" de um livro que não é o
 * dele; quem acusa é `refuses the day of another book of the same club…`.
 *
 * Quem chama já passou pelo corte de tenant: o `bookId` aqui é o do livro (ou
 * do grifo) que o ator pode ver. Por isso a leitura do plano vem DEPOIS do
 * corte, nunca antes (§7.3: o plano é conteúdo do clube).
 */
export async function assertPlanItemOfBook(
  planItems: ReadingPlanItemRepository,
  bookId: string,
  planItemId: string,
): Promise<string> {
  const item = await planItems.byId(planItemId);
  if (item === null || item.bookId !== bookId) {
    throw new InvalidHighlightError(
      'highlight plan day must be a day of the plan of this book',
    );
  }
  return item.id;
}
