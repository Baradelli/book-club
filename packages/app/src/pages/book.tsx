import {
  type BookWithPlanResponse,
  bookWithPlanResponseSchema,
  isCalendarDay,
  localDay,
  localTimeZone,
  type NoteResponse,
  notesResponseSchema,
  type PlanItemResponse,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import {
  Button,
  cx,
  FilterChip,
  FOCUS_RING,
  List,
  ListItem,
  PersonAvatar,
} from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import { Notice, Screen } from './chrome';
import { dayNotePath } from './day-note';
import {
  messageFor,
  type MessageKey,
  resolveApiError,
  type StatusMessages,
} from './form-errors';
import { freeNoteNewPath, freeNotePath } from './free-note';
import { bookEditPath, highlightsPath, isClubAdmin } from './paths';

/**
 * A TELA DO LIVRO — o mês inteiro, dia por dia.
 *
 * Ela é **panorama e navegação**, não escrita: quem vai escrever chega pelo
 * atalho da home ou tocando num dia daqui. **Uma requisição e uma lista** — o
 * `GET /books/:bookId` já devolve `{ book, planItems, writers }`, então não há
 * segundo pedido, nem agregação no cliente, nem estado derivado guardado.
 *
 * ⚠️ **O PRINCÍPIO ANTI-CULPA É REGRA TESTADA AQUI** (regra 5 desta tarefa,
 * `docs/plano-clube-do-livro.md` §1). Esta é a tela onde a cobrança nasceria
 * naturalmente: trinta dias em lista, e a maioria deles sem anotação. Então:
 *
 * - **nada de vermelho.** Nenhum `text-danger`/`bg-danger`, nenhuma cor de
 *   valor arbitrário (`[#…`), nenhum `style` com `--clube-danger`;
 * - **nada de contador.** Nem "3 de 30 dias", nem "+2" ao lado dos avatares,
 *   nem número nenhum derivado de dado. A sobreposição de autoria diz **quem**
 *   escreveu e **nunca quantos** — isso seria placar, e o §1 proíbe comparação
 *   (→ `docs/adr/0002-visibilidade-total-no-clube.md`);
 * - **só hoje é destacado.** Destacar "atrasados" é cobrança desenhada;
 *   destacar o futuro não serve para nada.
 *
 * O acusador da palavra é o catálogo (`shared/src/locales/__tests__/
 * anti-guilt.test.ts`, os DOIS locales); o acusador da **cor** e do **número**
 * é a varredura de DOM de `__tests__/book.test.tsx`, que roda em **todos** os
 * estados desta tela.
 *
 * ⚠️ **E NÃO HÁ EDITOR AQUI.** Nenhum `@clube/ui/editor`: o bundle do PWA
 * continua sem TipTap (regra 16), e o acusador é o `bundle-guard.test.ts`, que
 * compila de verdade.
 */

/**
 * A rota e o endereço da tela do livro.
 *
 * ⚠️ **A DEFINIÇÃO MUDOU DE CASA para `./paths`, e a reexportação fica.** O
 * `free-note.tsx` importa `bookPath` daqui e está fechado desde a Tarefa 19; o
 * `book-form.tsx` precisa do mesmo endereço para navegar depois de salvar. Com
 * a definição num módulo sem dependências, esta tela e o formulário deixam de
 * importar um ao outro — e o ciclo que a auditoria da Tarefa 20 mediu (uma
 * `const` de módulo de um lendo a do outro derruba a rota no import) não existe
 * mais.
 */
export { BOOK_PATH, bookPath } from './paths';

/**
 * REGRA 9 — O 404 DESTA TELA TEM FRASE PRÓPRIA.
 *
 * Ele cobre três coisas que, para quem não é membro, são a mesma: livro de
 * outro clube, livro arquivado, e id que não existe. O corte de tenant do
 * projeto é 404 e não 403 (`CLAUDE.md`), de propósito — não vazamos a
 * existência do recurso. O genérico `errors.notFound` ("Não encontramos o que
 * você procurava") não diz o quê, e aqui o "o quê" é o livro do mês.
 */
const BOOK_STATUS: StatusMessages = {
  404: { key: 'pages.book.bookUnavailable' },
};

/**
 * Retentar um 404 é pedir outra vez a mesma negativa: o livro não volta porque
 * a pessoa apertou um botão. Rede, 500 e corpo fora do contrato, sim (regra
 * 10).
 */
function isRetriable(error: unknown): boolean {
  return !(error instanceof ApiError && error.status === 404);
}

/**
 * União discriminada, e não um objeto com `data: … | null`: assim o ramo
 * "pronto e sem dado" — que é impossível — não existe para o compilador, e a
 * tela não ganha um `if` inalcançável para satisfazê-lo.
 */
type BookState =
  | { status: 'loading' }
  | { status: 'ready'; data: BookWithPlanResponse }
  | { status: 'failed'; error: unknown };

/** Nasce em `loading`: o efeito dispara no primeiro frame e não há estado ocioso. */
const LOADING: BookState = { status: 'loading' };

/**
 * `"2026-09-05"` → "sex., 5 de set.", no idioma da tela.
 *
 * `isCalendarDay` antes de formatar, e não é zelo: o `planItemResponseSchema`
 * declara `date: z.string()` (não o dia refinado), então uma linha malformada
 * chegaria aqui, faria um `Invalid Date` e o `Intl` **lançaria** — apagando a
 * tela inteira por causa de um dia do plano. Sem formato canônico, mostra o
 * valor cru: feio é melhor que branco.
 *
 * `timeZone: 'UTC'` porque o instante montado é meia-noite UTC do próprio dia:
 * formatar no fuso local devolveria o dia ANTERIOR em qualquer fuso negativo —
 * o bug de um dia que o `localDay` existe para não cometer.
 */
function formatPlanDay(date: string, locale: string): string {
  if (!isCalendarDay(date)) return date;
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/** O dia e o trecho, na mesma linha — o mesmo formato da estante da home. */
function subtitleFor(item: PlanItemResponse, locale: string): string {
  const day = formatPlanDay(item.date, locale);
  return item.reference === null ? day : `${day} · ${item.reference}`;
}

/**
 * `writers` → `planItemId` → autores.
 *
 * A resposta traz **só os dias que têm nota** (o front sobrepõe no plano que já
 * tem), então a ausência da chave é o caso comum, não uma falha.
 *
 * ⚠️ **E ELA TRAZ SÓ `userId` — NENHUM NOME.** Daí o `name={null}` no
 * `PersonAvatar` do plano, que é MELHOR que passar o `userId`: com o id, o
 * componente extrai a primeira letra do UUID e desenha um "F" ou um "C" —
 * uma inicial que **tem cara de inicial e não é de ninguém**. Medido na
 * revisão desta fatia. Comunicar errado é pior que não comunicar, e `null`
 * cai no glifo neutro que a Tarefa 13 pôs ali exatamente para "sem nome"
 * (regra 29), escolhido para não parecer cobrança. A **cor** continua vindo
 * do `id`, então duas pessoas seguem distinguíveis entre si; o que falta é
 * saber QUAL delas é você.
 *
 * ⚠️ **E A TAREFA 18 PAGOU METADE DISSO.** O `club/active-club.tsx` agora
 * expõe o `me` (`{ id, name }`), então o avatar de QUEM É VOCÊ ganhou a sua
 * inicial de verdade — `name={userId === me?.id ? me.name : null}`, logo
 * abaixo. Num clube de duas pessoas, "eu × a outra" é bijeção com a
 * identidade real. O que continua lacuna de BACKEND é o nome da OUTRA
 * pessoa: nenhuma rota lista os membros do clube, então ela segue no glifo
 * neutro, distinguível pela cor (que vem do `id`).
 *
 * ⚠️ E o `me` é `null` fora do `ready` do `/me` — nesse frame TODO avatar cai
 * no glifo neutro, que é a resposta honesta para "ainda não sei quem é você".
 */
function writersByPlanItem(
  writers: BookWithPlanResponse['writers'],
): Map<string, readonly string[]> {
  return new Map(writers.map((entry) => [entry.planItemId, entry.userIds]));
}

/**
 * O ACERVO DO LIVRO — a aba "Anotações" (Tarefa 19).
 *
 * Estado PRÓPRIO, e não um campo do `BookState`: ele chega numa segunda
 * requisição (`GET /clubs/:clubId/notes?bookId=…`, que só é possível depois de
 * o livro dizer de qual clube é), e falhar nele não pode apagar o plano de
 * leitura que já está na tela.
 *
 * O erro NÃO carrega o `error`: esta seção tem uma frase própria para qualquer
 * falha e um "tentar de novo" que refaz a carga inteira. Guardar o objeto seria
 * guardar texto da API que ninguém pode mostrar (regra 21).
 */
type NotesState =
  | { status: 'loading' }
  | { status: 'ready'; notes: readonly NoteResponse[] }
  | { status: 'failed' };

const NOTES_LOADING: NotesState = { status: 'loading' };

/**
 * ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`.
 *
 * Dentro do clube não existe conteúdo privado: as três opções olham o MESMO
 * acervo, e nenhuma delas esconde nada de ninguém. Nunca rotular como
 * privacidade, nunca cadeado, nunca "só você vê".
 *
 * ⚠️ E `others` é o COMPLEMENTO de `mine`, não um chip por pessoa: nenhuma rota
 * lista os membros do clube com nome (lacuna de backend medida nas Tarefas 17 e
 * 18), e num clube de duas pessoas o complemento é informação completa.
 */
type NoteScope = 'all' | 'mine' | 'others';

const NOTE_SCOPES: readonly NoteScope[] = ['all', 'mine', 'others'];

const SCOPE_LABELS: Readonly<Record<NoteScope, MessageKey>> = {
  all: 'pages.book.notes.filters.all',
  mine: 'pages.book.notes.filters.mine',
  others: 'pages.book.notes.filters.others',
};

/**
 * REGRA 5 — O RECORTE É FEITO NO CLIENTE, sobre a lista já carregada.
 *
 * O `listNotes` aceita `authorId`, mas usá-lo faria cada toque num chip virar
 * uma ida ao servidor: são dezenas de itens, e "minhas" não é um pedido novo —
 * é um recorte do mesmo acervo.
 */
function scopedNotes(
  notes: readonly NoteResponse[],
  scope: NoteScope,
  myId: string | undefined,
): readonly NoteResponse[] {
  if (scope === 'all') return notes;
  // Sem `/me` não há como partir a lista; mostrar tudo é a resposta honesta
  // para "ainda não sei quem é você" (e os chips só aparecem com o `me` pronto).
  if (myId === undefined) return notes;
  return notes.filter((note) =>
    scope === 'mine' ? note.userId === myId : note.userId !== myId,
  );
}

/** Quantos caracteres do `plainText` cabem numa linha de lista sem virar
    parágrafo. */
const EXCERPT_LENGTH = 120;

/**
 * DECISÃO F: o item mostra um TRECHO do `plainText`, nunca o `doc` renderizado.
 *
 * `plainText` é derivado no backend (ADR 0001) exatamente para isto; montar
 * trinta documentos ProseMirror numa lista seria caro e ilegível.
 */
function excerptOf(plainText: string): string {
  const text = plainText.trim().replace(/\s+/gu, ' ');
  return text.length <= EXCERPT_LENGTH
    ? text
    : `${text.slice(0, EXCERPT_LENGTH)}…`;
}

/**
 * REGRA 8 — para onde um item leva.
 *
 * A do DIA abre a tela do dia (é lá que ela se escreve — `upsertPlanNote`, e o
 * `editNote` recusa nota do dia de propósito). A avulsa abre a tela da avulsa,
 * que decide sozinha entre correção e leitura pela autoria.
 */
function noteTarget(note: NoteResponse, bookId: string): string {
  return note.kind === 'PLAN' && note.planItemId !== null
    ? dayNotePath(bookId, note.planItemId)
    : freeNotePath(bookId, note.id);
}

/**
 * A aba ativa não navega para lugar nenhum: ela É onde a pessoa está. Um
 * `onPress` que não faz nada é honesto — o `FilterChip` exige o campo porque no
 * caso geral (o `Tudo · Minhas · de X` da Tarefa 19) ele muda a listagem.
 */
function stayHere(): void {
  // No-op deliberado.
}

/**
 * A aba de Grifos: as MESMAS classes do `FilterChip` não pressionado, escritas
 * à mão porque o `FilterChipProps` da Tarefa 13 não aceita `renderLink` e
 * `packages/ui` não é alterado nesta fatia (a lacuna está no relatório — é a
 * mesma da versão desabilitada, que viveu aqui da Tarefa 17 à 25).
 */
const HIGHLIGHTS_TAB_CLASS = cx(
  'inline-flex min-h-11 shrink-0 items-center rounded-full border border-line bg-surface px-4',
  'text-sm font-medium text-muted transition-colors hover:border-line-strong hover:text-content',
  FOCUS_RING,
);

export function BookPage() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const { clubs, me } = useActiveClub();
  const navigate = useNavigate();
  const { bookId } = useParams();

  const [state, setState] = useState<BookState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [notes, setNotes] = useState<NotesState>(NOTES_LOADING);
  /**
   * O acervo tem o PRÓPRIO contador de tentativas, e não é preciosismo:
   * reaproveitar o `attempt` do livro fazia o "tentar de novo" do acervo
   * derrubar o livro para `loading` e disparar TRÊS requisições de anotação —
   * uma com o clube antigo, uma abortada pelo `loading`, e a de verdade.
   * Medido. Cada carga com o seu gatilho.
   */
  const [notesAttempt, setNotesAttempt] = useState(0);
  const [scope, setScope] = useState<NoteScope>('all');

  /*
    "QUE DIA É HOJE" — calculado, nunca guardado, com `Intl` e no fuso de quem
    olha a tela (o `localDay` da Tarefa 16; o `/me` não devolve `timezone`, e no
    front o fuso do navegador É o fuso da pessoa). Fica no corpo do render, sem
    `useMemo`: são trinta itens, e um `useMemo` congelaria "hoje" numa aba
    aberta desde ontem.
  */
  const today = localDay(new Date(), localTimeZone());

  useEffect(() => {
    // REGRA 1: UMA requisição. A dependência é o `bookId` do caminho, então
    // trocar de livro refaz o pedido — com o livro novo na URL.
    if (bookId === undefined) return;

    let cancelled = false;
    setState(LOADING);

    void api
      .get(`/books/${encodeURIComponent(bookId)}`, bookWithPlanResponseSchema)
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: 'failed', error });
      });

    return () => {
      // A mesma guarda da home: a resposta velha chega e é DESCARTADA. Sem
      // ela, quem toca dois livros em sequência vê o primeiro sobrescrever o
      // segundo, e nada mais reescreve aquilo.
      cancelled = true;
    };
  }, [api, bookId, attempt]);

  /*
    O ACERVO (regra 1). Ele depende do CLUBE DO LIVRO — `book.clubId`, e não o
    clube ativo do cabeçalho: o dono do livro é quem manda, e é assim que abrir
    o link de um livro de outro clube consulta o clube certo (o backend faz o
    corte de tenant contra o `Membership`; sem membership, 404).

    Efeito PRÓPRIO, e não um encadeamento dentro do primeiro: assim trocar de
    livro refaz os dois, e uma falha no acervo não apaga o plano.
  */
  const loadedBook = state.status === 'ready' ? state.data.book : null;
  const notesClubId = loadedBook === null ? null : loadedBook.clubId;
  const notesBookId = loadedBook === null ? null : loadedBook.id;

  useEffect(() => {
    if (notesClubId === null || notesBookId === null) return;

    let cancelled = false;
    setNotes(NOTES_LOADING);

    void api
      .get(
        `/clubs/${encodeURIComponent(notesClubId)}/notes`,
        notesResponseSchema,
        { query: { bookId: notesBookId } },
      )
      .then((list) => {
        if (cancelled) return;
        setNotes({ status: 'ready', notes: list });
      })
      .catch(() => {
        if (cancelled) return;
        setNotes({ status: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [api, notesClubId, notesBookId, notesAttempt]);

  const writers = useMemo(
    () =>
      state.status === 'ready'
        ? writersByPlanItem(state.data.writers)
        : new Map<string, readonly string[]>(),
    [state],
  );

  const locale = i18n.resolvedLanguage ?? 'pt';

  /**
   * O ACERVO, abaixo do plano — regras 1 a 8 da Tarefa 19.
   *
   * Ele é uma seção da aba "Anotações" que a Tarefa 17 deixou pronta e vazia,
   * e não uma tela nova: o acervo é DO LIVRO, e uma segunda tela duplicaria
   * navegação para mostrar a mesma coisa.
   */
  function notesSection(bookIdOfScreen: string): ReactNode {
    if (notes.status === 'loading') {
      return (
        <p className="text-sm text-muted">{t('pages.book.notes.loading')}</p>
      );
    }

    if (notes.status === 'failed') {
      return (
        <Notice
          action={
            <Button
              onClick={() => {
                setNotesAttempt((previous) => previous + 1);
              }}
              variant="ghost"
            >
              {t('pages.book.retry')}
            </Button>
          }
          title={t('pages.book.notes.unavailable')}
        />
      );
    }

    const all = notes.notes;
    const visible = scopedNotes(all, scope, me?.id);

    return (
      <>
        {/*
          REGRA 4: os três chips, com `aria-pressed` — e o chip só existe se
          houver acervo. Filtrar o vazio é oferecer uma escolha que não muda
          nada.
        */}
        {all.length === 0 ? null : (
          <div
            aria-label={t('pages.book.notes.filters.label')}
            className="flex flex-wrap items-center gap-2"
            role="group"
          >
            {NOTE_SCOPES.map((candidate) => (
              <FilterChip
                key={candidate}
                label={t(SCOPE_LABELS[candidate])}
                onPress={() => {
                  setScope(candidate);
                }}
                pressed={scope === candidate}
              />
            ))}
          </div>
        )}

        {visible.length === 0 ? (
          /*
            REGRA 7: o vazio não cobra ninguém. E o vazio do FILTRO tem frase
            própria — "escreva a primeira" seria mentira embaixo de um recorte
            que só escondeu o que já existe.
          */
          <Notice
            description={
              all.length === 0
                ? t('pages.book.notes.empty.description')
                : undefined
            }
            title={
              all.length === 0
                ? t('pages.book.notes.empty.title')
                : t('pages.book.notes.empty.filtered')
            }
          />
        ) : (
          <List aria-label={t('pages.book.notes.label')} className="gap-1">
            {/*
              A ordem é a que a API devolveu (o `listNotes` ordena por
              `createdAt` decrescente). A tela NÃO reordena — duas ordens
              seriam duas verdades.
            */}
            {visible.map((note) => {
              const mine = note.userId === me?.id;
              // REGRA 2: autoria em TEXTO, não só na cor do avatar. O avatar
              // vai sem `label` de propósito: o nome já está escrito ao lado, e
              // um `aria-label` igual faria o leitor de tela repetir.
              const author = t(
                mine
                  ? 'pages.book.notes.author.you'
                  : 'pages.book.notes.author.other',
              );
              const excerpt = excerptOf(note.plainText);

              return (
                <ListItem
                  // REGRA 3: o tipo é legível, não deduzido do endereço.
                  end={t(
                    note.kind === 'PLAN'
                      ? 'pages.book.notes.kind.plan'
                      : 'pages.book.notes.kind.free',
                  )}
                  href={noteTarget(note, bookIdOfScreen)}
                  key={note.id}
                  renderLink={listItemRouterLink}
                  start={
                    <PersonAvatar
                      id={note.userId}
                      name={mine ? (me?.name ?? null) : null}
                      size="sm"
                    />
                  }
                  subtitle={excerpt === '' ? author : `${author} · ${excerpt}`}
                  title={note.title}
                />
              );
            })}
          </List>
        )}
      </>
    );
  }

  function body(): ReactNode {
    if (state.status === 'loading') {
      return <p className="text-sm text-muted">{t('pages.book.loading')}</p>;
    }

    if (state.status === 'failed') {
      return (
        <Notice
          action={
            isRetriable(state.error) ? (
              <Button
                onClick={() => {
                  // REGRA 10: repetir REFAZ a requisição — não é só apagar a
                  // mensagem.
                  setAttempt((previous) => previous + 1);
                }}
                variant="ghost"
              >
                {t('pages.book.retry')}
              </Button>
            ) : undefined
          }
          title={messageFor(
            t,
            resolveApiError(state.error, {
              fields: [],
              byStatus: BOOK_STATUS,
            }).key,
          )}
        />
      );
    }

    const { book, planItems } = state.data;

    return (
      <>
        {book.author !== null ? (
          <p className="text-sm text-muted">{book.author}</p>
        ) : null}

        {/*
          REGRA 1 (Tarefa 20) — CORRIGIR O LIVRO E O PLANO, só para OWNER/ADMIN.

          O papel é conferido contra `book.clubId` e NÃO contra o clube ativo do
          cabeçalho: abrir o link de um livro de outro clube é caminho real (é o
          que a tela do dia já faz), e o papel de quem olha é o daquele clube.
        */}
        {isClubAdmin(clubs, book.clubId) ? (
          <div className="flex">
            <Button
              onClick={() => {
                navigate(bookEditPath(book.id));
              }}
              variant="ghost"
            >
              {t('pages.bookForm.entry.edit')}
            </Button>
          </div>
        ) : null}

        {/*
          ⚠️ **REGRA 11 DA TAREFA 25: A ABA DE GRIFOS DEIXOU DE SER
          DESABILITADA E PASSOU A NAVEGAR.**

          Ela nasceu na Tarefa 17 como `<button disabled aria-disabled>` com um
          "chega no MVP 2" ao lado — honesto enquanto a tela não existia. Agora
          existe, e a frase do MVP 2 saiu do catálogo junto com o `disabled`:
          uma explicação que deixou de ser verdade é pior que nenhuma.

          ⚠️ **E É O `Link` DO ROTEADOR, NUNCA ÂNCORA CRUA.** `<a href>` é
          navegação de DOCUMENTO: num PWA ela recarrega o shell inteiro e perde
          o estado em memória (a sessão, o clube ativo, o rascunho do editor) —
          a lição medida da Tarefa 16. O `Link` renderiza um `<a href>` de
          verdade (Ctrl+clique e "abrir em nova aba" continuam) **e** intercepta
          o clique normal.

          As classes são escritas à mão, e não por um `FilterChip`, pelo mesmo
          motivo que a versão desabilitada era: o `FilterChipProps` da Tarefa 13
          não aceita `renderLink` nem `disabled`, e `packages/ui` não é alterado
          nesta fatia (a lacuna continua no relatório).

          ⚠️ **E ELAS SÃO LOCAIS — o `HIGHLIGHTS_TAB_CLASS`, no topo deste
          arquivo.** A primeira versão desta prosa dizia que elas "moram em
          `highlights.tsx` (`CHIP_LINK_CLASS`)", e a auditoria mediu: um
          `grep -rn "CHIP_LINK_CLASS"` devolvia UMA ocorrência — a própria
          frase. A constante nunca existiu.

          Elas ficam locais porque a aba é um CHIP e o link de texto das telas
          de grifo (`TEXT_LINK_CLASS`, em `./chrome`) é um LINK: as duas não têm
          classe em comum além do `FOCUS_RING`. O `diff` das duas está medido no
          docblock do `TEXT_LINK_CLASS`.
        */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label={t('pages.book.tabs.notes')}
            onPress={stayHere}
            pressed
          />
          <Link className={HIGHLIGHTS_TAB_CLASS} to={highlightsPath(book.id)}>
            {t('pages.book.tabs.highlights')}
          </Link>
        </div>

        {/*
          REGRA 11: plano vazio tem estado PRÓPRIO, e ele não cobra ninguém —
          quem cadastra o plano é o admin do clube, não quem está lendo esta
          tela.
        */}
        {planItems.length === 0 ? (
          <Notice
            description={t('pages.book.plan.empty.description')}
            title={t('pages.book.plan.empty.title')}
          />
        ) : (
          <List aria-label={t('pages.book.plan.label')} className="gap-1">
            {/*
              REGRA 2: a ordem é a que a API devolveu (o `getBookWithPlan`
              ordena por `order`). A tela NÃO reordena — duas ordens seriam duas
              verdades, e a que a pessoa vê mudaria com a tela.
            */}
            {planItems.map((item) => {
              const authors = writers.get(item.id) ?? [];
              // REGRAS 3 e 4: comparação de STRING contra o `localDay`, nunca
              // `new Date()`. E é a ÚNICA marca da lista: nada distingue passado
              // de futuro.
              const isToday = item.date === today;

              return (
                <ListItem
                  className={
                    isToday ? 'bg-surface ring-1 ring-accent' : undefined
                  }
                  end={
                    isToday ? (
                      <span className="font-medium text-accent">
                        {t('pages.book.plan.today')}
                      </span>
                    ) : undefined
                  }
                  // REGRA 8: `/books/:bookId/days/:planItemId`, nessa ordem, e o
                  // livro é o que ESTA tela carregou.
                  href={dayNotePath(book.id, item.id)}
                  key={item.id}
                  renderLink={listItemRouterLink}
                  /*
                    REGRAS 6 e 7 — UM AVATAR POR PESSOA, E NADA QUANDO NINGUÉM
                    ESCREVEU.

                    Sem número em lugar nenhum: nem "+2" de estouro, nem
                    contagem ao lado. E dia sem autoria não ganha "ninguém
                    escreveu" — a ausência é silenciosa, que é o anti-culpa
                    aplicado ao espaço vazio.

                    ⚠️ O `name` é o do `me` quando o autor é VOCÊ, e `null`
                    para todo o resto — nunca o `userId`. Com o id, o
                    `PersonAvatar` extrai a primeira letra do UUID e desenha um
                    "F" ou um "C": uma inicial que tem cara de inicial e não é
                    de ninguém. `null` cai no glifo neutro que a Tarefa 13 pôs
                    ali para "sem nome". A cor vem do id nos dois casos
                    (`avatar-color.ts`) — é como o clube distingue quem
                    escreveu.
                  */
                  start={
                    authors.length === 0 ? undefined : (
                      <span className="flex items-center gap-1">
                        {authors.map((userId) => (
                          <PersonAvatar
                            id={userId}
                            key={userId}
                            label={t('pages.book.plan.writer')}
                            name={userId === me?.id ? me.name : null}
                            size="sm"
                          />
                        ))}
                      </span>
                    )
                  }
                  subtitle={subtitleFor(item, locale)}
                  title={item.title}
                />
              );
            })}
          </List>
        )}

        {/*
          REGRA 16 (Tarefa 19): criar é EXPLÍCITO. O botão fica FORA do
          `notesSection` de propósito — ele existe mesmo quando o acervo não
          carregou, porque escrever não depende de conseguir ler a lista.

          `Button` + `navigate`, e não um link com cara de botão: o `ListItem`
          é o componente do design system que vira âncora, e escrever as
          classes de botão à mão numa tela seria decidir visual fora do `ui`
          (a mesma discussão do `form-styles.ts`).
        */}
        <div className="flex">
          <Button
            onClick={() => {
              navigate(freeNoteNewPath(book.id));
            }}
          >
            {t('pages.book.notes.new')}
          </Button>
        </div>

        {notesSection(book.id)}
      </>
    );
  }

  /*
    O título do livro É o título da tela quando ele chegou; antes disso, o nome
    da tela. O `h1` vem do `Screen` de `./chrome`, e é ele que faz
    "carregando", "não foi possível abrir" e "sem plano" serem estados de uma
    tela — não telas brancas (regra 9).
  */
  return (
    <Screen
      title={
        state.status === 'ready' ? state.data.book.title : t('pages.book.title')
      }
    >
      {body()}
    </Screen>
  );
}
