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
import { BookFormPage } from './pages/book-form';
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
} from './pages/paths';

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
        <Route path={BOOK_NEW_PATH} element={<BookFormPage />} />
        <Route path={BOOK_EDIT_PATH} element={<BookFormPage />} />
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
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
