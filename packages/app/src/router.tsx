import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';

import {
  ACCEPT_INVITE_PATH,
  HOME_PATH,
  LOGIN_PATH,
  RequireAnonymous,
  RequireAuth,
} from './auth/require-auth';
import { AcceptInvitePage } from './pages/accept-invite';
import { AcervoPage } from './pages/acervo';
import { BookPage } from './pages/book';
import { BuscaPage } from './pages/busca';
import { DAY_NOTE_PATH, DayNotePage } from './pages/day-note';
import {
  FREE_NOTE_NEW_PATH,
  FREE_NOTE_PATH,
  FreeNotePage,
} from './pages/free-note';
import { HighlightFormPage } from './pages/highlight-form';
import { HomePage } from './pages/home';
import { LoginPage } from './pages/login';
import { NotFoundPage } from './pages/not-found';
import {
  ACERVO_PATH,
  BOOK_EDIT_PATH,
  BOOK_NEW_PATH,
  BOOK_PATH,
  HIGHLIGHT_NEW_PATH,
  HIGHLIGHT_PATH,
  SEARCH_PATH,
  SETTINGS_PATH,
} from './pages/paths';
import { PreferenciasPage } from './pages/preferencias';

/**
 * ⚠️ **O FORMULÁRIO DE LIVRO ENTRA POR `React.lazy()`** (Tarefa 44c) — e é o
 * ~~TERCEIRO~~ **QUARTO** import dinâmico do app, depois dos **três** do
 * editor: `day-note.tsx:129`, `free-note.tsx:100` e `highlight-form.tsx:82`.
 * (O censo errado era da primeira versão desta fatia; o terceiro do editor
 * está lá desde a Tarefa 25 e se chama a si mesmo de terceiro na linha 81.)
 *
 * ⚠️ **O MOTIVO É ORÇAMENTO DE BYTE, E ELE FOI MEDIDO ANTES DE A FATIA
 * COMEÇAR.** O `book-form.tsx` mais o `plan-editor.tsx` custavam
 * **9.460 B** dentro do chunk que o navegador baixa antes de qualquer coisa
 * aparecer — a entrada caiu de **445.040 B** para **435.580 B**, e a folga
 * contra o teto de 450.000 do `bundle-guard.test.ts` subiu de **4.960 B**
 * (1,1%) para **14.420 B** (3,2%). O chunk novo tem **10.059 B** (3,53 kB
 * gzip), e o precache do Workbox foi de **26** para **27** entradas — esperado,
 * e o parágrafo seguinte diz por quê.
 *
 * ⚠️ **E QUEM PAGAVA ERA QUEM NUNCA ABRE ESTA TELA.** Cadastrar o livro do mês
 * e escrever o plano por dia é coisa de `OWNER`/`ADMIN`, uma vez por mês; ler
 * o trecho de hoje e escrever a anotação é de todo mundo, todo dia. O corte é
 * por ADMINISTRAÇÃO, não por tamanho: `preferencias`, `acervo` e `busca`
 * ficam estáticas de propósito — todo mundo as usa, e o acervo é caminho de
 * leitura.
 *
 * ⚠️ **O QUE ISTO NÃO ENTREGA, e não é suposição:** *"quem só lê nunca baixa
 * esse pedaço"*. O `globPatterns` do Workbox
 * (`vite.config.ts:97`) precacheia **todo** `.js` emitido, então num PWA
 * instalado o chunk novo continua vindo em segundo plano — ele só sai do
 * CAMINHO CRÍTICO do primeiro desenho. Tirá-lo do precache seria uma fatia
 * própria, com ADR: custaria ao admin a tela de cadastro OFFLINE, e mexeria
 * justamente no `globIgnores` que `vite.config.ts:98-113` proíbe de voltar.
 *
 * ⚠️ **E HÁ UM SEGUNDO CASO EM QUE O PESO É PAGO POR QUEM NÃO USA A TELA, que
 * a primeira versão desta fatia não mencionou: QUEM NÃO É `OWNER`/`ADMIN`.** O
 * guarda de PAPEL é o `isClubAdmin` de `book-form.tsx:140` e `:212` — ou seja,
 * ele mora **dentro** do módulo preguiçoso. Quem abre `/books/new` sem o papel
 * baixa os **10.059 B** do chunk e só então é recusado. É **pré-existente** (o
 * guarda já era da tela antes desta fatia) e a decisão G manda não movê-lo — o
 * `role` vem do `/me` por clube, e a rota de edição só sabe de qual clube é o
 * livro depois de carregá-lo. Fica registrado porque a fatia se vende como
 * *"quem nunca abre esta tela não paga o peso"*, e este é o caso em que isso
 * não é verdade.
 *
 * O acusador de BYTE é `src/__tests__/bundle-guard.test.ts` (ele compila de
 * verdade, e tem duas guardas ancoradas no GRAFO DE MÓDULOS do Rollup, além do
 * teto); o acusador da FRONTEIRA e do `fallback` é
 * `src/__tests__/lazy-admin-routes.test.tsx`, por `renderToString` (§7.10).
 */
const BookFormPage = lazy(async () => {
  const page = await import('./pages/book-form');
  return { default: page.BookFormPage };
});

/**
 * As duas rotas de administração do livro, com a fronteira de `Suspense` do
 * `lazy()` acima.
 *
 * ⚠️ **ELA NÃO É OBRIGAÇÃO DO REACT — É ESCOLHA DE TELA, e a diferença foi
 * medida.** ⚠️ **MAS A AFIRMAÇÃO PRECISA DO QUALIFICADOR QUE A PRIMEIRA VERSÃO
 * DESTA FATIA NÃO ESCREVEU: ~~"um `lazy()` sem fronteira não estoura"~~ vale
 * NA RAIZ CONCORRENTE DO CLIENTE; sob `renderToString` ele LANÇA.**
 *
 * - **No cliente:** uma sonda com `lazy()` e NENHUM `<Suspense>` na árvore
 *   renderiza `'<div></div>'`, sem exceção e sem `console.error`, e troca pelo
 *   conteúdo quando a promessa resolve — a raiz concorrente se comporta como
 *   uma fronteira de `fallback={null}`.
 * - **Sob `renderToString`** (`react-dom/server`, que o `docs/CONVENCOES-
 *   CODIGO.md` §7.10 manda tentar ANTES de declarar algo indecidível): a mesma
 *   árvore lança `Error: A component suspended while responding to synchronous
 *   input.` Com a fronteira, ela devolve o `fallback` renderizado.
 *
 * Então apagar este `<Suspense>` **não quebra a tela** — deixa o `<main>` vazio
 * debaixo do cabeçalho enquanto o chunk viaja, em silêncio —, mas **quebra o
 * teste**, e quebra lançando. Quem acusa é
 * `src/__tests__/lazy-admin-routes.test.tsx`, que mede o primeiro quadro por
 * SSR. (Na primeira versão da fatia o acusador era um `queryByText` do RTL, e
 * era o único: 940 dos 941 testes do app ficavam verdes.)
 *
 * ⚠️ **O `fallback` É VISÍVEL, E NÃO `null`** (decisão E da Tarefa 44c). O
 * precedente do editor tem os dois modos e diz por que cada um: `day-note.tsx`
 * :806 é visível porque *"sem um fallback a tela ficaria em branco no lugar
 * dele"*, e :949 é `null` porque *"a coluna principal já diz 'Abrindo o
 * editor…'"*. ⚠️ **E há um TERCEIRO precedente, que a primeira versão desta
 * fatia não citou: `highlight-form.tsx:177-182`** — visível, e com o
 * `<p className="text-sm text-muted">` IDÊNTICO ao daqui. Ele reforça a
 * escolha: dos três `Suspense` de tela que o app já tinha, dois são visíveis e
 * os dois usam exatamente esta marcação.
 *
 * Aqui o `lazy()` é a ROTA INTEIRA — não há coluna ao lado dizendo outra
 * coisa, e `null` deixaria o `<main>` vazio debaixo do cabeçalho, que numa
 * rede ruim é indistinguível de "o app quebrou".
 *
 * ⚠️ **E A FRASE É A MESMA QUE A TELA MOSTRA NO QUADRO SEGUINTE** — o
 * `pages.bookForm.loading` no mesmo `<p>` de `book-form.tsx:122` e `:191`.
 * Não é economia de chave (nenhuma chave nasceu nesta fatia): é continuidade.
 * Na rota de edição a tela continua "Carregando…" enquanto busca o livro, e a
 * troca do fallback pelo conteúdo não pisca.
 *
 * ⚠️⚠️ **E ESSA ÚLTIMA FRASE SÓ VALE ENQUANTO OS DOIS `<p>` FOREM BYTE A BYTE
 * IGUAIS — hoje ela tem acusador, e até a rodada de correção da 44c não
 * tinha.** Trocar só o `className` daqui (mantendo a chave) deixava **941/941
 * verdes, zero acusadores**: a promessa estava escrita em três lugares como
 * propriedade medida, e nada a guardava (§7.9). Quem a guarda agora é
 * `lazy-admin-routes.test.tsx`, que compara o `<p>` deste `fallback` com o `<p>`
 * que a própria tela emite, **classe inclusa**, no HTML do `renderToString`.
 *
 * ⚠️ **SEM TÍTULO NO FALLBACK, DE PROPÓSITO.** O `<h1>` difere entre as duas
 * rotas ("Novo livro" e "Editar o livro"), e quem escolhe é a tela. Repetir a
 * escolha aqui seria um segundo lugar para mexer em um só — e um título ERRADO
 * piscando é pior que título nenhum. É também o que dá acusador à fatia: o
 * primeiro quadro sem `<h1>` é como o teste sabe que o chunk ainda não chegou.
 *
 * ⚠️ **O CORTE DE PAPEL NÃO MUDOU DE LUGAR** (decisão G). Quem recusa quem não
 * é `OWNER`/`ADMIN` continua sendo o `isClubAdmin` DENTRO da tela — o
 * comentário das rotas abaixo explica por que o guarda não é de rota, e esta
 * fatia não toca nisso. O `Suspense` embrulha a tela; ele não decide nada.
 */
function BookFormRoute() {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted">{t('pages.bookForm.loading')}</p>
      }
    >
      <BookFormPage />
    </Suspense>
  );
}

/**
 * URL por página (`CLAUDE.md`). As telas de verdade chegam nas Tarefas 15–21;
 * o que esta fatia entrega é a forma: um grupo protegido por `RequireAuth`,
 * um grupo público, e o `*` que impede a tela branca.
 *
 * É um `<Routes>` e não um `createBrowserRouter` de propósito: assim o teste
 * monta a mesma árvore num `MemoryRouter` e abre qualquer caminho.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RequireAnonymous />}>
        <Route path={LOGIN_PATH} element={<LoginPage />} />
      </Route>

      {/*
        O aceite fica fora dos DOIS guardas, e é decisão da Tarefa 15.

        Fora do `RequireAuth` porque quem abre um convite não tem conta ainda —
        é literalmente a única porta de entrada do sistema (ADR 0003).

        E fora do `RequireAnonymous` porque quem JÁ tem sessão e abre um link
        de convite está aceitando um convite: mandá-lo para a home o deixaria
        sem nenhuma forma de entrar no clube novo, e o link foi entregue a uma
        pessoa específica, fora do sistema. O aceite bem-sucedido troca o token
        pelo de quem o convite nomeia.
      */}
      <Route path={ACCEPT_INVITE_PATH} element={<AcceptInvitePage />} />

      <Route element={<RequireAuth />}>
        <Route path={HOME_PATH} element={<HomePage />} />
        {/*
          A TELA DO LIVRO (Tarefa 17) — o plano do mês inteiro. É o destino da
          estante da home, e a porta de onde se toca um dia para escrever.

          Ela e a rota da anotação do dia dividem o prefixo `/books/`, e não há
          ambiguidade: o ranking do react-router prefere a rota MAIS ESPECÍFICA,
          então `/books/abc/days/xyz` casa a de baixo e `/books/abc` casa esta —
          independente da ordem em que são declaradas.
        */}
        <Route path={BOOK_PATH} element={<BookPage />} />
        {/*
          O destino do atalho da leitura de hoje (regra 15 da Tarefa 16). A
          TELA é placeholder — o editor e o autosave são a Tarefa 18 —, mas a
          ROTA precisa existir agora: um atalho que cai no `NotFoundPage` é pior
          que atalho nenhum (decisão C).

          Protegida, ao contrário do aceite: a anotação é conteúdo de clube.
        */}
        <Route path={DAY_NOTE_PATH} element={<DayNotePage />} />
        {/*
          A ANOTAÇÃO AVULSA (Tarefa 19) — criar e corrigir.

          As duas dividem o prefixo `/books/:bookId/notes`, e não há
          ambiguidade: `new` é segmento ESTÁTICO e o react-router prefere a rota
          mais específica, independente da ordem de declaração. Os ids são
          `randomUUID()`, então "new" nunca é um `noteId` de verdade.
        */}
        <Route path={FREE_NOTE_NEW_PATH} element={<FreeNotePage />} />
        <Route path={FREE_NOTE_PATH} element={<FreeNotePage />} />
        {/*
          O CADASTRO DO LIVRO E DO PLANO (Tarefa 20) — as duas rotas do MESMO
          formulário (decisão A).

          Protegidas pelo `RequireAuth` como todo conteúdo de clube, e o corte
          de PAPEL é da tela: o `role` vem do `/me`, por clube, e a rota de
          edição só sabe de qual clube é o livro depois de carregá-lo. Um
          guarda de rota teria de fazer a mesma requisição, mais cedo e sem
          lugar para mostrar o erro.

          `/books/:bookId/edit` é mais específica que `/books/:bookId`, e
          `edit` é segmento ESTÁTICO — o ranking do react-router decide, e
          nenhum id de livro é a palavra "edit" (são `randomUUID()`).
        */}
        <Route path={BOOK_NEW_PATH} element={<BookFormRoute />} />
        <Route path={BOOK_EDIT_PATH} element={<BookFormRoute />} />
        {/*
          O ACERVO DO LIVRO (Tarefa 28) — anotações **e** grifos num lugar só.

          ⚠️ **ELE SUBSTITUI A ROTA DE LISTA DE GRIFOS** (`/books/:bookId/
          highlights`, Tarefa 25 — decisão A da 28): as duas abas da tela do
          livro eram inconsistentes ("Anotações" listava ali mesmo, "Grifos"
          navegava), e uma lista dos dois tem de ser UM lugar. A tela e a rota
          antigas foram apagadas; as duas rotas de FORMULÁRIO de grifo ficam.

          ⚠️ **SEGMENTO PRÓPRIO, IRMÃO DE `days` E DE `notes`**, e não um
          sufixo de `/highlights`: uma terceira rota naquele prefixo entraria na
          disputa do ranking com `/highlights/:highlightId`. → o docblock de
          `ACERVO_PATH` em `pages/paths.ts`.

          Protegida pelo `RequireAuth` como todo conteúdo de clube.
        */}
        <Route path={ACERVO_PATH} element={<AcervoPage />} />
        {/*
          AS DUAS ROTAS DO MESMO FORMULÁRIO DE GRIFO (Tarefa 25, decisões A e
          B).

          Elas dividem o prefixo `/books/:bookId/highlights`, e não há
          ambiguidade: o react-router prefere a rota MAIS ESPECÍFICA,
          independente da ordem de declaração, e `new` é segmento ESTÁTICO —
          os ids são `randomUUID()`, então "new" nunca é um `highlightId` de
          verdade. É o mesmo desenho das duas rotas da anotação avulsa.

          ⚠️ **O ENDEREÇO DA EDIÇÃO CARREGA O LIVRO**, e a spec da 25 pedia
          `/highlights/:highlightId`: a Tarefa 24 mediu que **não existe**
          `GET /highlights/:highlightId`, e o `clubId` do corte de tenant vem
          do LIVRO. → o docblock de `HIGHLIGHT_PATH` em `pages/paths.ts`.

          Protegidas pelo `RequireAuth` como todo conteúdo de clube.
        */}
        <Route path={HIGHLIGHT_NEW_PATH} element={<HighlightFormPage />} />
        <Route path={HIGHLIGHT_PATH} element={<HighlightFormPage />} />
        {/*
          A BUSCA NO ACERVO DO CLUBE (Tarefa 29) — a última fatia do MVP 2.

          ⚠️ **ENDEREÇO DE PRIMEIRO NÍVEL, e sem `:clubId`**: o clube é o ATIVO
          do cabeçalho, como na home — um `clubId` no caminho criaria dois donos
          de "em qual clube estou" (o seletor e a URL). → o docblock de
          `SEARCH_PATH` em `pages/paths.ts`.

          Não disputa ranking com nada: `/busca` é um segmento estático de
          primeiro nível, e as outras rotas do grupo protegido começam com
          `/books/` ou `/highlights/`.

          Protegida pelo `RequireAuth` como todo conteúdo de clube — a busca lê o
          acervo, e o backend faz o corte de tenant contra o `Membership`.
        */}
        <Route path={SEARCH_PATH} element={<BuscaPage />} />
        {/*
          AS PREFERÊNCIAS DA PESSOA (Tarefa 36b) — a primeira tela do projeto
          que não é de clube nenhum.

          ⚠️ **PRIMEIRO NÍVEL, SEGMENTO ESTÁTICO E SEM `:clubId`**: o `Settings`
          é `unique(userId)` desde a Tarefa 03 e não tem `clubId` — um `:clubId`
          aqui prometeria uma preferência por clube que o banco não tem. →
          o docblock de `SETTINGS_PATH` em `pages/paths.ts`.

          Não disputa ranking com nada: as outras rotas protegidas começam com
          `/books/` ou `/clubs/`, e o outro primeiro nível é `/busca` — dois
          segmentos estáticos distintos, sem parâmetro que possa casá-los.

          ⚠️ **DENTRO do `RequireAuth`, e o corte é o próprio JWT**: as rotas
          `/me/settings` e `/notifications/*` falam só do dono do token
          (decisão A da Tarefa 36), então não há `assertMembership` a fazer —
          mas também não há nada a mostrar para quem não tem sessão.
        */}
        <Route path={SETTINGS_PATH} element={<PreferenciasPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
