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
 * O FORMULÁRIO DO GRIFO (Tarefa 25) — registrar e corrigir.
 *
 * ⚠️ **OS DOIS ENDEREÇOS CARREGAM O LIVRO, E A SPEC DA 25 PEDIA
 * `/highlights/:id` PARA A EDIÇÃO.** É a MESMA medição que o `FREE_NOTE_PATH`
 * registrou na Tarefa 19, e a Tarefa 24 a confirmou por escrito: **não existe
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
 * ⚠️ **A ROTA DE LISTA DE GRIFOS (`/books/:bookId/highlights`) MORREU NA TAREFA
 * 28**, e a `ACERVO_PATH` abaixo é quem a substitui (decisão A): as duas abas da
 * tela do livro eram inconsistentes — "Anotações" listava ali mesmo e "Grifos"
 * navegava —, e uma lista dos dois tem de ser um lugar. As duas rotas de
 * FORMULÁRIO ficam, e é para o acervo que elas voltam depois de salvar.
 *
 * Eles moram AQUI, e não na tela do acervo, pelo motivo do docblock deste
 * arquivo: o acervo linka para o formulário e o formulário volta para o acervo.
 * Com as constantes num módulo sem dependência, as duas telas não importam uma
 * da outra e o ciclo que a auditoria da Tarefa 20 mediu não existe.
 */
export const HIGHLIGHT_NEW_PATH = '/books/:bookId/highlights/new';
export const HIGHLIGHT_PATH = '/books/:bookId/highlights/:highlightId';

/** `encodeURIComponent` pelo mesmo motivo dos de cima: id com `/`. */
export function highlightNewPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/highlights/new`;
}

export function highlightPath(bookId: string, highlightId: string): string {
  return `/books/${encodeURIComponent(bookId)}/highlights/${encodeURIComponent(highlightId)}`;
}

/**
 * O ACERVO DO LIVRO (Tarefa 28) — anotações **e** grifos num lugar só.
 *
 * ⚠️ **SEGMENTO PRÓPRIO, IRMÃO DE `days` E DE `notes` — nunca um sufixo de
 * `/highlights`.** As duas rotas do FORMULÁRIO de grifo continuam existindo
 * (`/highlights/new` e `/highlights/:highlightId`), e um endereço de acervo
 * dentro daquele prefixo entraria na disputa do ranking do react-router com o
 * `:highlightId`: `/books/b/highlights/acervo` é, para o roteador, um candidato
 * legítimo a "o grifo de id `acervo`". `new` sobrevive a isso por ser um
 * segmento estático de UMA rota declarada; uma TERCEIRA rota no mesmo prefixo
 * seria uma ambiguidade nova sem necessidade nenhuma.
 *
 * ⚠️ **E O NOME DO SEGMENTO É PORTUGUÊS, ao contrário do resto.** `CLAUDE.md`
 * manda rotas em inglês, e esta é a exceção que a spec da Tarefa 28 fixa
 * (`/books/:bookId/acervo`): "acervo" é o nome que o produto usa para a coisa
 * — não há palavra inglesa curta com o mesmo sentido ("collection" já é o nome
 * de outra coisa no vocabulário do Prisma), e o endereço é o que a pessoa vê e
 * compartilha. O CÓDIGO continua em inglês.
 */
export const ACERVO_PATH = '/books/:bookId/acervo';

export function acervoPath(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}/acervo`;
}

/**
 * A BUSCA NO ACERVO DO CLUBE (Tarefa 29) — decisão D.
 *
 * ⚠️ **TELA PRÓPRIA, E NÃO UM CAMPO NO ACERVO DO LIVRO.** O acervo é de
 * **livro** (`/books/:bookId/acervo`), e um campo de busca lá seria uma busca
 * dentro daquele livro — que é o que as quatro dimensões de recorte da Tarefa 28
 * já fazem melhor, no cliente e sem ida ao servidor. O `BACKLOG` diz "acervo do
 * **clube**", e é isso que não existia: a pergunta desta tela é *"onde está esta
 * palavra"*, atravessando **todos** os livros.
 *
 * ⚠️ **SEM `:clubId` NO ENDEREÇO, ao contrário de `/clubs/:clubId/books/new`.**
 * O clube é o **ativo do cabeçalho** (`useActiveClub`), como na home: quem troca
 * de clube no seletor espera que a busca acompanhe, e um `clubId` no caminho
 * criaria dois donos de "em qual clube estou" — o seletor e a URL — que
 * divergem no primeiro toque. O preço é que o endereço não é compartilhável
 * entre clubes; a home tem exatamente o mesmo preço, pela mesma razão.
 *
 * ⚠️ **E O SEGMENTO É PORTUGUÊS**, como o `/acervo` da Tarefa 28 e pela mesma
 * razão: `CLAUDE.md` manda rotas em inglês, e a exceção declarada é o nome que o
 * **produto** usa para a coisa — é o endereço que a pessoa vê e compartilha. O
 * CÓDIGO continua em inglês (`SEARCH_PATH`, `searchPath`, `BuscaPage` é o único
 * nome de componente que segue o arquivo).
 *
 * Ele mora AQUI, e não na tela da busca, pelo motivo do docblock deste arquivo:
 * a home linka para a busca, e a busca linka para as telas de anotação e de
 * grifo. Com as constantes num módulo sem dependência, nenhuma das telas importa
 * a outra e o ciclo que a auditoria da Tarefa 20 mediu não existe.
 */
export const SEARCH_PATH = '/busca';

export function searchPath(): string {
  return SEARCH_PATH;
}

/**
 * AS PREFERÊNCIAS DA PESSOA (Tarefa 36b) — decisão B.
 *
 * ⚠️ **PRIMEIRO NÍVEL, SEGMENTO ESTÁTICO, E SEM `:clubId`.** O `Settings` é
 * `unique(userId)` desde a Tarefa 03 e **não tem `clubId`**: preferência é da
 * PESSOA, e nenhuma escolha desta tela pertence a clube nenhum. Um `:clubId` no
 * caminho prometeria uma preferência por clube que o banco não tem.
 *
 * ⚠️ **NÃO DISPUTA RANKING COM NADA.** Todas as outras rotas do grupo protegido
 * começam com `/books/` ou `/clubs/`, e `/busca` é o único outro primeiro nível
 * — dois segmentos estáticos distintos, sem parâmetro que possa casá-los. É
 * exatamente o desenho do `SEARCH_PATH` da Tarefa 29.
 *
 * ⚠️ **O ENDEREÇO É PORTUGUÊS E A CONSTANTE É INGLÊS**, como o par
 * `SEARCH_PATH`/`/busca`: `CLAUDE.md` manda código em inglês e conteúdo em
 * português, e **URL é conteúdo que a pessoa vê e compartilha**.
 *
 * Ele mora AQUI, e não na tela, pelo motivo do docblock deste arquivo: o
 * cabeçalho (`App.tsx`) linka para a tela, e um dia a tela linkará de volta —
 * com a constante num módulo sem dependência, nenhum dos dois importa o outro e
 * o ciclo que a auditoria da Tarefa 20 mediu não existe.
 *
 * ⚠️ **E NÃO HÁ `settingsPath()` ao lado dele**, ao contrário de todos os
 * vizinhos: os outros constroem endereço a partir de um `id`, e este não tem
 * parâmetro nenhum — uma função que devolve a constante seria um segundo nome
 * para o mesmo valor, sem um caso de uso (§7.1: helper sem segundo chamador é
 * especulação).
 */
export const SETTINGS_PATH = '/preferencias';

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
