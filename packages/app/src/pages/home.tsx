import {
  type BookResponse,
  booksResponseSchema,
  bookWithPlanResponseSchema,
  isClubMonth,
  localDay,
  localTimeZone,
  type PlanItemResponse,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import { Button, cx, FOCUS_RING, List, ListItem } from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import { ActivityFeed } from './activity-feed';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import { dayNotePath } from './day-note';
import {
  messageFor,
  resolveApiError,
  type StatusMessages,
} from './form-errors';
import { bookNewPath, bookPath, isClubAdmin, searchPath } from './paths';

/**
 * A HOME — a tela que abre o app.
 *
 * Três coisas, na ordem em que importam para quem está na cama com uma mão no
 * celular (`docs/plano-clube-do-livro.md` §1, "atrito mínimo"): em qual clube
 * eu estou (o seletor vive no cabeçalho, em `App.tsx`), **o atalho da leitura
 * de hoje**, e o que o clube está lendo.
 *
 * ⚠️ **O PRINCÍPIO ANTI-CULPA É REGRA TESTADA AQUI, NÃO INTENÇÃO** (regra 16).
 * Sem trecho de leitura hoje, esta tela **não cobra nada**: nem "você está
 * atrasado", nem "faltam 3 dias", nem badge de pendência, nem vermelho de
 * atraso. `text-danger`/`bg-danger` não aparecem em lugar nenhum deste arquivo,
 * e o acusador é a varredura de DOM (texto **e** atributos) de
 * `__tests__/home.test.tsx` — o mesmo espírito da guarda do ADR 0002 no
 * `FilterChip`.
 *
 * ⚠️ **E O ESTADO VAZIO VEM PRIMEIRO, NÃO POR ÚLTIMO.** O seed cria
 * `admin@clube.local` com `isSuperAdmin: true` e **zero memberships**: a
 * primeira abertura do app, na primeira vez que o dono entra, tem `clubs: []`.
 * Um `clubs[0]` sem guarda quebraria a primeira impressão do projeto inteiro
 * (⚠️ 2 da spec). Aqui isso é caminho principal: `activeClub === null` tem tela
 * própria, que diz o que fazer sem prometer botão que não existe (criar clube é
 * super-admin, Tarefa 42; entrar num clube é pelo link de convite, ADR 0003).
 *
 * ⚠️ **DUAS REQUISIÇÕES NO PIOR CASO, e é dívida registrada.** Não existe
 * endpoint de "leitura de hoje": a sequência é `/me` (no `ActiveClubProvider`) →
 * `GET /clubs/:clubId/books` → `GET /books/:bookId` de **até dois** livros
 * (decisão E, revisada — ver `todayCandidates` abaixo). Um
 * `GET /clubs/:clubId/today` resolveria em uma, e é backend (fechado nesta
 * fatia).
 */

/**
 * REGRA 17 — 404 na estante tem frase PRÓPRIA.
 *
 * É o membership que sumiu entre o `/me` e a listagem (arquivado no MVP 4, ou
 * uma aba aberta desde ontem). O genérico `errors.notFound` ("Não encontramos o
 * que você procurava") não diz o quê, e aqui o "o quê" é o clube inteiro.
 */
const SHELF_STATUS: StatusMessages = {
  404: { key: 'pages.home.clubUnavailable' },
};

/**
 * Retentar um 404 é pedir outra vez a mesma negativa: o membership não volta
 * porque a pessoa apertou um botão. Rede, 500 e corpo fora do contrato, sim
 * (regra 18).
 */
function isRetriable(error: unknown): boolean {
  return !(error instanceof ApiError && error.status === 404);
}

interface Shelf {
  status: 'idle' | 'loading' | 'ready' | 'failed';
  books: readonly BookResponse[];
  error: unknown;
}

const EMPTY_SHELF: Shelf = { status: 'idle', books: [], error: undefined };

/**
 * O plano que a tela conseguiu ler, e **de qual livro** — o `book` importa
 * porque o atalho monta `/books/:bookId/days/:planItemId` e o livro do plano
 * não é mais, por construção, o primeiro da estante (ver `todayCandidates`).
 *
 * Só os itens e o livro — um campo de `status` aqui seria morto: quem decide se
 * o atalho aparece é a existência de um item com a data de hoje, e "não veio" e
 * "veio vazio" levam à MESMA tela (nenhum atalho, e nenhuma cobrança).
 */
interface Plan {
  book: BookResponse | null;
  items: readonly PlanItemResponse[];
}

const EMPTY_PLAN: Plan = { book: null, items: [] };

/** Identidade estável para o `useMemo` dos candidatos (evita efeito à toa). */
const NO_CANDIDATES: readonly BookResponse[] = [];

/**
 * ⚠️ **QUANTOS LIVROS A TELA PODE PERGUNTAR** — o orçamento da decisão E.
 *
 * Dois: o clube real tem o livro do mês e, no máximo, o do mês anterior ainda
 * correndo. Buscar o plano de todos seria N requisições para um atalho.
 */
const PLAN_REQUEST_BUDGET = 2;

/**
 * ⚠️ **OS LIVROS QUE PODEM CONTER "HOJE" — E ESTE FOI UM BUG DE PRODUTO VIVO.**
 *
 * A versão anterior pedia o plano de `books[0]`, e a spec justificava isso com
 * "o primeiro é o do mês corrente, que é o que o `listBooks` põe na frente".
 * **O `listBooks` não promete isso**: ele ordena por `month` DESCENDENTE, então
 * um livro de mês **futuro** — o do mês que vem, que o admin cadastra
 * adiantado — vem na frente. Medido: estante `[out/2026, set/2026]`, hoje
 * `2026-09-04`, item de hoje em setembro → a home pedia o plano de outubro e o
 * atalho **desaparecia**. Nenhum teste pegava, porque todo fixture do atalho
 * tinha **um** livro e nenhum mês futuro.
 *
 * O filtro é `month <= currentMonth` — comparação de STRING, que em `"YYYY-MM"`
 * ordena igual ao calendário (a mesma dependência de formato do
 * `compareByMonthDesc` do backend).
 *
 * E "o primeiro não futuro" **também** não basta, e são três casos medidos:
 *
 * 1. plano de setembro que se estende até outubro (o mês virou, o livro não);
 * 2. dois livros no mesmo mês (o desempate do backend é `createdAt`, não "quem
 *    tem trecho hoje");
 * 3. livro do mês corrente **sem plano** mascarando o anterior, que cobre hoje.
 *
 * Nos três, o item de hoje está no SEGUNDO. Daí o orçamento de duas
 * requisições: pede o primeiro não futuro e, **só se ele não tem item de hoje**,
 * o próximo da lista.
 *
 * Todos futuros → lista vazia: a estante aparece, o atalho não. Sem atalho a
 * home não cobra nada (regra 16), então "não sei qual é o livro de agora" é um
 * estado silencioso, não um erro.
 */
function todayCandidates(
  books: readonly BookResponse[],
  currentMonth: string,
): readonly BookResponse[] {
  return books
    .filter((book) => book.month <= currentMonth)
    .slice(0, PLAN_REQUEST_BUDGET);
}

/**
 * `"2026-09"` → "setembro de 2026", no idioma da tela.
 *
 * `isClubMonth` antes de formatar, e não é zelo: o `bookResponseSchema` declara
 * `month: z.string()` (não o `clubMonth` refinado), então um mês malformado
 * chegaria aqui, faria um `Invalid Date`, e o `Intl` LANÇARIA — apagando a home
 * por causa de uma linha do banco. Sem o formato canônico, mostra o valor cru:
 * feio é melhor que branco.
 *
 * `timeZone: 'UTC'` porque o instante é meia-noite UTC do dia 1: em qualquer
 * fuso negativo, formatar no fuso local devolveria o mês ANTERIOR — o mesmo bug
 * de um dia que o `localDay` existe para não cometer.
 */
function formatClubMonth(month: string, locale: string): string {
  if (!isClubMonth(month)) return month;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const activeClubState = useActiveClub();
  const { activeClub } = activeClubState;
  const navigate = useNavigate();

  const [shelf, setShelf] = useState<Shelf>(EMPTY_SHELF);
  const [shelfAttempt, setShelfAttempt] = useState(0);
  const [plan, setPlan] = useState<Plan>(EMPTY_PLAN);

  const clubId = activeClub === null ? null : activeClub.id;

  /*
    "QUE DIA É HOJE" — calculado, nunca guardado (`CONTEXT.md`), com `Intl` e
    no fuso de quem está olhando a tela (⚠️ 1 da spec: o `/me` não devolve
    `timezone`, o `Settings` não tem rota, e no front o fuso do navegador É o
    fuso da pessoa). Fica no corpo do render, sem `useMemo`: são trinta itens, e
    um `useMemo` congelaria "hoje" numa aba aberta desde ontem.
  */
  const today = localDay(new Date(), localTimeZone());
  /** `"YYYY-MM"` — a MESMA string que o `book.month` carrega. */
  const currentMonth = today.slice(0, 7);

  useEffect(() => {
    // REGRA 10: a dependência é o `clubId`, então trocar de clube no seletor
    // refaz a requisição — com o clube novo no CAMINHO.
    if (clubId === null) {
      setShelf(EMPTY_SHELF);
      return;
    }

    let cancelled = false;
    setShelf({ status: 'loading', books: [], error: undefined });

    void api
      .get(`/clubs/${encodeURIComponent(clubId)}/books`, booksResponseSchema)
      .then((books) => {
        if (cancelled) return;
        // REGRA 13: a ordem é a que a API devolveu (mês corrente primeiro, no
        // `listBooks`). A tela NÃO reordena — duas ordens seriam duas verdades.
        setShelf({ status: 'ready', books, error: undefined });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setShelf({ status: 'failed', books: [], error });
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubId, shelfAttempt]);

  /*
    DECISÃO E, revisada: os livros que PODEM conter hoje, no máximo dois. O
    `useMemo` é o que dá identidade estável ao array para o efeito abaixo —
    `shelf` só muda quando uma resposta chega, e `currentMonth` é string.
  */
  const candidates = useMemo(
    () =>
      shelf.status === 'ready'
        ? todayCandidates(shelf.books, currentMonth)
        : NO_CANDIDATES,
    [shelf, currentMonth],
  );

  useEffect(() => {
    if (candidates.length === 0) {
      setPlan(EMPTY_PLAN);
      return;
    }

    let cancelled = false;
    setPlan(EMPTY_PLAN);

    async function loadPlan(): Promise<void> {
      for (const [index, book] of candidates.entries()) {
        const last = index === candidates.length - 1;

        try {
          const response = await api.get(
            `/books/${encodeURIComponent(book.id)}`,
            bookWithPlanResponseSchema,
          );
          if (cancelled) return;

          const hasToday = response.planItems.some(
            (item) => item.date === today,
          );
          if (hasToday || last) {
            setPlan({ book, items: response.planItems });
            return;
          }
        } catch {
          /*
            ⚠️ SILÊNCIO DE PROPÓSITO, e é anti-culpa aplicado ao erro: o plano é
            o que alimenta o ATALHO. Se ele não vem, o atalho não aparece — e a
            estante, que veio, continua na tela. Um segundo alerta vermelho por
            causa de um atalho seria a tela cobrando por uma falha nossa.

            O laço continua para o candidato seguinte: já está no orçamento, e
            "o livro do mês está fora do ar" não é motivo para esconder o trecho
            de hoje que está no livro anterior.
          */
          if (cancelled) return;
        }
      }
    }

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [api, candidates, today]);

  const todayItem = plan.items.find((item) => item.date === today);
  const todayBook = plan.book;

  /**
   * REGRA 1 (Tarefa 20) — A ENTRADA DO CADASTRO, **só para OWNER/ADMIN**.
   *
   * Ela mora aqui e não numa tela de administração à parte porque é daqui que
   * o mês começa: o admin abre o app, não vê livro nenhum, e o botão é a
   * resposta. Para quem é `MEMBER` ela simplesmente não existe — e a ROTA
   * recusa igual (`book-form.tsx`), senão isto seria só um botão escondido.
   */
  function adminEntry(): ReactNode {
    if (activeClub === null) return null;
    if (!isClubAdmin(activeClubState.clubs, activeClub.id)) return null;

    return (
      <div className="flex">
        <Button
          onClick={() => {
            navigate(bookNewPath(activeClub.id));
          }}
        >
          {t('pages.bookForm.entry.new')}
        </Button>
      </div>
    );
  }

  function body() {
    if (activeClubState.status === 'failed') {
      return (
        <Notice
          title={messageFor(
            t,
            resolveApiError(activeClubState.error, { fields: [] }).key,
          )}
          action={
            <Button onClick={activeClubState.reload} variant="ghost">
              {t('pages.home.retry')}
            </Button>
          }
        />
      );
    }

    /*
      ⚠️ `!== 'ready'` E NÃO `=== 'loading'`, e o motivo é um FLASH medido: o
      `/me` só é disparado num efeito, então o primeiro frame de quem tem
      sessão não é `loading` — e com um `=== 'loading'` aqui aquele frame caía
      no estado vazio logo abaixo. A primeira coisa que a pessoa veria ao abrir
      o app seria "Seu clube aparece aqui", piscando.
    */
    if (activeClubState.status !== 'ready') {
      return <p className="text-sm text-muted">{t('pages.home.loading')}</p>;
    }

    // ⚠️ REGRA 12 — O PRIMEIRO LOGIN DO PROJETO. `clubs: []` não é borda.
    if (activeClub === null) {
      return (
        <Notice
          title={t('pages.home.noClubs.title')}
          description={t('pages.home.noClubs.description')}
        />
      );
    }

    if (shelf.status === 'loading' || shelf.status === 'idle') {
      return <p className="text-sm text-muted">{t('pages.home.loading')}</p>;
    }

    if (shelf.status === 'failed') {
      return (
        <Notice
          title={messageFor(
            t,
            resolveApiError(shelf.error, {
              fields: [],
              byStatus: SHELF_STATUS,
            }).key,
          )}
          action={
            isRetriable(shelf.error) ? (
              <Button
                onClick={() => {
                  // REGRA 18: repetir REFAZ a requisição — não é só limpar a
                  // mensagem.
                  setShelfAttempt((previous) => previous + 1);
                }}
                variant="ghost"
              >
                {t('pages.home.retry')}
              </Button>
            ) : undefined
          }
        />
      );
    }

    // REGRA 14: zero livros tem estado vazio PRÓPRIO, diferente do de zero
    // clubes — as duas situações pedem coisas diferentes de pessoas diferentes.
    if (shelf.books.length === 0) {
      return (
        <>
          <Notice
            title={t('pages.home.noBooks.title')}
            description={t('pages.home.noBooks.description')}
          />
          {adminEntry()}
        </>
      );
    }

    return (
      <>
        {adminEntry()}
        {/*
          REGRA 15 e DECISÃO C: o atalho aparece SÓ quando existe item do plano
          com a data de hoje. Um atalho que abre "nada" é pior que a ausência
          dele — e a ausência dele é o anti-culpa: sem trecho hoje, a home não
          diz nada sobre isso.
        */}
        {todayItem !== undefined && todayBook !== null ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-muted">
              {t('pages.home.today.heading')}
            </h2>
            <Link
              className={cx(
                'flex min-h-14 flex-col justify-center gap-0.5 rounded-control border border-line bg-surface p-4',
                'transition-colors hover:bg-surface-raised',
                FOCUS_RING,
              )}
              to={dayNotePath(todayBook.id, todayItem.id)}
            >
              {/* Conteúdo do clube, não frase da API: o tema do dia é o que o
                  admin cadastrou, e é ele que dá assunto à anotação. */}
              <span className="font-medium text-content">
                {todayItem.title}
              </span>
              {todayItem.reference !== null ? (
                <span className="text-sm text-muted">
                  {todayItem.reference}
                </span>
              ) : null}
              <span className="text-sm text-accent">
                {t('pages.home.today.write')}
              </span>
            </Link>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted">
            {t('pages.home.shelf.heading')}
          </h2>
          {/*
            ⚠️ **A ENTRADA DA BUSCA (Tarefa 29), e ela mora AQUI porque a busca
            é do CLUBE.**

            A home é a tela de clube; o acervo é de livro. Um campo de busca no
            acervo seria por livro — que é o que as quatro dimensões de recorte
            da Tarefa 28 já fazem melhor, no cliente. A pergunta desta entrada é
            "onde está esta palavra", atravessando todos os livros.

            ⚠️ **E ELA SÓ EXISTE NESTE RAMO, com a estante NÃO vazia** — de
            propósito: num clube sem livro nenhum não há acervo para buscar, e um
            link que só pode levar a "nada com esta palavra" é a mesma armadilha
            do controle que só esvazia a lista (decisão E da Tarefa 28). O ramo
            de zero livros tem estado próprio e continua sem a entrada.

            `Link` do roteador, nunca âncora crua: `<a href>` é navegação de
            DOCUMENTO e recarrega o PWA inteiro (a lição medida da Tarefa 16).
          */}
          <div className="flex">
            <Link className={TEXT_LINK_CLASS} to={searchPath()}>
              {t('pages.busca.entry')}
            </Link>
          </div>
          {/*
            ⚠️ **A ESTANTE LINKA PARA A TELA DO LIVRO** — decisão A da Tarefa
            17, e é o que faz esta lista deixar de ser decorativa. Enquanto a
            rota `/books/:bookId` não existia, os itens eram `<li>` inertes de
            propósito: um cartão que abre "página não encontrada" é pior que um
            que não faz nada.

            E o mecanismo é o `renderLink` do `ListItem`, **não** `onClick` com
            `useNavigate`. Um `<a href>` cru é navegação de DOCUMENTO e
            recarrega o PWA inteiro (perde a sessão em memória, o clube ativo, o
            rascunho do editor); um `onClick` sem `href` perde Ctrl+clique e
            "abrir em nova aba". O `Link` do react-router resolve os dois: é um
            `<a href>` de verdade E intercepta o clique normal. O acusador é
            `__tests__/book.test.tsx` — depois do clique o endereço MUDOU, o que
            em jsdom só acontece se o roteador interceptou (uma âncora crua não
            navega).
          */}
          <List aria-label={t('pages.home.shelf.label')} className="gap-1">
            {shelf.books.map((book) => (
              <ListItem
                href={bookPath(book.id)}
                key={book.id}
                renderLink={listItemRouterLink}
                subtitle={
                  book.author === null
                    ? formatClubMonth(book.month, i18n.resolvedLanguage ?? 'pt')
                    : `${book.author} · ${formatClubMonth(book.month, i18n.resolvedLanguage ?? 'pt')}`
                }
                title={book.title}
              />
            ))}
          </List>
        </section>

        {/*
          ⚠️ **O FEED VEM DEPOIS DA ESTANTE, E SÓ NESTE RAMO** (Tarefa 35).

          A ordem é a do produto: o atalho de hoje é por que a pessoa abriu o
          app, a estante é o que o clube está lendo, e o feed é o acessório
          (decisão F). Ele em cima empurraria o gesto de um toque para baixo da
          dobra num celular.

          ⚠️ **E ELE SÓ MONTA COM A ESTANTE PRONTA E NÃO VAZIA, por duas razões
          medidas.** A primeira é de conteúdo: é a estante que dá o NOME de cada
          livro do feed (medição 1 da spec), e um feed montado antes dela diria
          "Livro do clube" em toda linha por um instante. A segunda é de escopo:
          num clube sem livro nenhum não existe atividade possível — todo
          `ActivityEvent` carrega um `bookId` —, então a seção seria uma
          promessa de estado vazio embaixo de outro estado vazio. Com o feed
          aqui, as DUAS requisições novas são, por construção, incapazes de
          atrasar a estante.

          O `books` vai por prop, e não por uma segunda requisição: a home já
          tem a lista.
        */}
        <ActivityFeed
          books={shelf.books}
          clubId={activeClub.id}
          me={activeClubState.me}
        />
      </>
    );
  }

  /*
    ⚠️ A HOME USA O `Screen` DE `./chrome` desde a rodada de correção da Tarefa
    25, com `spacing="airy"` — as duas listas têm `h2` próprio e pedem mais ar.

    A versão anterior mantinha a `<section>` + `h1` locais, com o argumento de
    que uma prop de espaçamento para um chamador seria especulação. O que
    derrubou o argumento foi medível: a varredura da regra 2 confere ausência de
    `function Screen(`, e esta tela passava trivialmente — a 5ª cópia do cromo
    era INVISÍVEL para a guarda que existe para pegá-la. Agora o `h1` é do
    `Screen`, e a guarda é sobre o `<h1`, não sobre o nome de uma função.
  */
  return (
    <Screen spacing="airy" title={t('pages.home.title')}>
      {body()}
    </Screen>
  );
}
