import {
  type BookResponse,
  bookWithPlanResponseSchema,
  clubMembersResponseSchema,
  type HighlightResponse,
  highlightResponseSchema,
  highlightsResponseSchema,
  type NoteResponse,
  notesResponseSchema,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import {
  Button,
  FilterBar,
  List,
  ListItem,
  PersonAvatar,
  Sheet,
} from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import {
  type AcervoEntry,
  ALL_SCOPE,
  colorFromChipValue,
  COMMENT_EXCERPT_LENGTH,
  emptyTitleKey,
  EVERY_PAGE,
  EVERY_READING,
  EVERY_TYPE,
  excerptOf,
  filterEntries,
  type HighlightEntry,
  keyOf,
  mergeEntries,
  NOTE_EXCERPT_LENGTH,
  type NoteEntry,
  QUOTE_EXCERPT_LENGTH,
  typeCanCarryReading,
  typeCanIncludeHighlight,
  typeFromChipValue,
} from './acervo-entries';
import {
  authorOptions,
  filterGroups,
  PageRangeFilter,
  type PlanDay,
  ReadingSelect,
  TextFilter,
} from './acervo-filters';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import {
  memberNamesOf,
  MEMBERS_UNKNOWN,
  type MembersState,
  nameOfWriter,
} from './club-names';
import { dayNotePath } from './day-note';
import {
  messageFor,
  resolveApiError,
  type StatusMessages,
} from './form-errors';
import { freeNoteNewPath, freeNotePath } from './free-note';
import {
  COLOR_LABEL_KEYS,
  ColorSwatch,
  type HighlightColor,
} from './highlight-colors';
import { highlightNewPath, highlightPath } from './paths';

/**
 * O ACERVO DO LIVRO (Tarefa 28) — anotações **e** grifos num lugar só.
 *
 * ⚠️ **ELA ABSORVE DUAS TELAS, e é isso que a fatia compra.** A coleção de
 * grifos (`highlights.tsx`, Tarefa 25) e o acervo de anotações que a Tarefa 19
 * pôs **dentro** do `book.tsx` eram dois lugares com o mesmo propósito e duas
 * inconsistências visíveis ao dono: "Anotações" listava na própria tela do
 * livro e "Grifos" navegava, e só a metade das anotações dizia o NOME de quem
 * escreveu. Agora é uma lista, com o tipo explícito em cada linha (ADR 0004: o
 * grifo **não** é um tipo de anotação) e **seis** dimensões de recorte.
 *
 * ⚠️ **A QUINTA É O TEXTO, e ela chegou na Tarefa 38g — dez fatias depois.** A
 * frase de aceite do MVP 2 promete *"em qualquer listagem eu filtro… por
 * texto"*, e isso **nunca tinha sido verdade**: esta tela recortava por
 * pessoa/tipo/leitura/cor **sem texto**, e a `/busca` (Tarefa 29) recortava por
 * texto no clube inteiro **sem as outras quatro**. As duas metades nunca tinham
 * coexistido numa listagem, e é isso — não o campo — que aquela fatia entrega.
 *
 * ⚠️ **E O RECORTE POR TEXTO TAMBÉM É NO CLIENTE** (decisão A da 38g): o
 * `text` que existe no `NoteFilter`/`HighlightFilter` do backend é da `/busca`,
 * que atravessa o CLUBE e por isso **tem** de perguntar. Aqui o acervo de um
 * livro já está na memória, então digitar uma letra custa **zero** requisição —
 * e não há debounce a pagar nem espera a mostrar. O casamento mora no
 * `acervo-entries.ts` (`matchesText`) e o campo no `acervo-filters.tsx`
 * (`TextFilter`); esta tela só guarda o estado e amarra os dois.
 *
 * ⚠️ **A SEXTA É A FAIXA DE PÁGINA (Tarefa 38h)** — *"os grifos do capítulo 3"*
 * pedido pelo eixo que é do GRIFO (`docs/ACEITE-MVP.md`, MVP 2, pergunta 4). Ela
 * **exclui quem não tem página**: a anotação, que nunca tem, e o grifo de `page`
 * nula. Não é regra nova — é o precedente da COR, que já exclui as anotações
 * desde a Tarefa 28.
 *
 * ⚠️ **E O BACKEND NÃO FOI TOCADO NAQUELA FATIA, de propósito.** O
 * `HighlightRepository` já aceita um `page` exato desde a Tarefa 24 e ele **não
 * tem UM consumidor no app** (medido); crescer o port para `pageFrom`/`pageTo`
 * criaria um SEGUNDO filtro sem cliente. Quem pediu a faixa foi esta tela, e
 * esta tela recorta no cliente.
 *
 * ⚠️ **O NÚMERO DE LINHAS VEM DE UM COMANDO, e é o único do projeto** — a
 * auditoria da Tarefa 25 achou **três** contagens diferentes para o mesmo
 * `book.tsx` no mesmo commit (491, 483, 426), e é assim que um número viaja por
 * quatro arquivos sem ninguém medir. Este é o comando:
 *
 *   node -e "const f=require('fs').readFileSync(process.argv[1],'utf8');
 *     const s=f.replace(/[/][*][\s\S]*?[*][/]/g,'');
 *     console.log(s.split(/\n/).filter(l=>l.trim()
 *     && !l.trim().startsWith('//')).length)" <arquivo>
 *
 * Ele descarta comentário de bloco (os `{...}` de JSX incluídos), linha de
 * `//` e linha em branco.
 *
 * ⚠️ **ELA FOI CORTADA EM TRÊS, e cada corte tem uma medição.** Esta tela
 * nasceu com **703 linhas** pelo contador acima — a maior do app, no commit que
 * existe justamente para encolher a segunda maior (o `book.tsx`, de 486 para
 * 247). Hoje:
 *
 * ```
 * acervo.tsx          511   a tela: estado de requisição, linhas, orquestração
 * acervo-filters.tsx  257   o vocabulário e a marcação dos SEIS controles
 * acervo-entries.ts   167   o modelo: entrada, ordem, o que cada dimensão exclui
 * club-names.ts        23   `userId` → nome, dividido com o `book.tsx`
 * ```
 *
 * ⚠️ **A TAREFA 38g ACRESCENTOU UMA DIMENSÃO E A TELA FICOU EM 511 — remedido,
 * não estimado.** A regra 5 daquela fatia proibia subir **uma** linha, e o
 * arquivo já estava 111 acima do teto de 400. O saldo saiu de três lugares: o
 * campo e o casamento nasceram nos vizinhos (é para isso que eles existem), a
 * escolha entre as três frases de vazio virou função pura no
 * `acervo-entries.ts`, e o "Você × o nome" — que estava escrito DUAS vezes
 * aqui, uma por metade da lista — virou o `authorLabel`, um dono só.
 *
 * ⚠️ **E A TAREFA 38h ACRESCENTOU A SEXTA E A TELA FICOU EM 511 OUTRA VEZ.** A
 * regra 5 daquela fatia repetiu a proibição, e o saldo veio do mesmo tipo de
 * lugar: os dois campos e o casamento nasceram nos vizinhos, e o **"tentar de
 * novo" — que estava escrito TRÊS vezes aqui, uma por carga que pode falhar —**
 * virou o `retryButton`. É o `authorLabel` de novo: cada dimensão nova se paga
 * com uma repetição a menos, e não com um arquivo maior.
 *
 * ⚠️ **OS DOIS PRIMEIROS NÚMEROS ESTAVAM DESATUALIZADOS (514 e 113), e foram
 * remedidos na Tarefa 32b.** Eles ficaram para trás na Tarefa 29 (a busca), e
 * o achado é o próprio motivo deste comando existir: número copiado envelhece
 * sozinho, inclusive no arquivo que **define** como medi-lo. Quem mexer nestes
 * arquivos roda o comando acima — não estima.
 *
 * E o `acervo.tsx` deixou de ser a maior tela do app — o `free-note.tsx` tem
 * **565**. Cada docblock vizinho diz por que aquele pedaço mora lá e não aqui.
 *
 * ⚠️ **A SEGUNDA COSTURA FOI CORRIGIDA POR MEDIÇÃO — eu tinha nomeado a
 * errada.** O relatório da fatia apontou a linha de grifo como "a próxima
 * costura, ~90 linhas"; a auditoria mediu por função e mostrou duas coisas: o
 * card de grifo tem **63** linhas canônicas (o "~90" era a contagem CRUA, com
 * comentário), e quem tinha **146** era o `collection()` — o dobro dele, e o
 * lugar exato onde o campo de busca da Tarefa 29 entra. Cortei o `collection()`
 * (146 → **98**) e deixei o card, que é o menor e não é o que a 29 cresce.
 *
 * ⚠️ **E A PREVISÃO SE CUMPRIU NA 38g — no lugar certo e pelo motivo errado.**
 * O campo entrou de fato dentro do `collection()`, ao lado dos outros
 * controles, exatamente como este parágrafo dizia. O que ele não previu foi o
 * TAMANHO: quando o campo chegou, a tela já estava em 511 contra um teto de
 * 400, e a fatia só coube porque o campo e o casamento nasceram nos vizinhos.
 * Prever o lugar não é prever o custo.
 *
 * ⚠️ **A COSTURA QUE FICA REGISTRADA E NÃO CORTADA:** o card de grifo (63
 * linhas) tem quatro dependências da tela — `t`, o nome de quem escreveu, o
 * `bookId` e o `setConfirming`. Ele é fatia própria, com desenho de props, e
 * não é urgente: nenhuma fatia planejada mexe nele.
 *
 * ⚠️ **QUATRO REQUISIÇÕES, E NENHUMA ROTA NOVA** (medido: as quatro existem
 * desde as Tarefas 10, 24 e 26a). O livro dá o `clubId` (e faz o corte de
 * tenant) e o plano; as anotações e os grifos vêm do CLUBE filtrados por livro;
 * os membros resolvem o nome de quem escreveu.
 *
 * ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`. Dentro do clube não existe
 * conteúdo privado: as seis dimensões olham o MESMO acervo, e nenhuma esconde
 * nada de ninguém. Nunca rotular como privacidade, nunca cadeado. O que muda
 * entre "meu" e "dela" é **affordance**, não visibilidade — o que a outra
 * pessoa escreveu aparece inteiro.
 *
 * ⚠️ **E O RECORTE É NO CLIENTE.** As duas listagens aceitam `authorId` (e a de
 * grifo aceita `color`), mas usá-los faria cada toque num chip virar uma ida ao
 * servidor — e é por aí que a armadilha do `%23` da Tarefa 24 voltaria (`#` é
 * delimitador de fragmento numa URL: `?color=#facc15` não chega ao servidor).
 * Quando a paginação exigir filtro de servidor, a cor vai pela opção `query` do
 * `ApiClient`, que usa `URLSearchParams` e escapa sozinha — **nunca** por
 * concatenação.
 *
 * ⚠️ **NÃO HÁ EDITOR AQUI.** Nenhum `@clube/ui/editor`: o chunk de entrada do
 * PWA continua sem TipTap, e o acusador é o `bundle-guard.test.ts`, que compila
 * de verdade. Quem escreve são os formulários, e lá o editor entra por
 * `React.lazy()`.
 *
 * ⚠️ **E NADA AQUI COBRA NINGUÉM** (`docs/plano-clube-do-livro.md` §1): nenhum
 * contador ("3 de 30"), nenhum vermelho fora de erro real, e o acervo vazio
 * fala do que dá para fazer — nunca do que a pessoa deixou de registrar. O
 * acusador da palavra é o catálogo; o da cor e do número é a
 * varredura de DOM de `__tests__/acervo.test.tsx`, que roda em todos os estados
 * desta tela.
 */

/**
 * O 404 desta tela tem frase própria.
 *
 * Ele cobre três coisas que, para quem não é membro, são a mesma: livro de
 * outro clube, livro arquivado e id que não existe (o corte de tenant do
 * projeto é 404 e não 403 — `CLAUDE.md`). O genérico `errors.notFound` não diz
 * o quê, e aqui o "o quê" é o livro.
 */
const BOOK_STATUS: StatusMessages = {
  404: { key: 'pages.acervo.bookUnavailable' },
};

/** Retentar um 404 é pedir outra vez a mesma negativa. */
function isRetriable(error: unknown): boolean {
  return !(error instanceof ApiError && error.status === 404);
}

type BookState =
  | { status: 'loading' }
  | { status: 'ready'; book: BookResponse; planItems: readonly PlanDay[] }
  | { status: 'failed'; error: unknown };

const BOOK_LOADING: BookState = { status: 'loading' };

/**
 * ⚠️ **AS DUAS LISTAGENS SÃO **UM** ESTADO, e isso é decisão, não economia.**
 *
 * O acervo chega em duas requisições (`/notes` e `/highlights`), e cada uma
 * pode falhar sozinha. Guardar dois estados e renderizar o que deu certo
 * mostraria uma lista **silenciosamente incompleta**: a pessoa veria as
 * anotações, não veria grifo nenhum, e nada na tela diria por quê — que é
 * exatamente o defeito que a política de teste de UI do `CLAUDE.md` manda
 * cobrir ("só os fluxos que quebram em silêncio"). Uma lista unificada só é
 * verdadeira quando as duas metades chegaram.
 *
 * Ele é PRÓPRIO, e não um campo do `BookState`: as duas cargas só são possíveis
 * depois de o livro dizer de qual clube é, e falhar nelas não pode apagar o
 * cabeçalho que já está na tela.
 *
 * O `failed` NÃO carrega o `error`: esta tela tem uma frase própria para
 * qualquer falha do acervo e um "tentar de novo" que refaz a carga. Guardar o
 * objeto seria guardar texto da API que ninguém pode mostrar.
 */
type AcervoState =
  | { status: 'loading' }
  | {
      status: 'ready';
      notes: readonly NoteResponse[];
      highlights: readonly HighlightResponse[];
    }
  | { status: 'failed' };

const ACERVO_LOADING: AcervoState = { status: 'loading' };

/**
 * Para onde uma anotação leva.
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

export function AcervoPage() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const { error: meError, me, reload, status: meStatus } = useActiveClub();
  const navigate = useNavigate();
  const { bookId } = useParams();

  const [book, setBook] = useState<BookState>(BOOK_LOADING);
  const [bookAttempt, setBookAttempt] = useState(0);
  const [acervo, setAcervo] = useState<AcervoState>(ACERVO_LOADING);
  /**
   * O acervo tem o PRÓPRIO contador de tentativas — a lição medida do
   * `book.tsx`: reaproveitar o do livro fazia o "tentar de novo" do acervo
   * derrubar o cabeçalho e disparar requisições a mais. Cada carga com o seu
   * gatilho.
   */
  const [acervoAttempt, setAcervoAttempt] = useState(0);
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);
  /** O `value` do chip de pessoa — 'all' | 'mine' | 'others' | 'author:<id>'. */
  const [scope, setScope] = useState<string>(ALL_SCOPE);
  /** O `value` do chip de tipo — 'all' | 'PLAN' | 'FREE' | 'HIGHLIGHT'. */
  const [typeScope, setTypeScope] = useState<string>(EVERY_TYPE);
  /** O `value` da opção do `<select>` — 'all' ou um `planItemId`. */
  const [readingScope, setReadingScope] = useState<string>(EVERY_READING);
  const [color, setColor] = useState<HighlightColor | null>(null);
  /**
   * ⚠️ **A QUINTA DIMENSÃO — o texto CRU do campo (Tarefa 38g).**
   *
   * Cru de propósito: quem normaliza (as pontas e a maiúscula) é o `termOf` do
   * `acervo-entries.ts`, um dono só. Guardar aqui o valor já aparado faria o
   * campo perder o espaço no meio de duas palavras enquanto se digita.
   *
   * ⚠️ E ele **não** tem debounce, ao contrário do campo da `/busca`: o recorte
   * é no CLIENTE (decisão A), sobre o acervo que já está na memória, então não
   * há requisição a poupar nem espera a mostrar.
   */
  const [text, setText] = useState('');
  /**
   * ⚠️ **A SEXTA DIMENSÃO — as duas pontas CRUAS da faixa (Tarefa 38h).**
   *
   * Cruas pelo mesmo motivo do texto: quem decide o que é um limite é o
   * `boundOf` do `acervo-entries.ts`, um dono só. E elas são **um** estado, não
   * dois: "de" e "até" são as duas metades da mesma pergunta, e dois `useState`
   * seriam dois lugares de onde uma faixa pela metade poderia sair.
   */
  const [pageRange, setPageRange] = useState(EVERY_PAGE);
  /** O id do grifo que a confirmação de arquivamento está segurando. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [archiveFailed, setArchiveFailed] = useState(false);

  /**
   * A carga espera o `/me`: sem saber quem sou, "meu × dela" é chute — e a
   * armadilha nomeada da Tarefa 18 é justamente tratar `me === null` como "não
   * sou ninguém", o que mostraria o que é MEU como alheio, em silêncio.
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
        setBook({
          status: 'ready',
          book: data.book,
          // A ordem é a que a API devolveu (o `getBookWithPlan` ordena por
          // `order`). A tela NÃO reordena — duas ordens seriam duas verdades.
          planItems: data.planItems.map((item) => ({
            id: item.id,
            title: item.title,
          })),
        });
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
    setAcervo(ACERVO_LOADING);

    void Promise.all([
      api.get(
        `/clubs/${encodeURIComponent(clubOfBook)}/notes`,
        notesResponseSchema,
        // As duas queries saem pela opção `query` do cliente, que usa
        // `URLSearchParams` — nunca por concatenação.
        { query: { bookId: loadedBookId } },
      ),
      api.get(
        `/clubs/${encodeURIComponent(clubOfBook)}/highlights`,
        highlightsResponseSchema,
        { query: { bookId: loadedBookId } },
      ),
    ])
      .then(([notes, highlights]) => {
        if (cancelled) return;
        setAcervo({ status: 'ready', notes, highlights });
      })
      .catch(() => {
        if (cancelled) return;
        // `Promise.all` rejeita na PRIMEIRA falha, e é o que queremos: meio
        // acervo é uma lista incompleta em silêncio.
        setAcervo({ status: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubOfBook, loadedBookId, acervoAttempt]);

  /*
    QUEM É O CLUBE (a rota da Tarefa 26a). Efeito PRÓPRIO: uma falha aqui não
    apaga o acervo, e o filtro degrada em silêncio.

    ⚠️ **E O `acervoAttempt` ESTÁ NAS DEPENDÊNCIAS DE PROPÓSITO: o "tentar de
    novo" do acervo refaz ESTA carga também.** É a correção medida da Tarefa 27
    — sem ele, uma falha passageira nos nomes só se conserta recarregando o
    app, com o único botão de "tentar de novo" da seção ali do lado e sem efeito
    sobre o filtro.
  */
  useEffect(() => {
    if (clubOfBook === null) return;

    let cancelled = false;
    setMembers(MEMBERS_UNKNOWN);

    void api
      .get(
        `/clubs/${encodeURIComponent(clubOfBook)}/members`,
        clubMembersResponseSchema,
      )
      .then((list) => {
        if (cancelled) return;
        setMembers({ status: 'ready', members: list });
      })
      .catch(() => {
        /*
          Nada a escrever: o estado já é `unknown` desde o começo do efeito, e
          não há frase de erro para mostrar — ninguém lê um texto de servidor
          por causa de um chip. O `catch` existe para a rejeição ter dono.
        */
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubOfBook, acervoAttempt]);

  /**
   * `userId` → nome. O dono da regra é o `club-names.ts` (o `book.tsx` a
   * divide, para a sobreposição de autoria do plano) — aqui só se guarda o
   * `Map` por resposta, para a resolução de cada linha ser O(1).
   *
   * ⚠️ **REGRA 3 / DECISÃO G: as DUAS metades passam pelo MESMO resolvedor.**
   * Até a Tarefa 27 a anotação dizia "Maria" e o grifo dizia "Alguém do clube"
   * — a mesma pessoa, dois nomes, na mesma tela. Duas funções seriam duas
   * verdades sobre o mesmo nome, e é por isso que ela mora num módulo só.
   */
  const memberNames = useMemo(() => memberNamesOf(members), [members]);

  /**
   * Arquivar de verdade, depois da confirmação.
   *
   * ⚠️ **O grifo sai de UMA fonte, e é isso que o impede de ressuscitar.** A
   * tela não guarda "o acervo" e "o recorte" em dois estados: o recorte é
   * derivado no render, então tirar a linha do acervo a tira de todos os
   * recortes. Duas cópias fariam o grifo arquivado voltar no primeiro toque de
   * chip.
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
      setAcervo((previous) =>
        previous.status === 'ready'
          ? {
              ...previous,
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

  /**
   * O "TENTAR DE NOVO" — **um dono só, TRÊS chamadores** (Tarefa 38h).
   *
   * ⚠️ **É o mesmo motivo do `authorLabel` da 38g, e o mesmo da decisão G da
   * 27:** este botão estava escrito TRÊS vezes neste arquivo — o do `/me`, o do
   * livro e o do acervo —, com a mesma chave, a mesma variante e três gatilhos
   * diferentes. Três escritos do mesmo botão é a forma pela qual dois deles
   * saem de sincronia sem ninguém ver (foi o que aconteceu com o nome de quem
   * escreveu, entre as duas metades da lista, na Tarefa 27).
   *
   * ⚠️ **E O QUE ELE NÃO DECIDE É METADE DO DESENHO:** quem retenta, e **se**
   * vale retentar, continua sendo de quem chama — o `isRetriable` recusa o 404
   * do livro, e cada carga tem o próprio contador de tentativas. Ele é a
   * MARCAÇÃO do botão, não a política.
   */
  function retryButton(onRetry: () => void): ReactNode {
    return (
      <Button onClick={onRetry} variant="ghost">
        {t('pages.acervo.retry')}
      </Button>
    );
  }

  /**
   * A LINHA DE ANOTAÇÃO — o `ListItem` do design system, como no `book.tsx`.
   *
   * ⚠️ **ELA CONTINUA SENDO UM `ListItem` E A DE GRIFO NÃO PODE SER, e a razão
   * é do próprio componente:** o `ListItemProps` declara que o item inteiro é
   * um `button`/`a` e que o slot `end` é conteúdo **não interativo** — "um botão
   * dentro de outro é HTML inválido". A linha de grifo carrega DOIS controles (o
   * link de correção e o arquivar), então ela é um card próprio.
   *
   * A diferença visual entre as duas é o ADR 0004 visível: um grifo não se
   * parece com uma anotação porque não é uma anotação.
   */
  /**
   * REGRA 3 — AUTORIA EM TEXTO, e **uma** decisão para as duas metades.
   *
   * "Você" ganha do nome quando a linha é minha: eu não me leio pelo nome numa
   * lista em que também estão os outros. E o genérico entra quando a tela não
   * conhece as pessoas (o `/members` que falhou).
   *
   * ⚠️ **ELA VIROU FUNÇÃO NA TAREFA 38g, e o motivo é o mesmo da decisão G da
   * 27:** esta expressão estava escrita DUAS vezes neste arquivo — uma na linha
   * de anotação, outra na de grifo —, que é exatamente a forma pela qual as
   * duas metades voltaram a discordar sobre o nome da mesma pessoa na Tarefa
   * 27. O `nameOfWriter` já era um dono só; o "Você × o nome" não era.
   */
  function authorLabel(mine: boolean, writerName: string | null): string {
    return mine
      ? t('pages.acervo.item.author.you')
      : (writerName ?? t('pages.acervo.item.author.other'));
  }

  function noteRow(entry: NoteEntry, bookIdOfScreen: string): ReactNode {
    const { note } = entry;
    const mine = note.userId === myId;
    /*
      O avatar vai sem `label` de propósito: o nome já está escrito ao lado, e
      um `aria-label` igual faria o leitor de tela repetir.
    */
    const writerName = nameOfWriter(note.userId, me, memberNames);
    const author = authorLabel(mine, writerName);
    const excerpt = excerptOf(note.plainText, NOTE_EXCERPT_LENGTH);

    return (
      <ListItem
        // REGRA 2: o tipo é legível, não deduzido do endereço.
        end={t(
          note.kind === 'PLAN'
            ? 'pages.acervo.kind.plan'
            : 'pages.acervo.kind.free',
        )}
        href={noteTarget(note, bookIdOfScreen)}
        key={keyOf(entry)}
        // ⚠️ `Link` do roteador, NUNCA âncora crua: `<a href>` é navegação de
        // DOCUMENTO e recarrega o PWA inteiro — a lição medida da Tarefa 16.
        renderLink={listItemRouterLink}
        start={<PersonAvatar id={note.userId} name={writerName} size="sm" />}
        subtitle={excerpt === '' ? author : `${author} · ${excerpt}`}
        title={note.title}
      />
    );
  }

  /** A LINHA DE GRIFO — regras 2, 3 e 4. */
  function highlightRow(entry: HighlightEntry): ReactNode {
    const { highlight } = entry;
    const mine = highlight.userId === myId;
    const writerName = nameOfWriter(highlight.userId, me, memberNames);
    const comment = excerptOf(highlight.commentText, COMMENT_EXCERPT_LENGTH);

    return (
      <li className="flex" key={keyOf(entry)}>
        <div className="flex w-full flex-col gap-2 rounded-control border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {/*
              REGRA 2 — O TIPO EM TEXTO, EM TODA LINHA. Numa lista unificada, a
              cor não basta: é o ADR 0004 exigindo que o leitor não precise
              adivinhar que aquilo é grifo e não anotação.
            */}
            <span className="font-medium">
              {t('pages.acervo.kind.highlight')}
            </span>
            {/*
              A COR TEM NOME, e o nome é texto de verdade. A amostra é
              `aria-hidden` (o nome está ao lado); quem não distingue as cinco
              cores depende do nome, e cor como único portador de informação é
              o defeito que ninguém vê olhando.
            */}
            <ColorSwatch color={highlight.color} />
            <span>{t(COLOR_LABEL_KEYS[highlight.color])}</span>
            {/*
              SEM PÁGINA É SILÊNCIO. Nem "página null", nem o rótulo órfão: a
              ausência não se anuncia (é o anti-culpa aplicado ao espaço
              vazio).
            */}
            {highlight.page !== null ? (
              <span>
                {t('pages.acervo.item.page', { number: highlight.page })}
              </span>
            ) : null}
            {highlight.reference !== null ? (
              <span>{highlight.reference}</span>
            ) : null}
            {/* REGRA 3 — o MESMO `nameOfWriter` da anotação (decisão G). */}
            <PersonAvatar id={highlight.userId} name={writerName} size="sm" />
            <span>{authorLabel(mine, writerName)}</span>
          </div>

          <p className="text-content">
            {excerptOf(highlight.quote, QUOTE_EXCERPT_LENGTH)}
          </p>

          {/*
            SEM COMENTÁRIO, NENHUMA ÁREA DE COMENTÁRIO.

            ⚠️ A guarda é a PRÉVIA VAZIA, e não `commentDoc === null`, e a razão
            é que ela fecha os dois casos com um dono só: `commentText` é
            DERIVADO do `commentDoc` no backend (ADR 0001), então `null` no
            documento implica `''` no texto — e o documento que EXISTE e não diz
            nada (o parágrafo em branco que o editor emite) também cai aqui.
          */}
          {comment === '' ? null : (
            <p className="text-sm text-muted">{comment}</p>
          )}

          {/*
            REGRA 4 — SÓ O MEU GRIFO TEM AS AÇÕES.

            O alheio aparece INTEIRO e sem affordance nenhuma: nem link de
            correção, nem arquivar. Isso é AUTORIA, não privacidade — o trecho
            está aqui porque dentro do clube não existe conteúdo privado
            (ADR 0002), e o filtro nunca é rotulado como permissão.

            ⚠️ **E ELE NÃO TEM NEM LINK, ao contrário da anotação alheia** — a
            assimetria é MEDIDA, não gosto: a anotação de outra pessoa abre em
            LEITURA (o `free-note.tsx` decide leitura × correção pela autoria),
            e para grifo **não existe tela de leitura** — o `highlight-form.tsx`
            recusa o grifo alheio com `pages.highlightForm.notYours`. Um link
            levaria a um beco.
          */}
          {mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className={TEXT_LINK_CLASS}
                to={highlightPath(bookIdOfPath, highlight.id)}
              >
                {t('pages.acervo.item.edit')}
              </Link>
              <Button
                onClick={() => {
                  setConfirming(highlight.id);
                }}
                variant="ghost"
              >
                {t('pages.acervo.item.archive')}
              </Button>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  function rowOf(entry: AcervoEntry, bookIdOfScreen: string): ReactNode {
    return entry.type === 'HIGHLIGHT'
      ? highlightRow(entry)
      : noteRow(entry, bookIdOfScreen);
  }

  function collection(
    bookIdOfScreen: string,
    readings: readonly PlanDay[],
  ): ReactNode {
    if (acervo.status === 'loading') {
      return <p className="text-sm text-muted">{t('pages.acervo.loading')}</p>;
    }

    if (acervo.status === 'failed') {
      return (
        <Notice
          action={retryButton(() => {
            setAcervoAttempt((previous) => previous + 1);
          })}
          title={t('pages.acervo.unavailable')}
        />
      );
    }

    const all = mergeEntries(acervo.notes, acervo.highlights);

    /**
     * ⚠️ **REGRA 12 — SEMPRE EXATAMENTE UM CHIP ACESO POR GRUPO, e o recorte é
     * DERIVADO do que está na tela.**
     *
     * Um `scope` sem chip correspondente volta para o neutro. Sem isto, quatro
     * caminhos reais deixam um grupo com NENHUM chip aceso e a lista recortada
     * por um critério invisível: escolher "De outras pessoas" enquanto os
     * membros carregam (o chip morre quando eles chegam), ficar num chip de
     * quem saiu do clube no meio da sessão, e — o caminho que a decisão E cria
     * — escolher uma cor e depois trocar o tipo para um que exclui grifo.
     */
    const authors = authorOptions(t, members, me);
    const selectedAuthor = authors.some((option) => option.value === scope)
      ? scope
      : ALL_SCOPE;

    /**
     * ⚠️ **DECISÃO E, GENERALIZADA: cada dimensão condicional EXISTE só quando o
     * tipo selecionado pode carregar aquele campo** (`acervo-entries.ts`). São
     * **três** dimensões condicionais desde a Tarefa 38h: a cor e a faixa de
     * página pedem tipo ∈ {Tudo, Grifo} — a MESMA pergunta, e por isso o MESMO
     * booleano —, e a leitura pede tipo ∈ {Tudo, Do dia}.
     *
     * ⚠️ **E SÃO DUAS REGRAS COM UM DONO CADA, não uma regra com dois donos.**
     * Estes dois booleanos decidem se o controle **EXISTE** (é só render); o
     * `onSelect` do grupo de tipo, mais abaixo, decide se a escolha
     * **SOBREVIVE** (`setColor(null)` + `setReadingScope(EVERY_READING)` +
     * `setPageRange(EVERY_PAGE)`). O recorte em si **não** repete nenhuma das
     * duas.
     *
     * ⚠️ **DOIS BOOLEANOS PARA TRÊS CONTROLES, e não é descuido:** a cor e a
     * faixa fazem a mesma pergunta ao mesmo tipo, então um segundo
     * `pageApplies` seria um segundo nome para o MESMO valor — que é como um dos
     * dois deixa de acompanhar o outro (decisão C da 38h, e a razão de o
     * booleano ter deixado de se chamar `colorApplies`).
     *
     * A primeira versão desta fatia repetia: ela passava
     * `color: <o booleano> ? color : null` ao `filterEntries`, e a auditoria
     * mediu o preço — mutar aquela condição para `color,` dava **0 acusadores em
     * 557**, porque não existe caminho com cor escolhida e grupo escondido (o
     * reset roda em TODO toque de tipo). Era código morto com um docblock
     * afirmando que ele era o dono único — a forma do §7.4 que esta sessão já
     * pegou no `isRetriable`.
     *
     * ⚠️ **REMEDIDO na rodada de correção da Tarefa 38g, na direção de hoje:**
     * reintroduzir aquela condição aqui dá **0 acusadores em 777**. Os dois
     * escritos continuam indistinguíveis; o que envelheceu era só o denominador
     * (557 era o tamanho da suíte do app na Tarefa 28), e um número velho o
     * bastante faz o próximo leitor desconfiar da afirmação que está certa.
     *
     * ⚠️ **O NOME DO BOOLEANO NÃO É CITADO NOS DOIS PARÁGRAFOS ACIMA, e a
     * omissão é deliberada:** eles descrevem um mutante que alguém pode querer
     * reaplicar, e até a 38h diziam `colorApplies` — um `const` que já não
     * existia. Quem for remedir lê o nome no código, três linhas abaixo, não
     * numa citação que envelhece sozinha.
     */
    const typeFilter = typeFromChipValue(typeScope);
    /*
      ⚠️ **UM BOOLEANO PARA AS DUAS DIMENSÕES DE GRIFO — decisão C da Tarefa
      38h, e ela diz "reuse-o; não escreva um segundo".**

      A faixa de página faz a MESMA pergunta que a cor já fazia ("o tipo
      selecionado pode incluir um grifo?"), e a resposta é a mesma função. Um
      `pageApplies = typeCanIncludeHighlight(typeFilter)` ao lado seria um
      segundo nome para o MESMO valor — e dois nomes é como um dos dois deixa de
      acompanhar o outro. Por isso o booleano deixou de se chamar `colorApplies`
      aqui: ele nunca foi sobre a cor, era sobre o GRIFO.

      A prop do `filterGroups` continua `colorApplies` porque lá ela é sobre o
      grupo de cor, que é o único que aquele módulo constrói.
    */
    const highlightApplies = typeCanIncludeHighlight(typeFilter);
    const readingApplies = typeCanCarryReading(typeFilter);

    /*
      ⚠️ A DERIVAÇÃO DA LEITURA CONTINUA, e ela é DEFENSIVA: hoje o `<select>` e
      o plano vêm da MESMA carga (`GET /books/:bookId`), então não há caminho em
      que a opção escolhida deixe de existir — e é por isso que este ramo **não
      tem acusador**, ao contrário do chip de pessoa. Ele fica porque a
      alternativa é um recorte por um `planItemId` que não está mais em opção
      nenhuma. Onde a propriedade É decidível é no chip de pessoa e no grupo de
      cor, e é lá que ela tem teste (§7.10: a afirmação de indecidibilidade vem
      com o endereço da prova).
    */
    const selectedReading = readings.some((day) => day.id === readingScope)
      ? readingScope
      : EVERY_READING;

    const visible = filterEntries(
      all,
      {
        author: selectedAuthor,
        type: typeFilter,
        color,
        reading: selectedReading === EVERY_READING ? null : selectedReading,
        text,
        page: pageRange,
      },
      myId,
    );

    /**
     * ⚠️ **AS DIMENSÕES VÃO NO COMPONENTE COMPARTILHADO** (Tarefa 27, regra 7):
     * o `role="group"`, o `aria-label` e o `aria-pressed` são do `FilterBar`, e
     * o que sobra ao app é **o vocabulário e a marcação** — `packages/ui` não
     * traduz (decisão B da Tarefa 13). Esta tela é o **terceiro** consumidor
     * dele, e a primeira a passar mais de um grupo: é o que a decisão G da 27
     * ("agnóstico de dimensão") comprou, sem uma linha nova em `packages/ui`.
     *
     * ⚠️ **E O CONSTRUTOR MORA EM `acervo-filters.tsx`, por medição.** Este
     * `collection()` tinha **146** linhas — o dobro do card de grifo (63) —, e é
     * aqui que o campo de texto mora. O docblock daquele módulo tem a conta por
     * função e explica por que ele não pôde ir para o `acervo-entries.ts` (o
     * `FilterOption.start` é `ReactNode`).
     *
     * ⚠️ **ESTE PARÁGRAFO DIZIA "é aqui que o campo de busca da Tarefa 29
     * ENTRA", no futuro — e o campo já entrou.** Ele é o `<TextFilter/>`,
     * algumas linhas abaixo, neste mesmo `collection()`, e veio da **Tarefa
     * 38g**, não da 29: a 29 construiu a `/busca` do CLUBE, em tela própria, e
     * a 38g é que trouxe o texto para cá.
     *
     * ⚠️ **A PREVISÃO ESTAVA ESCRITA EM TRÊS LUGARES, e esta foi a que ficou
     * para trás — dentro da função onde o campo vive.** As outras duas (o
     * docblock do topo e o do `acervo-filters.tsx`) foram corrigidas na entrega
     * da 38g; esta sobrou, e é o pior lugar possível para uma promessa já
     * cumprida: quem lê o `collection()` lia que o campo ainda vai entrar, ao
     * lado do campo. Achado MÉDIO da auditoria da 38g, e é a forma exata que
     * este repositório audita — duas verdades sobre a mesma coisa, uma delas
     * no futuro.
     *
     * ⚠️ **A DERIVAÇÃO DO QUE ESTÁ ACESO CONTINUA AQUI, e é regra 12:** a tela
     * precisa do MESMO valor para recortar a lista, e dois lugares calculando
     * "qual chip está aceso" seriam duas verdades.
     */
    const groups = filterGroups({
      authors,
      color,
      colorApplies: highlightApplies,
      onAuthor: setScope,
      onColor: (value) => {
        setColor(colorFromChipValue(value));
      },
      onType: (value) => {
        setTypeScope(value);
        /*
          ⚠️ **AS TRÊS ESCOLHAS CONDICIONAIS SÃO DESCARTADAS — regra 9, segunda
          direção, e nas TRÊS dimensões** (a faixa de página entrou na 38h).

          Sem isto elas ficariam valendo por baixo de um controle que
          desapareceu, e voltariam a acender sozinhas quando o tipo voltasse a
          aceitá-las: o acervo apareceria recortado por amarelo (ou por um dia do
          plano) sem ninguém ter tocado naquele controle.

          ⚠️ **ESTE É O ÚNICO DONO DA REGRA, e é o que o recorte NÃO repete**: os
          booleanos `highlightApplies`/`readingApplies` decidem se o controle
          EXISTE; estas TRÊS linhas decidem se a escolha SOBREVIVE. Repetir a
          condição no `filterEntries` foi medido como código morto e saiu — 0
          acusadores em 557 na Tarefa 28, e 0 em 777 quando a rodada de correção
          da 38g remediu.

          ⚠️ **ESTE PARÁGRAFO DIZIA `colorApplies` E "estas duas linhas" até a
          rodada de correção da 38h** — metade do comentário tinha sido
          atualizada (o cabeçalho, três linhas acima, já dizia TRÊS) e esta
          metade não, que é justamente a que se lê primeiro ao chegar nos
          setters. O `colorApplies` não existia mais como declaração: o `const`
          passou a se chamar `highlightApplies` quando a faixa de página herdou
          a MESMA pergunta. É a lição do `dayRange` do `CLAUDE.md` — um nome
          que não existe faz o próximo leitor procurar, não achar, e inventar um
          terceiro.

          ⚠️ **E A LINHA DA LEITURA É O CONSERTO DA RODADA:** ela faltava, e a
          justificativa escrita ("generalizar tornaria a regra 11 impossível")
          era falsa — o teste da regra 11 já põe o tipo no neutro. §7.10: meça
          antes de escrever que não dá.
        */
        setColor(null);
        setReadingScope(EVERY_READING);
        setPageRange(EVERY_PAGE);
      },
      selectedAuthor,
      t,
      typeScope,
    });

    return (
      <>
        {/*
          Os controles só existem se houver acervo: filtrar o vazio é oferecer
          uma escolha que não muda nada (a lição do `book.tsx`).
        */}
        {all.length === 0 ? null : (
          <div className="flex flex-col gap-3">
            <FilterBar groups={groups} />

            <TextFilter onText={setText} t={t} text={text} />

            {/*
              ⚠️ **QUEM DECIDE SE A LEITURA EXISTE É ESTA TELA**, e são DUAS
              condições, não uma:

              - **o livro tem plano?** Um `<select>` com uma opção só é um
                controle que não pode fazer nada, e livro sem plano é caminho
                real (a tela do livro tem estado próprio para ele desde a
                Tarefa 17);
              - **o tipo pode carregar leitura?** (`readingApplies`, decisão E
                generalizada). Com o tipo em "Avulsa" ou "Grifo" o controle
                seria pior que inútil: cada opção **garantiria** zero
                resultados, porque nenhum dos dois tem `planItemId`.

              A marcação e o vocabulário são do `ReadingSelect`
              (`acervo-filters.tsx`), que documenta por que é `<select>` nativo
              e não chips (decisão D: o plano real tem trinta dias). Um `if`
              lá dentro seria um segundo dono da regra de existência.
            */}
            {readings.length === 0 || !readingApplies ? null : (
              <ReadingSelect
                onSelect={setReadingScope}
                readings={readings}
                selected={selectedReading}
                t={t}
              />
            )}

            {/*
              ⚠️ **A FAIXA DE PÁGINA SÓ EXISTE QUANDO O TIPO PODE INCLUIR GRIFO**
              (decisão C da 38h) — é a decisão E de novo, pelo MESMO booleano do
              grupo de cor: página só existe em grifo, e um controle que só pode
              esvaziar a lista é pior que um controle escondido.

              ⚠️ **E QUEM DECIDE É ESTA TELA**, como no `<select>` de leitura: um
              `if` dentro do `PageRangeFilter` seria um segundo dono da regra de
              existência.
            */}
            {highlightApplies ? (
              <PageRangeFilter onRange={setPageRange} range={pageRange} t={t} />
            ) : null}
          </div>
        )}

        {visible.length === 0 ? (
          /*
            REGRA 5: o vazio não cobra ninguém, e são **TRÊS** vazios desde a
            Tarefa 38g — "registre o primeiro" seria mentira embaixo de um
            recorte que só escondeu o que já existe, e "solte um chip" seria
            mentira embaixo de uma palavra que não achou.

            ⚠️ **QUAL DAS TRÊS FRASES É DECISÃO DO MODELO** (`emptyTitleKey`, em
            `acervo-entries.ts`): ela é pura, tem unitário próprio e fica ao
            lado do `filterEntries` — que é o que impede a FRASE e o RECORTE de
            discordarem. A descrição fica aqui porque ela não é uma escolha:
            só o acervo realmente vazio tem o que sugerir.
          */
          <Notice
            description={
              all.length === 0 ? t('pages.acervo.empty.description') : undefined
            }
            title={t(emptyTitleKey(all.length > 0, text))}
          />
        ) : (
          <List aria-label={t('pages.acervo.label')} className="gap-2">
            {visible.map((entry) => rowOf(entry, bookIdOfScreen))}
          </List>
        )}
      </>
    );
  }

  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={retryButton(reload)}
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    if (book.status === 'loading' || me === null) {
      return <p className="text-sm text-muted">{t('pages.acervo.loading')}</p>;
    }

    if (book.status === 'failed') {
      return (
        <Notice
          action={
            isRetriable(book.error)
              ? retryButton(() => {
                  setBookAttempt((previous) => previous + 1);
                })
              : undefined
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
        {/* O livro é o CONTEXTO: o nome da tela é "Acervo", e o título do
            livro diz de qual acervo se trata. */}
        <p className="text-sm text-muted">{book.book.title}</p>

        {/*
          Escrever é EXPLÍCITO, e os botões ficam FORA do acervo de propósito:
          eles existem mesmo quando a lista não carregou, porque registrar não
          depende de conseguir ler. E são DOIS destinos, porque o grifo não é
          uma anotação (ADR 0004).
        */}
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              navigate(freeNoteNewPath(book.book.id));
            }}
          >
            {t('pages.acervo.newNote')}
          </Button>
          <Button
            onClick={() => {
              navigate(highlightNewPath(book.book.id));
            }}
            variant="ghost"
          >
            {t('pages.acervo.newHighlight')}
          </Button>
        </div>

        {archiveFailed ? (
          <p className="text-sm text-danger" role="alert">
            {t('pages.acervo.archive.failed')}
          </p>
        ) : null}

        {collection(book.book.id, book.planItems)}

        {/*
          ARQUIVAR PEDE CONFIRMAÇÃO, e cancelar não chama a API.

          Fechado, o `Sheet` NÃO está no DOM (regra 15 da Tarefa 13), então o
          "Cancelar" não tem como disparar nada — e o foco volta para o botão
          que o abriu. É destrutivo do ponto de vista de quem escreveu, mesmo
          sendo soft delete.
        */}
        <Sheet
          closeLabel={t('pages.acervo.archive.close')}
          onClose={() => {
            setConfirming(null);
          }}
          open={confirming !== null}
          title={t('pages.acervo.archive.title')}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              {t('pages.acervo.archive.description')}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => {
                  setConfirming(null);
                }}
                variant="ghost"
              >
                {t('pages.acervo.archive.cancel')}
              </Button>
              <Button
                onClick={() => {
                  if (confirming !== null) void archive(confirming);
                }}
              >
                {t('pages.acervo.archive.confirm')}
              </Button>
            </div>
          </div>
        </Sheet>
      </>
    );
  }

  return <Screen title={t('pages.acervo.title')}>{body()}</Screen>;
}
