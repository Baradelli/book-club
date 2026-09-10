import {
  type BookResponse,
  bookWithPlanResponseSchema,
  type HighlightResponse,
  highlightResponseSchema,
  highlightsResponseSchema,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import {
  Button,
  FilterBar,
  type FilterGroup,
  List,
  PersonAvatar,
  Sheet,
} from '@clube/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import {
  messageFor,
  resolveApiError,
  type StatusMessages,
} from './form-errors';
import {
  COLOR_LABEL_KEYS,
  ColorSwatch,
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from './highlight-colors';
import { highlightNewPath, highlightPath } from './paths';

/**
 * A COLEÇÃO DE GRIFOS DO LIVRO (Tarefa 25) — a primeira vez que o dono vê um
 * grifo na tela.
 *
 * ⚠️ **TELA PRÓPRIA, E NÃO UMA SEGUNDA SEÇÃO DO `book.tsx`** (decisão A): a
 * tela do livro já tinha **426 linhas de código** e era a segunda maior do app.
 *
 * ⚠️ **O NÚMERO VEM DE UM COMANDO, e é o único do projeto** — a auditoria da
 * Tarefa 25 achou **três** contagens diferentes para o mesmo `book.tsx` no
 * mesmo commit (491 na spec, 483 no relatório, 426 no revisor), e é assim que
 * um número viaja por quatro arquivos sem ninguém medir. Este é o comando, e
 * ele é o que produz todos os números desta fatia:
 *
 *   node -e "const f=require('fs').readFileSync(process.argv[1],'utf8');
 *     const s=f.replace(/[/][*][\s\S]*?[*][/]/g,'');
 *     console.log(s.split(/\n/).filter(l=>l.trim()
 *     && !l.trim().startsWith('//')).length)" <arquivo>
 *
 * Ele descarta comentário de bloco (os `{...}` de JSX incluídos), linha de
 * `//` e linha em branco. Antes desta fatia: `book.tsx` **426**. Depois:
 * **400** — o cromo saiu para `chrome.tsx`. A maior tela do app continua sendo
 * o `free-note.tsx`, com **565**, que esta fatia não tocou.
 *
 * Somar uma segunda listagem, uma paleta e uma navegação ao `book.tsx` seria o
 * oposto da lição nº 8 do MVP 1 ("divida ANTES de a tela crescer") — que é
 * exatamente o que a Tarefa 20 pagou dividindo `book-form` + `plan-editor`.
 * Juntar os dois acervos num lugar é a **Tarefa 28**, e ela precisa do filtro
 * compartilhado que a 27 entrega.
 *
 * ⚠️ **DUAS REQUISIÇÕES, E NENHUMA ROTA NOVA.** O livro dá o `clubId` (e faz o
 * corte de tenant), e o acervo é `GET /clubs/:clubId/highlights?bookId=…`. Não
 * existe `GET /highlights/:id` nem `GET /books/:bookId/highlights` — é a
 * medição da Tarefa 24, e está no docblock de `HIGHLIGHTS_PATH` em `paths.ts`.
 *
 * ⚠️ **O FILTRO POR COR É NAVEGAÇÃO, NÃO PERMISSÃO** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`. Dentro do clube não existe
 * conteúdo privado: as seis opções olham o MESMO acervo, e nenhuma esconde nada
 * de ninguém. Nunca rotular como privacidade, nunca cadeado. O que muda entre
 * "meu" e "dela" é **affordance**, não visibilidade — o grifo alheio aparece
 * inteiro e sem nenhum controle, porque isso é AUTORIA.
 *
 * ⚠️ **E O RECORTE É NO CLIENTE** (decisão C). O `listHighlights` aceita
 * `color`, mas usá-lo faria cada toque num chip virar uma ida ao servidor —
 * e é por aí que a armadilha do `%23` da Tarefa 24 voltaria (`#` é delimitador
 * de fragmento numa URL: `?color=#facc15` não chega ao servidor). Quando a
 * Tarefa 28/29 precisar de filtro de servidor, a cor vai pela opção `query` do
 * `ApiClient`, que usa `URLSearchParams` e escapa sozinha — **nunca** por
 * concatenação.
 *
 * ⚠️ **NÃO HÁ EDITOR AQUI.** Nenhum `@clube/ui/editor`: o chunk de entrada do
 * PWA continua sem TipTap (regra 20), e o acusador é o `bundle-guard.test.ts`,
 * que compila de verdade. Quem escreve é o `highlight-form.tsx`, e lá o editor
 * entra por `React.lazy()`.
 *
 * ⚠️ **E NADA AQUI COBRA NINGUÉM** (`docs/plano-clube-do-livro.md` §1): nenhum
 * contador ("3 de 30"), nenhum vermelho fora de erro real, e o acervo vazio
 * fala do que dá para fazer — nunca do que a pessoa deixou de registrar. O
 * acusador da palavra é o catálogo (nos DOIS locales); o da cor e do número é a
 * varredura de DOM de `__tests__/highlights.test.tsx`, que roda em todos os
 * estados desta tela.
 */

/**
 * REGRA 22 — o 404 desta tela tem frase própria.
 *
 * Ele cobre três coisas que, para quem não é membro, são a mesma: livro de
 * outro clube, livro arquivado e id que não existe (o corte de tenant do
 * projeto é 404 e não 403 — `CLAUDE.md`). O genérico `errors.notFound` não diz
 * o quê, e aqui o "o quê" é o livro.
 */
const BOOK_STATUS: StatusMessages = {
  404: { key: 'pages.highlights.bookUnavailable' },
};

/** Retentar um 404 é pedir outra vez a mesma negativa. */
function isRetriable(error: unknown): boolean {
  return !(error instanceof ApiError && error.status === 404);
}

type BookState =
  | { status: 'loading' }
  | { status: 'ready'; book: BookResponse }
  | { status: 'failed'; error: unknown };

const BOOK_LOADING: BookState = { status: 'loading' };

/**
 * O acervo tem estado PRÓPRIO, e não um campo do `BookState`: ele chega numa
 * segunda requisição (só possível depois de o livro dizer de qual clube é), e
 * falhar nele não pode apagar o cabeçalho que já está na tela.
 *
 * O `failed` NÃO carrega o `error`: esta tela tem uma frase própria para
 * qualquer falha do acervo e um "tentar de novo" que refaz a carga. Guardar o
 * objeto seria guardar texto da API que ninguém pode mostrar (regra 22).
 */
type ListState =
  | { status: 'loading' }
  | { status: 'ready'; highlights: readonly HighlightResponse[] }
  | { status: 'failed' };

const LIST_LOADING: ListState = { status: 'loading' };

/**
 * Quantos caracteres cabem numa linha de lista sem virar parágrafo.
 *
 * O trecho ganha mais que o comentário porque ele É o conteúdo do grifo — o
 * comentário na lista é prévia (decisão I). Os dois são derivados: o `quote` é
 * o que a pessoa digitou, e o `commentText` é derivado no backend a partir do
 * `commentDoc` (ADR 0001) exatamente para isto — montar N documentos
 * ProseMirror numa lista seria caro e ilegível (decisão F da Tarefa 19).
 */
const QUOTE_EXCERPT_LENGTH = 200;
const COMMENT_EXCERPT_LENGTH = 120;

function excerptOf(text: string, max: number): string {
  const clean = text.trim().replace(/\s+/gu, ' ');
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/**
 * O `value` do chip "todas as cores" (Tarefa 27).
 *
 * ⚠️ Ele não pode colidir com uma cor da paleta, e não colide **por
 * construção**: toda `HighlightColor` é um hex de sete caracteres começando com
 * `#` (`shared/src/highlight-color.ts`), então `colorFromChipValue` devolver
 * `null` para esta string é a mesma coisa que devolver `null` para qualquer
 * valor que não seja da paleta — e "não é da paleta" é exatamente "todas".
 */
const EVERY_COLOR = 'all';

/**
 * O `value` do chip de volta ao recorte — `null` é "todas".
 *
 * ⚠️ **É o `find` da lista de `@clube/shared` que estreita, não um `as`.** O
 * `FilterOption.value` é `string` de propósito (o `FilterBar` é agnóstico de
 * dimensão — decisão G da Tarefa 27), e a tela é a dona do vocabulário: um
 * valor que não está na paleta não vira cor, vira "todas".
 */
function colorFromChipValue(value: string): HighlightColor | null {
  return HIGHLIGHT_COLORS.find((candidate) => candidate === value) ?? null;
}

/**
 * REGRA 7 — o recorte por cor, sobre a lista já carregada. `null` é "todas".
 */
function scopedHighlights(
  highlights: readonly HighlightResponse[],
  color: HighlightColor | null,
): readonly HighlightResponse[] {
  if (color === null) return highlights;
  return highlights.filter((highlight) => highlight.color === color);
}

export function HighlightsPage() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { error: meError, me, reload, status: meStatus } = useActiveClub();
  const navigate = useNavigate();
  const { bookId } = useParams();

  const [book, setBook] = useState<BookState>(BOOK_LOADING);
  const [bookAttempt, setBookAttempt] = useState(0);
  const [list, setList] = useState<ListState>(LIST_LOADING);
  /**
   * O acervo tem o PRÓPRIO contador de tentativas — a lição medida do
   * `book.tsx`: reaproveitar o do livro fazia o "tentar de novo" do acervo
   * derrubar o cabeçalho e disparar requisições a mais. Cada carga com o seu
   * gatilho.
   */
  const [listAttempt, setListAttempt] = useState(0);
  const [color, setColor] = useState<HighlightColor | null>(null);
  /** O id do grifo que a confirmação de arquivamento está segurando. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [archiveFailed, setArchiveFailed] = useState(false);

  /**
   * A carga espera o `/me`: sem saber quem sou, "meu × dela" é chute — e a
   * armadilha nomeada da Tarefa 18 é justamente tratar `me === null` como "não
   * sou ninguém", o que mostraria os MEUS grifos como alheios, em silêncio.
   */
  const myId = me === null ? null : me.id;
  const bookIdOfPath = bookId ?? '';

  useEffect(() => {
    if (myId === null) return;

    let cancelled = false;
    setBook(BOOK_LOADING);

    void api
      .get(
        `/books/${encodeURIComponent(bookIdOfPath)}`,
        bookWithPlanResponseSchema,
      )
      .then((data) => {
        if (cancelled) return;
        setBook({ status: 'ready', book: data.book });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBook({ status: 'failed', error });
      });

    return () => {
      // A resposta velha chega e é DESCARTADA: sem isso, quem troca de livro
      // vê o primeiro sobrescrever o segundo.
      cancelled = true;
    };
  }, [api, bookIdOfPath, myId, bookAttempt]);

  /*
    O acervo depende do CLUBE DO LIVRO — `book.clubId`, e não o clube ativo do
    cabeçalho: o dono do livro é quem manda, e é assim que abrir o link de um
    livro de outro clube consulta o clube certo (o backend faz o corte de
    tenant contra o `Membership`; sem membership, 404).
  */
  const clubOfBook = book.status === 'ready' ? book.book.clubId : null;
  const loadedBookId = book.status === 'ready' ? book.book.id : null;

  useEffect(() => {
    if (clubOfBook === null || loadedBookId === null) return;

    let cancelled = false;
    setList(LIST_LOADING);

    void api
      .get(
        `/clubs/${encodeURIComponent(clubOfBook)}/highlights`,
        highlightsResponseSchema,
        // ⚠️ DECISÃO D: a query sai pela opção `query` do cliente, que usa
        // `URLSearchParams` — nunca por concatenação.
        { query: { bookId: loadedBookId } },
      )
      .then((highlights) => {
        if (cancelled) return;
        setList({ status: 'ready', highlights });
      })
      .catch(() => {
        if (cancelled) return;
        setList({ status: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubOfBook, loadedBookId, listAttempt]);

  /**
   * REGRA 10 — arquivar de verdade, depois da confirmação.
   *
   * ⚠️ **O grifo sai de UMA fonte, e é isso que o impede de ressuscitar.** A
   * tela não guarda "o acervo" e "o recorte" em dois estados: o recorte é
   * derivado no render (`scopedHighlights`), então tirar a linha do acervo a
   * tira de todos os recortes. Duas cópias fariam o grifo arquivado voltar no
   * primeiro toque de chip.
   */
  async function archive(highlightId: string): Promise<void> {
    setArchiveFailed(false);
    try {
      // É soft delete no backend, e a resposta é a linha atualizada — que esta
      // tela não precisa, porque a linha vai embora.
      await api.delete(
        `/highlights/${encodeURIComponent(highlightId)}`,
        highlightResponseSchema,
      );
      setList((previous) =>
        previous.status === 'ready'
          ? {
              status: 'ready',
              highlights: previous.highlights.filter(
                (highlight) => highlight.id !== highlightId,
              ),
            }
          : previous,
      );
      setConfirming(null);
    } catch {
      // Nada da API na tela: a frase é do catálogo, e o grifo continua aqui.
      setArchiveFailed(true);
      setConfirming(null);
    }
  }

  /** Uma linha do acervo — regras 4, 5, 6 e 9. */
  function row(highlight: HighlightResponse): ReactNode {
    const mine = highlight.userId === myId;
    const comment = excerptOf(highlight.commentText, COMMENT_EXCERPT_LENGTH);

    return (
      <li className="flex" key={highlight.id}>
        <div className="flex w-full flex-col gap-2 rounded-control border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {/*
              REGRA 4 — A COR TEM NOME, e o nome é texto de verdade.
              A amostra é `aria-hidden` (o nome está ao lado); quem não
              distingue as cinco cores depende do nome, e cor como único
              portador de informação é o defeito que ninguém vê olhando.
            */}
            <ColorSwatch color={highlight.color} />
            <span>{t(COLOR_LABEL_KEYS[highlight.color])}</span>
            {/*
              REGRA 5 — SEM PÁGINA É SILÊNCIO. Nem "página null", nem o rótulo
              órfão: a ausência não se anuncia (é o anti-culpa aplicado ao
              espaço vazio).
            */}
            {highlight.page !== null ? (
              <span>
                {t('pages.highlights.item.page', { number: highlight.page })}
              </span>
            ) : null}
            {highlight.reference !== null ? (
              <span>{highlight.reference}</span>
            ) : null}
            {/*
              REGRA 4 — autoria em TEXTO, não só na cor do avatar. O avatar vai
              sem `label` de propósito: o nome já está escrito ao lado, e um
              `aria-label` igual faria o leitor de tela repetir. E o `name` é o
              do `me` só quando o autor é VOCÊ — nunca o `userId`, que viraria
              uma inicial com cara de inicial e de ninguém (medido na 17).
            */}
            <PersonAvatar
              id={highlight.userId}
              name={mine ? (me?.name ?? null) : null}
              size="sm"
            />
            <span>
              {t(
                mine
                  ? 'pages.highlights.item.author.you'
                  : 'pages.highlights.item.author.other',
              )}
            </span>
          </div>

          <p className="text-content">
            {excerptOf(highlight.quote, QUOTE_EXCERPT_LENGTH)}
          </p>

          {/*
            REGRA 6 — SEM COMENTÁRIO, NENHUMA ÁREA DE COMENTÁRIO.

            ⚠️ A guarda é a PRÉVIA VAZIA, e não `commentDoc === null`, e a razão
            é que ela fecha os dois casos com um dono só: `commentText` é
            DERIVADO do `commentDoc` no backend (ADR 0001), então `null` no
            documento implica `''` no texto — e o documento que EXISTE e não diz
            nada (o parágrafo em branco que o editor emite) também cai aqui.
            Uma condição sobre o `commentDoc` seria uma segunda dona da mesma
            regra, e a metade dela que ninguém consegue acusar: não existe
            resposta da API com `commentDoc: null` e `commentText` cheio.
          */}
          {comment === '' ? null : (
            <p className="text-sm text-muted">{comment}</p>
          )}

          {/*
            REGRA 9 — SÓ O MEU GRIFO TEM AS AÇÕES.

            O alheio aparece INTEIRO e sem affordance nenhuma: nem link de
            correção, nem arquivar. Isso é AUTORIA, não privacidade — o trecho
            está aqui porque dentro do clube não existe conteúdo privado
            (ADR 0002), e o filtro nunca é rotulado como permissão.
          */}
          {mine ? (
            <div className="flex flex-wrap items-center gap-3">
              {/*
                ⚠️ `Link` do roteador, NUNCA âncora crua: `<a href>` é
                navegação de DOCUMENTO e recarrega o PWA inteiro (perde a
                sessão em memória, o clube ativo, o rascunho do editor) — a
                lição medida da Tarefa 16.
              */}
              <Link
                className={TEXT_LINK_CLASS}
                to={highlightPath(bookIdOfPath, highlight.id)}
              >
                {t('pages.highlights.item.edit')}
              </Link>
              <Button
                onClick={() => {
                  setConfirming(highlight.id);
                }}
                variant="ghost"
              >
                {t('pages.highlights.item.archive')}
              </Button>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  function collection(): ReactNode {
    if (list.status === 'loading') {
      return (
        <p className="text-sm text-muted">{t('pages.highlights.loading')}</p>
      );
    }

    if (list.status === 'failed') {
      return (
        <Notice
          action={
            <Button
              onClick={() => {
                setListAttempt((previous) => previous + 1);
              }}
              variant="ghost"
            >
              {t('pages.highlights.retry')}
            </Button>
          }
          title={t('pages.highlights.unavailable')}
        />
      );
    }

    const all = list.highlights;
    const visible = scopedHighlights(all, color);

    /**
     * ⚠️ **UMA DIMENSÃO, NO COMPONENTE COMPARTILHADO** (Tarefa 27, regra 7).
     *
     * Esta tela tinha a sua própria composição de chips, e o `book.tsx` tinha
     * outra — duas cópias da mesma acessibilidade (o `role="group"`, o
     * `aria-label`, o `aria-pressed`), que é como as duas saem de sincronia no
     * primeiro conserto. Agora o grupo é do `FilterBar`, e o que sobra aqui é
     * **o vocabulário**: `packages/ui` não traduz (decisão B da Tarefa 13),
     * então o rótulo de cada chip chega pronto pelo `t()`.
     *
     * ⚠️ **E A COR NUNCA É O ÚNICO PORTADOR** (regra 4 da Tarefa 25): a amostra
     * vai no slot `start` e o **nome** vai no `label`. Um chip só-com-bolinha
     * não diria nada a quem não distingue as cinco cores — e o
     * `FilterOption.label` é obrigatório justamente para isso não compilar.
     */
    const colorGroup: FilterGroup = {
      id: 'color',
      label: t('pages.highlights.filters.label'),
      options: [
        /* O estado neutro é do CHAMADOR (decisão H): o componente não sabe que
           existe um "todas", e o rótulo dele é texto que só a tela traduz. */
        { value: EVERY_COLOR, label: t('pages.highlights.filters.all') },
        /* A ordem é a de `@clube/shared` — a mesma da barra do editor. */
        ...HIGHLIGHT_COLORS.map((candidate) => ({
          value: candidate,
          label: t(COLOR_LABEL_KEYS[candidate]),
          start: <ColorSwatch color={candidate} />,
        })),
      ],
      selected: color ?? EVERY_COLOR,
      onSelect: (option) => {
        // Controlado (decisão A): a barra devolve a opção, e quem muda o
        // estado é a tela.
        setColor(colorFromChipValue(option.value));
      },
    };

    return (
      <>
        {/*
          REGRA 7: os seis chips, com `aria-pressed` — e eles só existem se
          houver acervo. Filtrar o vazio é oferecer uma escolha que não muda
          nada (a lição do `book.tsx`).
        */}
        {all.length === 0 ? null : <FilterBar groups={[colorGroup]} />}

        {visible.length === 0 ? (
          /*
            REGRA 8: o vazio não cobra ninguém, e o vazio do FILTRO tem frase
            própria — "registre o primeiro" seria mentira embaixo de um recorte
            que só escondeu o que já existe.
          */
          <Notice
            description={
              all.length === 0
                ? t('pages.highlights.empty.description')
                : undefined
            }
            title={
              all.length === 0
                ? t('pages.highlights.empty.title')
                : t('pages.highlights.empty.filtered')
            }
          />
        ) : (
          <List aria-label={t('pages.highlights.label')} className="gap-2">
            {/* A ordem é a que a API devolveu (`createdAt` decrescente). A
                tela NÃO reordena — duas ordens seriam duas verdades. */}
            {visible.map((highlight) => row(highlight))}
          </List>
        )}
      </>
    );
  }

  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={
            <Button onClick={reload} variant="ghost">
              {t('pages.highlights.retry')}
            </Button>
          }
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    if (book.status === 'loading' || me === null) {
      return (
        <p className="text-sm text-muted">{t('pages.highlights.loading')}</p>
      );
    }

    if (book.status === 'failed') {
      return (
        <Notice
          action={
            isRetriable(book.error) ? (
              <Button
                onClick={() => {
                  setBookAttempt((previous) => previous + 1);
                }}
                variant="ghost"
              >
                {t('pages.highlights.retry')}
              </Button>
            ) : undefined
          }
          title={messageFor(
            t,
            resolveApiError(book.error, {
              fields: [],
              byStatus: BOOK_STATUS,
            }).key,
          )}
        />
      );
    }

    return (
      <>
        {/* O livro é o CONTEXTO: o nome da tela é "Grifos", e o título do
            livro diz de qual acervo se trata. */}
        <p className="text-sm text-muted">{book.book.title}</p>

        {/*
          REGRA 19: registrar é EXPLÍCITO, e o botão fica FORA do acervo de
          propósito — ele existe mesmo quando a lista não carregou, porque
          registrar não depende de conseguir ler.
        */}
        <div className="flex">
          <Button
            onClick={() => {
              navigate(highlightNewPath(book.book.id));
            }}
          >
            {t('pages.highlights.new')}
          </Button>
        </div>

        {archiveFailed ? (
          <p className="text-sm text-danger" role="alert">
            {t('pages.highlights.archive.failed')}
          </p>
        ) : null}

        {collection()}

        {/*
          REGRA 10 — ARQUIVAR PEDE CONFIRMAÇÃO, e cancelar não chama a API.

          Fechado, o `Sheet` NÃO está no DOM (regra 15 da Tarefa 13), então o
          "Cancelar" não tem como disparar nada — e o foco volta para o botão
          que o abriu. É destrutivo do ponto de vista de quem escreveu, mesmo
          sendo soft delete (decisão F).
        */}
        <Sheet
          closeLabel={t('pages.highlights.archive.close')}
          onClose={() => {
            setConfirming(null);
          }}
          open={confirming !== null}
          title={t('pages.highlights.archive.title')}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {t('pages.highlights.archive.description')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  setConfirming(null);
                }}
                variant="ghost"
              >
                {t('pages.highlights.archive.cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (confirming !== null) void archive(confirming);
                }}
              >
                {t('pages.highlights.archive.confirm')}
              </Button>
            </div>
          </div>
        </Sheet>
      </>
    );
  }

  return <Screen title={t('pages.highlights.title')}>{body()}</Screen>;
}
