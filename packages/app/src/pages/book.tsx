import {
  type BookWithPlanResponse,
  bookWithPlanResponseSchema,
  type ClubMemberResponse,
  clubMembersResponseSchema,
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
  FilterBar,
  FilterChip,
  type FilterOption,
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
 *
 * ⚠️ **O TAMANHO, MEDIDO E REGISTRADO** (contador canônico no docblock de
 * `highlights.tsx`): **400 linhas** antes da Tarefa 27 e **486** depois — o
 * filtro por pessoa trouxe uma terceira requisição, um estado, o construtor dos
 * chips e a resolução de nome das duas metades da tela (o acervo e a
 * sobreposição do plano). É a segunda maior tela do app, atrás do
 * `free-note.tsx` (565), e
 * a lição nº 8 do MVP 1 ("divida ANTES de a tela crescer") aponta para a
 * **Tarefa 28**, que reabre esta tela para juntar anotações e grifos num acervo
 * só: é lá que o acervo sai daqui, não numa divisão feita por antecipação.
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
 * QUEM É O CLUBE — `GET /clubs/:clubId/members` (Tarefa 26a).
 *
 * Estado PRÓPRIO, e não um campo do `BookState` nem do `NotesState`: ele é uma
 * TERCEIRA requisição, e falhar nela não pode apagar o plano nem o acervo.
 *
 * ⚠️ **DUAS VARIANTES, E NÃO TRÊS — e isso é uma correção medida.** Este union
 * tinha `loading`, `ready` e `failed`, e o `failed` era **peso morto**: mutar o
 * `setMembers({ status: 'failed' })` para nada dava **0 acusadores**, porque
 * `loading` degrada exatamente igual. Um estado sem consequência é um estado
 * que ninguém pode acusar — e ele fazia o teste da regra 14 parecer provar "a
 * FALHA é vista" quando ele provava "o não-`ready` degrada".
 *
 * A verdade é que a tela só precisa saber **se conhece as pessoas**: não há
 * frase de erro (o filtro degrada em silêncio — o acervo é o conteúdo, o filtro
 * é navegação) e não há botão próprio. Então o não-`ready` é um estado só, e o
 * `catch` não tem o que escrever: quem já pôs `unknown` foi o começo do efeito.
 * Quando a Tarefa 28 der uma ação própria à falha (um "tentar de novo" do
 * filtro), aí ela **volta** a ser uma variante — com comportamento e com teste.
 */
type MembersState =
  | { status: 'unknown' }
  | { status: 'ready'; members: readonly ClubMemberResponse[] };

const MEMBERS_UNKNOWN: MembersState = { status: 'unknown' };

/**
 * ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`.
 *
 * Dentro do clube não existe conteúdo privado: todas as opções olham o MESMO
 * acervo, e nenhuma delas esconde nada de ninguém. Nunca rotular como
 * privacidade, nunca cadeado, nunca "só você vê" — e nunca um contador ao lado
 * do nome ("incentivo por presença, não por comparação", §1 do plano).
 *
 * ⚠️ **O RECORTE É O `value` DO CHIP, e ele é uma STRING de propósito.**
 *
 * O `FilterBar` é agnóstico de dimensão (decisão G da Tarefa 27) e não sabe o
 * que é "pessoa": o `value` de cada opção é `string`, e é esta tela — dona do
 * vocabulário — que interpreta. Três valores fixos e um por pessoa, com
 * PREFIXO: sem ele, um `userId` que fosse literalmente `mine` viraria O MESMO
 * chip que "Minhas" — dois chips acesos, e o recorte de um dos dois
 * desaparecendo em silêncio.
 *
 * ⚠️ **E ISSO TEM TESTE, porque o fixture é produzível pelo contrato em que a
 * tela confia.** A primeira versão desta fatia deixou o prefixo sem acusador,
 * com a prosa dizendo que o cenário "não é produzível pela API" — meia verdade:
 * o **backend** gera `randomUUID()`, mas a fronteira que a tela valida é o
 * `clubMemberResponseSchema`, e ele declara `userId: z.string()` **sem
 * `.uuid()`** (§6.8: é o cliente que decide o que a tela vê). O teste é
 * `a member whose userId is literally "mine" does not hijack the "Minhas" chip`,
 * e o mutante equivalente (sem prefixo) tem **1 acusador**.
 */
const ALL_SCOPE = 'all';
const MINE_SCOPE = 'mine';
/**
 * ⚠️ O COMPLEMENTO — e ele agora é o **modo degradado** (regra 14).
 *
 * Era o filtro por pessoa inteiro na Tarefa 19, porque nenhuma rota listava os
 * membros. Hoje ele é o que a tela mostra quando **não sabe as pessoas**: o
 * `GET /members` que falhou, ou o `/me` que ainda não chegou.
 */
const OTHERS_SCOPE = 'others';
const AUTHOR_SCOPE_PREFIX = 'author:';

function authorScope(userId: string): string {
  return `${AUTHOR_SCOPE_PREFIX}${userId}`;
}

/** O `userId` de um recorte por pessoa, ou `null` se o recorte é outro. */
function authorOfScope(scope: string): string | null {
  return scope.startsWith(AUTHOR_SCOPE_PREFIX)
    ? scope.slice(AUTHOR_SCOPE_PREFIX.length)
    : null;
}

/**
 * REGRA 5 — O RECORTE É FEITO NO CLIENTE, sobre a lista já carregada.
 *
 * O `listNotes` aceita `authorId`, mas usá-lo faria cada toque num chip virar
 * uma ida ao servidor: são dezenas de itens, e "minhas" não é um pedido novo —
 * é um recorte do mesmo acervo.
 */
function scopedNotes(
  notes: readonly NoteResponse[],
  scope: string,
  myId: string | undefined,
): readonly NoteResponse[] {
  const author = authorOfScope(scope);
  if (author !== null) return notes.filter((note) => note.userId === author);
  if (scope === ALL_SCOPE) return notes;
  // Sem `/me` não há como partir a lista; mostrar tudo é a resposta honesta
  // para "ainda não sei quem é você" — nunca uma lista partida ao contrário,
  // que é a armadilha nomeada da Tarefa 18.
  if (myId === undefined) return notes;
  return notes.filter((note) =>
    scope === MINE_SCOPE ? note.userId === myId : note.userId !== myId,
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
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);
  /** O `value` do chip escolhido — 'all' | 'mine' | 'others' | 'author:<id>'. */
  const [scope, setScope] = useState<string>(ALL_SCOPE);

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

  /*
    QUEM É O CLUBE (Tarefa 27, regra 10). Depende do CLUBE DO LIVRO — o mesmo
    `book.clubId` do acervo, e não o clube ativo do cabeçalho: o dono do livro é
    quem manda, e o backend faz o corte de tenant contra o `Membership` (sem
    membership, 404).

    Efeito PRÓPRIO: uma falha aqui não apaga o plano nem o acervo, e trocar de
    livro refaz os dois.

    ⚠️ **E O `notesAttempt` ESTÁ NAS DEPENDÊNCIAS DE PROPÓSITO: o "tentar de
    novo" do acervo refaz ESTA carga também.** A primeira versão desta fatia o
    deixou de fora, com uma prosa dizendo que amarrar as duas cargas ao mesmo
    gatilho era "exatamente o defeito medido no `notesAttempt`" — e a auditoria
    mostrou que a analogia era **falsa**: o defeito medido era reusar o
    `attempt` DO LIVRO, que joga o `state` de volta para `loading` e dispara
    três requisições de anotação. Ligar no `notesAttempt` não faz nada disso,
    e sem ele uma falha passageira nos nomes só se conserta recarregando o app —
    com o único botão de "tentar de novo" da seção ali do lado, sem efeito
    sobre o filtro. Analogia vestida de medição é a classe que já caiu duas
    vezes na Tarefa 24.
  */
  useEffect(() => {
    if (notesClubId === null) return;

    let cancelled = false;
    setMembers(MEMBERS_UNKNOWN);

    void api
      .get(
        `/clubs/${encodeURIComponent(notesClubId)}/members`,
        clubMembersResponseSchema,
      )
      .then((list) => {
        if (cancelled) return;
        setMembers({ status: 'ready', members: list });
      })
      .catch(() => {
        /*
          Nada a escrever: o estado já é `unknown` desde o começo do efeito, e
          não há frase de erro para mostrar (regra 14 — ninguém lê um texto de
          servidor por causa de um chip). O `catch` existe para a rejeição ter
          dono; se um dia a falha ganhar ação própria, ela volta a ser uma
          variante do union.
        */
      });

    return () => {
      cancelled = true;
    };
  }, [api, notesClubId, notesAttempt]);

  const writers = useMemo(
    () =>
      state.status === 'ready'
        ? writersByPlanItem(state.data.writers)
        : new Map<string, readonly string[]>(),
    [state],
  );

  /**
   * `userId` → nome, para TODO membro — `ACTIVE` e `ARCHIVED`.
   *
   * ⚠️ **É AQUI QUE A DECISÃO A DA TAREFA 26a É COBRADA** (regra 11): a rota
   * devolve os arquivados **exclusivamente** para isto. Sair do clube arquiva o
   * `Membership` e não apaga o que a pessoa escreveu — "o acervo do clube
   * continua íntegro, **com autoria**" (ADR 0002) —, então quem saiu não vira
   * chip e continua tendo nome na anotação que deixou.
   */
  const memberNames = useMemo(
    () =>
      new Map<string, string | null>(
        members.status === 'ready'
          ? members.members.map((member) => [member.userId, member.name])
          : [],
      ),
    [members],
  );

  const locale = i18n.resolvedLanguage ?? 'pt';

  /**
   * O nome de quem escreveu — `null` quando não se sabe.
   *
   * ⚠️ **O `me` VEM PRIMEIRO, e não é redundância**: o `/me` responde antes de
   * `/clubs/:id/members` no caminho comum, e sou eu que apareço na tela
   * primeiro. Sem esta ordem, o meu avatar cairia no glifo neutro no frame entre
   * as duas respostas — o que a Tarefa 18 pagou para não acontecer.
   *
   * Nunca o `userId` como nome: com o id, o `PersonAvatar` extrai a primeira
   * letra do UUID e desenha uma inicial que tem cara de inicial e não é de
   * ninguém (medido na Tarefa 17). `null` cai no glifo neutro.
   */
  function nameOfWriter(userId: string): string | null {
    if (me !== null && userId === me.id) return me.name;
    return memberNames.get(userId) ?? null;
  }

  /**
   * ⚠️ **OS CHIPS DO FILTRO POR PESSOA — E É AQUI QUE A TAREFA 26a É COBRADA**
   * (Tarefa 27, regras 10 a 14).
   *
   * `Tudo · Minhas · De Maria · De Zeca`, e o que **não** entra é metade da
   * regra:
   *
   * - **eu não viro chip** — eu sou o "Minhas" (regra 13). Dois chips para o
   *   mesmo recorte é confusão, e o de baixo faria o de cima parecer quebrado;
   * - **quem saiu do clube não vira chip** (regra 11, decisão A da 26a): os
   *   `ARCHIVED` chegam na resposta **exclusivamente** para resolver o nome de
   *   quem escreveu e saiu, e isso acontece na lista, não no filtro;
   * - **`name: null` não vira chip vazio nem "null"**: cai numa frase do
   *   catálogo (regra 12), porque o backend não inventa fallback (decisão C da
   *   26a) — e em qual idioma ele inventaria?
   *
   * ⚠️ **E O `me` NULO DEGRADA O FILTRO INTEIRO, de propósito.** É a armadilha
   * nomeada da Tarefa 18 na sua segunda cara: o `me` é `null` fora do `ready`,
   * e com os membros carregados eu ganharia um chip MEU ao lado de um "Minhas"
   * que mostra tudo. Saber quem são as pessoas não basta — é preciso saber qual
   * delas sou eu. Então, sem `me`, volta o complemento da Tarefa 19.
   */
  function authorOptions(): FilterOption[] {
    const fixed: FilterOption[] = [
      // O estado neutro é do CHAMADOR (decisão H): o `FilterBar` não sabe que
      // existe um "tudo", e o rótulo dele é texto que só a tela traduz.
      { value: ALL_SCOPE, label: t('pages.book.notes.filters.all') },
      { value: MINE_SCOPE, label: t('pages.book.notes.filters.mine') },
    ];

    if (members.status !== 'ready' || me === null) {
      return [
        ...fixed,
        { value: OTHERS_SCOPE, label: t('pages.book.notes.filters.others') },
      ];
    }

    const myId = me.id;

    return [
      ...fixed,
      // A ordem é a que a API devolveu (o `listClubMembers` ordena por nome). A
      // tela NÃO reordena — duas ordens seriam duas verdades.
      ...members.members
        .filter(
          (member) => member.status === 'ACTIVE' && member.userId !== myId,
        )
        .map((member) => ({
          value: authorScope(member.userId),
          label:
            member.name === null
              ? t('pages.book.notes.filters.unnamed')
              : t('pages.book.notes.filters.person', { name: member.name }),
          /*
            DECISÃO D: o `PersonAvatar` no slot `start` do `FilterChip` — o slot
            nasceu na Tarefa 13 para este uso exato, e é o `PersonAvatar` que é
            novo nele: o slot já tinha DOIS chamadores com `ColorSwatch` (as
            duas telas de grifo, Tarefas 24/25), ao contrário do que a decisão D
            da spec afirmava (medido por `git grep "start="`). Sem
            `label` de propósito: o nome está escrito ao lado, e um `aria-label`
            igual faria o leitor de tela repetir. A cor vem do `id`, e a inicial
            agora é a de VERDADE — é isso que a Tarefa 26a comprou.
          */
          start: (
            <PersonAvatar id={member.userId} name={member.name} size="sm" />
          ),
        })),
    ];
  }

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
    const options = authorOptions();
    /*
      ⚠️ **O RECORTE É DERIVADO DO QUE ESTÁ NA TELA**: um `scope` sem chip
      correspondente volta para "Tudo". Sem isto, dois caminhos reais deixam o
      filtro com NENHUM chip aceso e a lista recortada por um critério
      invisível — escolher "De outras pessoas" enquanto os membros carregam
      (o chip morre quando eles chegam) e ficar num chip de quem saiu do clube
      no meio da sessão. Sempre exatamente um chip pressionado.
    */
    const selected = options.some((option) => option.value === scope)
      ? scope
      : ALL_SCOPE;
    const visible = scopedNotes(all, selected, me?.id);

    return (
      <>
        {/*
          REGRA 4: os chips, com `aria-pressed` — e eles só existem se houver
          acervo. Filtrar o vazio é oferecer uma escolha que não muda nada.

          ⚠️ **E A COMPOSIÇÃO É DO `FilterBar`** (Tarefa 27, regra 7): o
          `role="group"`, o `aria-label` e o `aria-pressed` moravam aqui E na
          tela de grifos — duas cópias da mesma acessibilidade, que é como as
          duas saem de sincronia no primeiro conserto. O que sobra aqui é o
          VOCABULÁRIO, porque `packages/ui` não traduz (decisão B da Tarefa 13).
        */}
        {all.length === 0 ? null : (
          <FilterBar
            groups={[
              {
                id: 'author',
                label: t('pages.book.notes.filters.label'),
                options,
                selected,
                onSelect: (option) => {
                  // Controlado (decisão A): a barra devolve a opção, e quem
                  // guarda a escolha é a tela.
                  setScope(option.value);
                },
              },
            ]}
          />
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
              /*
                ⚠️ **O NOME DE QUEM ESCREVEU — a outra metade da regra 11.**

                `memberNames` cobre `ACTIVE` **e** `ARCHIVED`: a anotação de
                quem saiu do clube deixa de dizer "Alguém do clube" e passa a
                dizer o nome dela. Sem membro conhecido (o `GET /members` que
                falhou, ou um autor que não está mais na lista), volta o
                genérico do catálogo — nunca o `userId`, que não é nome de
                ninguém.
              */
              const writerName = nameOfWriter(note.userId);
              // REGRA 2: autoria em TEXTO, não só na cor do avatar. O avatar
              // vai sem `label` de propósito: o nome já está escrito ao lado, e
              // um `aria-label` igual faria o leitor de tela repetir.
              //
              // "Você" ganha do nome quando a nota é minha: eu não me leio pelo
              // nome numa lista em que também estão os outros.
              const author = mine
                ? t('pages.book.notes.author.you')
                : (writerName ?? t('pages.book.notes.author.other'));
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
                      name={writerName}
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
                        {authors.map((userId) => {
                          const authorName = nameOfWriter(userId);

                          return (
                            <PersonAvatar
                              id={userId}
                              key={userId}
                              /*
                                ⚠️ **AS DUAS METADES DO NOME, e a segunda foi
                                uma correção medida.** A primeira versão desta
                                fatia dava nome ao ACERVO e deixava a
                                sobreposição do plano — dois dedos acima, na
                                mesma tela — com o glifo neutro e a frase
                                genérica: a mesma pessoa aparecia como "Maria"
                                embaixo e como "alguém" em cima, visível ao dono
                                no primeiro scroll.

                                A razão registrada então ("trocar o `aria-label`
                                pelo nome cru perderia o 'escreveu neste dia'")
                                era boa e cobria só a metade FALADA: a inicial
                                visual nunca teve esse custo. A saída é uma
                                chave INTERPOLADA, que mantém as duas coisas.

                                O fallback é a frase genérica, e ele é o estado
                                real de quem não conhece as pessoas (o
                                `GET /members` que falhou, ou o autor que não
                                está na lista).
                              */
                              label={
                                authorName === null
                                  ? t('pages.book.plan.writer')
                                  : t('pages.book.plan.writerNamed', {
                                      name: authorName,
                                    })
                              }
                              name={authorName}
                              size="sm"
                            />
                          );
                        })}
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
