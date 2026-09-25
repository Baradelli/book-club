import {
  type BookResponse,
  booksResponseSchema,
  bookWithPlanResponseSchema,
  localDay,
  localTimeZone,
  type PlanItemResponse,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import {
  Button,
  cx,
  Eyebrow,
  FOCUS_RING,
  List,
  ListItem,
  MarginRail,
} from '@clube/ui';
import { ArrowRight, Plus } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import { ActivityFeed } from './activity-feed';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import { formatClubMonth } from './club-month';
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
 * Sem trecho de leitura hoje, ~~esta tela~~ **este arquivo não cobra nada**: nem
 * "você está atrasado", nem "faltam 3 dias", nem badge de pendência, nem vermelho
 * de atraso. `text-danger` e o fundo de `--danger` não aparecem em lugar nenhum deste
 * arquivo, e o acusador é a varredura de DOM (texto **e** atributos) de
 * `__tests__/home.test.tsx` — o mesmo espírito da guarda do ADR 0002 no
 * `FilterChip`.
 *
 * ⚠️ **"ESTA TELA" VIROU FALSO NA TAREFA 38c, E A TROCA POR "ESTE ARQUIVO" NÃO É
 * ESCAPISMO — É O QUE A GUARDA MEDE.** A home renderiza o `<ActivityFeed>`, que
 * renderiza a `<StreakBar>`: quem tem corrente viva e ainda não leu hoje **lê
 * uma frase de perda nesta tela**. Foi pedido pelo dono e reafirmado com a
 * objeção e a medição na mão → `docs/adr/0010-corrente-de-leitura-visivel.md`.
 * ✅ **O que a guarda continua cobrindo de verdade:** a `expectNoGuilt` roda em
 * todos os estados desta suíte, e neles a corrente vem **vazia** — qualquer
 * cobrança que nasça no corpo da home continua ficando vermelha. ⚠️ **O que ela
 * deixou de cobrir, de propósito:** os estados de corrente não a chamam, porque
 * chamá-la sobre a frase que o dono pediu seria escrever um teste para falhar.
 * A isenção é **nominal, por chave, e pinada por igualdade exata** na
 * `GUILT_TERMS` (`STREAK_KEYS`): ampliá-la fica vermelho.
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

/*
  ⚠️ **`formatClubMonth` SE MUDOU PARA `./club-month` na rodada de correção da
  Tarefa 44**, e o docblock dele foi junto. Motivo: a tela do livro passou a
  precisar do mesmo mês por extenso na linha de mono do cabeçalho, e duas
  cópias divergiriam na primeira correção (§7.1). Esta tela não mudou em mais
  nada — o import é a única linha da fatia daqui.
*/

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

  /** Quem manda no livro e no plano — o guarda dos DOIS caminhos de cadastro. */
  function isAdminHere(): boolean {
    return (
      activeClub !== null && isClubAdmin(activeClubState.clubs, activeClub.id)
    );
  }

  /**
   * REGRA 1 (Tarefa 20) — A ENTRADA DO CADASTRO **NO ESTADO VAZIO**, só para
   * OWNER/ADMIN.
   *
   * Ela mora aqui e não numa tela de administração à parte porque é daqui que
   * o mês começa: o admin abre o app, não vê livro nenhum, e o botão é a
   * resposta. Para quem é `MEMBER` ela simplesmente não existe — e a ROTA
   * recusa igual (`book-form.tsx`), senão isto seria só um botão escondido.
   *
   * ⚠️⚠️ **ESTE BOTÃO FICA BOTÃO, E É A DECISÃO A DA TAREFA 45.** A fatia desceu
   * a entrada do estado NORMAL para o rodapé (ver `adminFooterLink` abaixo),
   * porque lá ela empurrava para baixo o gesto que é a razão de o app existir.
   * Aqui não há gesto nenhum para empurrar: a estante está vazia, e o parágrafo
   * acima é literalmente a descrição deste botão. Descer os dois destruiria o
   * estado que este docblock defende — e o acusador do par são os dois `it()`
   * `(a)` e `(b)` de `home.test.tsx › o Início da Tarefa 45`.
   */
  function adminEntry(): ReactNode {
    if (activeClub === null || !isAdminHere()) return null;

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

  /**
   * ⚠️ **A MESMA ENTRADA, NO RODAPÉ — decisão A da Tarefa 45.**
   *
   * `Inicio.dc.html:133-136` a desenha como o ÚLTIMO elemento do `<main>`, e
   * `InicioDesktop.dc.html:98-101` a desenha no pé da coluna de 680px, depois
   * de um `flex-grow:1` — nos dois casos um link de rótulo (mono, maiúscula,
   * `--text-muted`) com um `+` de 14px, e **não** um botão cheio.
   *
   * ⚠️ **O ARTBOARD DE DESKTOP A DESENHA, SIM** — a spec da fatia dizia que
   * não, e a nota nº 1 da tarefa corrige a medição. Ela fica nas duas larguras.
   *
   * ⚠️ **O GUARDA DE PAPEL VEM JUNTO (regra 9).** Um link de rodapé sem
   * `isClubAdmin` seria o mesmo "botão escondido" que o docblock acima recusa
   * por escrito — e a rota continua recusando igual. O acusador é
   * `home.test.tsx › ⚠️ não mostra o cadastro — nem link, nem botão — para quem
   * é MEMBER`.
   *
   * ⚠️ **`Link` DO ROTEADOR, e não o `useNavigate` do botão que ele substitui:**
   * um link de verdade tem endereço, Ctrl+clique e "abrir em nova aba"; a
   * navegação continua sendo do PWA, sem recarregar o shell.
   */
  function adminFooterLink(): ReactNode {
    if (activeClub === null || !isAdminHere()) return null;

    return (
      <div className="flex">
        <Link
          className={cx(
            /*
              `gap:9px` e o ícone de 14px são de `Inicio.dc.html:133-134`;
              `py-1.5` são os 6px de recuo vertical da mesma linha (o desktop
              usa 10px em cima e 24px embaixo — divergência declarada, do
              tamanho de um recuo).
            */
            'inline-flex min-h-11 items-center gap-2 rounded-full border border-dashed border-line-strong px-4 text-accent transition-colors hover:bg-surface',
            FOCUS_RING,
          )}
          to={bookNewPath(activeClub.id)}
        >
          {/*
            ⚠️ **COMPONENTE DO `lucide-react`, NUNCA `<svg>` inline** — é o que
            o `adr-0002-iconography.test.ts` cobra. Ele troca de lugar com o
            `Flame` que a `StreakBar` deixou de importar nesta mesma fatia.
          */}
          <Plus aria-hidden="true" className="size-4 shrink-0" />
          <span className="text-sm font-semibold">
            {t('pages.bookForm.entry.new')}
          </span>
        </Link>
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
        {/*
          REGRA 15 e DECISÃO C: o atalho aparece SÓ quando existe item do plano
          com a data de hoje. Um atalho que abre "nada" é pior que a ausência
          dele — e a ausência dele é o anti-culpa: sem trecho hoje, a home não
          diz nada sobre isso.

          ⚠️ **E ELE É O PRIMEIRO DA TELA DESDE A TAREFA 45.** Até aqui a
          entrada de cadastro do admin vinha acima dele — uma ação de
          administração empurrando para baixo o gesto que é a razão de o app
          existir. Ela desceu para o rodapé (`adminFooterLink`).
        */}
        {todayItem !== undefined && todayBook !== null ? (
          <section className="flex flex-col gap-2">
            {/*
              ⚠️⚠️ **"Dia 11 de 30" — A POSIÇÃO NO PLANO, E ELA É A ÚNICA FRASE
              DO APP ISENTA DA VARREDURA DE PLACAR.**

              `Inicio.dc.html:41` e `InicioDesktop.dc.html:42` a desenham em
              dourado, na linha de mono que abre o bloco de hoje. Ela diz ONDE a
              leitura de hoje está no mês; o número **não muda com o que
              ninguém fez**, e é por isso que não é placar (decisão do dono,
              `docs/BACKLOG.md`). A isenção é NOMINAL, por chave, em
              `COUNTER_EXEMPT_KEYS` — e os estados desta tela que a mostram
              varrem com `expectNoGuiltWithPlanPosition()`, que exige que a
              subtração aconteça de verdade.

              ⚠️ **A CHAVE É A DO PLANO, e ela é reusada de propósito:**
              `pages.book.plan.dayOfPlan` tem dono declarado no próprio
              catálogo (*"o Início e a tela do dia a LEEM deste namespace, sem
              duplicar"*). Uma segunda frase dizendo a mesma posição divergiria
              na primeira correção — o defeito que o `GUILT_TERMS` viveu até a
              Tarefa 19.

              ⚠️ **ELA SÓ EXISTE DENTRO DESTE RAMO**, que é o que tem dia de
              hoje. Um "Dia 0 de 30" num plano sem hoje seria o vazio anunciado
              que o §1 do plano proíbe — e seria um contador de verdade
              entrando pela porta da isenção. O acusador do lado inverso é
              `⚠️ não anuncia posição nenhuma quando não há leitura de hoje`.

              ⚠️ **DIVERGÊNCIA DECLARADA:** o canvas emparelha a posição com a
              DATA por extenso ("Sexta-feira · 18 set 2026", `:40`), e a data
              não entrou — ela pediria um formatador de `Intl` novo e não está
              na Definição de pronto desta fatia. A posição fica ao lado do
              rótulo da seção, que é dourado no canvas (`:50`) como ela.
            */}
            <div className="flex items-baseline justify-between gap-3">
              <h2>
                <Eyebrow tone="gold">{t('pages.home.today.heading')}</Eyebrow>
              </h2>
              <Eyebrow className="shrink-0" tone="gold">
                {t('pages.book.plan.dayOfPlan', {
                  number: plan.items.indexOf(todayItem) + 1,
                  total: plan.items.length,
                })}
              </Eyebrow>
            </div>
            <Link
              className={cx(
                'group relative flex min-h-14 flex-col justify-center gap-1 overflow-hidden rounded-card bg-accent p-5 text-accent-fg shadow-card',
                'transition-colors hover:bg-accent-hover',
                FOCUS_RING,
              )}
              to={dayNotePath(todayBook.id, todayItem.id)}
            >
              {/* Conteúdo do clube, não frase da API: o tema do dia é o que o
                  admin cadastrou, e é ele que dá assunto à anotação. */}
              <span className="font-reading text-[22px] font-semibold leading-tight tracking-[-0.02em] text-balance">
                {todayItem.title}
              </span>
              {todayItem.reference !== null ? (
                <span className="text-sm opacity-80">
                  {todayItem.reference}
                </span>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full bg-accent-fg/15 px-3.5 py-1.5 text-sm font-semibold">
                {t('pages.home.today.write')}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                  focusable="false"
                />
              </span>
            </Link>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          {/*
            O rótulo de seção em monoespaçada maiúscula — `Inicio.dc.html:66`,
            `--text-muted`, que é o tom `muted` do `Eyebrow`. O da leitura de
            hoje é dourado (`:50`) porque é o que é de HOJE; este só nomeia uma
            seção (decisão I da Tarefa 41b).
          */}
          <h2>
            <Eyebrow>{t('pages.home.shelf.heading')}</Eyebrow>
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
          <List appearance="grouped" aria-label={t('pages.home.shelf.label')}>
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

        {adminFooterLink()}
      </>
    );
  }

  /**
   * ⚠️ **A MARGEM DA HOME — decisão C da Tarefa 45.**
   *
   * `InicioDesktop.dc.html:104` é a coluna de 320px com `border-left` e
   * `padding-left:40px`, e ela contém o rótulo (`:105`), as correntes
   * (`:107-118`) e o feed (`:120-149`) — as três coisas que até aqui viviam no
   * fim do corpo. Quem tem as medidas e o corte é o `MarginRail` de
   * `@clube/ui`; ritmo de conteúdo é da tela (o componente não fixa nenhum).
   *
   * ⚠️ **O RITMO DE 18px NÃO ESTÁ AQUI, e a primeira entrega desta fatia dizia
   * que estava.** Medido na auditoria: o `MarginRail` é `flex flex-col` e esta
   * margem tem **UM** filho (o `ActivityFeed`), então um `gap` nela não espaça
   * coisa nenhuma — quem espaça o rótulo, a corrente e as linhas é o
   * `<section>` de `activity-feed.tsx`, que é onde os três moram. A classe
   * morta saiu em vez de a prosa ganhar uma ressalva: código que não faz nada
   * e um docblock que diz que faz é a combinação que o próximo agente copia.
   *
   * ⚠️ **NO CELULAR NADA DESAPARECE.** O `MarginRail` é montado **sempre**: o
   * que muda abaixo de 1120px é que ele perde o filete e a largura e desce para
   * o fluxo. É media query e só — nenhuma ramificação por dispositivo (decisão
   * G da 41b). O acusador da VISIBILIDADE, e não da presença no DOM, é
   * `home.test.tsx › ⚠️ põe corrente e feed na MARGEM, e não os esconde no
   * celular`: um `hidden` cru em qualquer elo do caminho fica vermelho, com
   * fronteira de palavra para `min-[1120px]:hidden` não dar falso verde.
   *
   * ⚠️ **AS CONDIÇÕES DE MONTAGEM SÃO AS MESMAS DE ANTES** (Tarefa 35, decisão
   * F), e é por isso que elas se repetem aqui: é a estante que dá o NOME de
   * cada livro do feed, e num clube sem livro nenhum não existe atividade
   * possível — todo `ActivityEvent` carrega um `bookId`. Fora desses casos o
   * `rail` é **ausente**, não vazio: um `<aside>` que nascesse sempre
   * desenharia um filete vertical solto e um terço de tela em branco no estado
   * de carregamento (é o que o `ScreenProps.rail` documenta).
   *
   * ⚠️ **SEM `aria-label` NA REGIÃO**, que o `MarginRail` declara opcional:
   * nomeá-la pediria uma chave NOVA, e nenhuma nasce nesta fatia. O que se
   * perde é o atalho de pular a região, não informação — o rótulo da seção está
   * em texto dentro dela. É o mesmo registro das Tarefas 43 e 44.
   */
  function rail(): ReactNode {
    if (activeClub === null) return undefined;
    if (shelf.status !== 'ready' || shelf.books.length === 0) return undefined;

    return (
      <MarginRail className="pt-4 min-[1120px]:pt-0">
        {/*
          O `books` vai por prop, e não por uma segunda requisição: a home já
          tem a lista.
        */}
        <ActivityFeed
          books={shelf.books}
          clubId={activeClub.id}
          me={activeClubState.me}
        />
      </MarginRail>
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
    <Screen rail={rail()} spacing="airy" title={t('pages.home.title')}>
      {body()}
    </Screen>
  );
}
