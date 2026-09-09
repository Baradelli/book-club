import type { MeResponse } from '@clube/shared';

/**
 * OS ENDEREÇOS DO LIVRO, E QUEM PODE ADMINISTRÁ-LO — num módulo **sem
 * dependência nenhuma** do app.
 *
 * ⚠️ **ELE EXISTE PARA MATAR UM CICLO DE IMPORT, e o ciclo não era teórico.**
 * A Tarefa 20 pôs a entrada "Editar o livro" na tela do livro
 * (`book.tsx` → `book-form.tsx`) e a navegação de sucesso no formulário
 * (`book-form.tsx` → `book.tsx`). A auditoria mediu o que isso custa: uma
 * `const` de MÓDULO num dos dois lendo uma `const` do outro derruba a rota
 * inteira no import — **tela branca, não degradação** —, e qual dos dois é o
 * lado frágil depende só da ordem alfabética dos imports do `router.tsx`. Um
 * comentário dizendo "hoje só há função declarada, então está tudo bem" é uma
 * armadilha esperando a próxima constante.
 *
 * Aqui não há armadilha: este arquivo não importa nada do app. O único import
 * é um TIPO de `@clube/shared`, que o compilador apaga.
 *
 * ⚠️ **E O `book.tsx` REEXPORTA `BOOK_PATH`/`bookPath` daqui de propósito**: o
 * `free-note.tsx` os importa de lá e está fechado desde a Tarefa 19. A
 * definição mora neste arquivo; a porta antiga continua aberta.
 */

/** O clube como o `/me` o devolve — o tipo, sem tocar no contexto do app. */
type ClubOfMe = MeResponse['clubs'][number];

/** As rotas. Constantes lidas pelo `router.tsx` e pelos construtores abaixo. */
export const BOOK_PATH = '/books/:bookId';
export const BOOK_NEW_PATH = '/clubs/:clubId/books/new';
export const BOOK_EDIT_PATH = '/books/:bookId/edit';

/**
 * `encodeURIComponent` em todos: hoje os ids são `randomUUID()` e não há nada
 * a escapar, mas um id com `/` deixaria de ser um segmento.
 */
export function bookPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}`;
}

export function bookNewPath(clubId: string): string {
  return `/clubs/${encodeURIComponent(clubId)}/books/new`;
}

export function bookEditPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/edit`;
}

/**
 * OS GRIFOS DO LIVRO (Tarefa 25) — a coleção e o formulário.
 *
 * ⚠️ **OS TRÊS ENDEREÇOS CARREGAM O LIVRO, E A SPEC PEDIA `/highlights/:id`
 * PARA A EDIÇÃO.** É a MESMA medição que o `FREE_NOTE_PATH` registrou na Tarefa
 * 19, e a Tarefa 24 a confirmou por escrito: **não existe
 * `GET /highlights/:highlightId`** ("Nenhuma tela pede um grifo por id", o
 * escopo enxuto da 24). A única leitura de grifo da API é
 * `GET /clubs/:clubId/highlights`, e o `clubId` **não está** no endereço de um
 * grifo — ele vem do LIVRO (`book.clubId`). Com `/highlights/:highlightId`
 * sozinho, a tela teria de adivinhar o clube pelo seletor do cabeçalho, e o
 * link de um grifo de OUTRO clube responderia 404 para um grifo que existe.
 *
 * `new` é segmento ESTÁTICO e ganha do `:highlightId` no ranking do
 * react-router, independente da ordem em que as rotas são declaradas — os ids
 * são `randomUUID()`, então "new" nunca é um `highlightId` de verdade.
 *
 * Eles moram AQUI, e não na tela da coleção, pelo motivo do docblock deste
 * arquivo: a coleção linka para o formulário e o formulário volta para a
 * coleção. Com as constantes num módulo sem dependência, as duas telas não
 * importam uma da outra e o ciclo que a auditoria da Tarefa 20 mediu não
 * existe.
 */
export const HIGHLIGHTS_PATH = '/books/:bookId/highlights';
export const HIGHLIGHT_NEW_PATH = '/books/:bookId/highlights/new';
export const HIGHLIGHT_PATH = '/books/:bookId/highlights/:highlightId';

/** `encodeURIComponent` pelo mesmo motivo dos de cima: id com `/`. */
export function highlightsPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/highlights`;
}

export function highlightNewPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/highlights/new`;
}

export function highlightPath(bookId: string, highlightId: string): string {
  return `/books/${encodeURIComponent(bookId)}/highlights/${encodeURIComponent(highlightId)}`;
}

/**
 * REGRA 1 (Tarefa 20) — QUEM ADMINISTRA **AQUELE** CLUBE.
 *
 * O papel vem do `/me`, **por clube**, e é por isso que esta função recebe o
 * `clubId`: o clube do LIVRO não é necessariamente o clube ativo do cabeçalho.
 *
 * ⚠️ **E ISSO TEM ACUSADOR AGORA.** A auditoria mediu que trocar o `clubId`
 * pelo do clube ativo passava em 332 testes — todo fixture da fatia tinha UM
 * clube, que era sempre o clube do livro, então os dois argumentos eram o mesmo
 * valor. Os testes de dois clubes de `book-form.test.tsx` ("THE ADMIN GATE IS
 * MEASURED AGAINST THE CLUB OF THE BOOK") existem por causa dessa medição, e
 * provam os DOIS lados: admin do clube ativo e não do livro **recusa**; admin
 * do livro e não do ativo **entra**.
 */
export function isClubAdmin(
  clubs: readonly ClubOfMe[],
  clubId: string,
): boolean {
  const club = clubs.find((candidate) => candidate.id === clubId);
  return club !== undefined && (club.role === 'OWNER' || club.role === 'ADMIN');
}
