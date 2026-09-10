import {
  type BookResponse,
  booksResponseSchema,
  clubMembersResponseSchema,
  type HighlightResponse,
  highlightsResponseSchema,
  type NoteResponse,
  notesResponseSchema,
} from '@clube/shared';
import { Button, Field, List, ListItem, PersonAvatar } from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import {
  type AcervoEntry,
  COMMENT_EXCERPT_LENGTH,
  excerptOf,
  type HighlightEntry,
  keyOf,
  mergeEntries,
  NOTE_EXCERPT_LENGTH,
  type NoteEntry,
  QUOTE_EXCERPT_LENGTH,
} from './acervo-entries';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import {
  memberNamesOf,
  MEMBERS_UNKNOWN,
  type MembersState,
  nameOfWriter,
} from './club-names';
import { dayNotePath } from './day-note';
import { messageFor, resolveApiError } from './form-errors';
import { TEXT_INPUT_CLASS } from './form-styles';
import { freeNotePath } from './free-note';
import { COLOR_LABEL_KEYS, ColorSwatch } from './highlight-colors';
import { highlightPath } from './paths';

/**
 * A BUSCA NO ACERVO DO CLUBE (Tarefa 29) — **a última fatia do MVP 2.**
 *
 * ⚠️ **ELA É A CHAMADORA QUE O FILTRO `text` NUNCA TEVE.** O `NoteFilter.text`
 * existe, funciona e está coberto por integração **desde a Tarefa 10**, e
 * nenhuma tela jamais o chamou — o `NoteFilter` nasceu com ele porque a Tarefa
 * 10 *era* a fatia da busca. Aqui ele ganha uso, o grifo ganha o dele
 * (`HighlightFilter.text`, decisão A: casa `quote` **ou** `commentText`), e a
 * busca atravessa o **clube** — não um livro.
 *
 * ⚠️ **O NÚMERO DE LINHAS VEM DE UM COMANDO, e é o único do projeto** (a
 * auditoria da Tarefa 25 achou três contagens diferentes para o mesmo arquivo no
 * mesmo commit). É o mesmo comando do `acervo.tsx`:
 *
 *   node -e "const f=require('fs').readFileSync(process.argv[1],'utf8');
 *     const s=f.replace(/[/][*][\s\S]*?[*][/]/g,'');
 *     console.log(s.split(/\n/).filter(l=>l.trim()
 *     && !l.trim().startsWith('//')).length)" <arquivo>
 *
 * ⚠️ **A BUSCA É DO SERVIDOR, e não do cliente** (decisão C). A decisão fechada
 * do MVP 2 diz `ILIKE`, e substring em JavaScript **não é** `ILIKE` — a
 * diferença é justamente o curinga (que o `toLikePattern` do repositório escapa)
 * e o acento (que o `ILIKE` respeita). E o acervo do clube **inteiro** não está
 * carregado em tela nenhuma: carregá-lo para filtrar seria trafegar tudo para
 * descartar quase tudo.
 *
 * ⚠️ **QUATRO REQUISIÇÕES, E NENHUMA ROTA NOVA.** As duas listagens
 * (`/clubs/:clubId/notes?text=` e `/clubs/:clubId/highlights?text=`) são as
 * mesmas das Tarefas 10 e 24, com um parâmetro que a 29 acrescentou à borda; a
 * estante (`/clubs/:clubId/books`) dá o **título de cada livro** e os membros
 * (`/clubs/:clubId/members`) dão o **nome de quem escreveu**. As duas últimas
 * carregam **uma vez** por clube — não por busca.
 *
 * ⚠️ **DENTRO DO CLUBE NADA É PRIVADO, e a busca não é exceção** (ADR 0002):
 * ela acha o que a outra pessoa escreveu, com autoria e inteiro. O que muda
 * entre "meu" e "dela" é **affordance**, nunca visibilidade — e nada aqui é, nem
 * pode ser nomeado como, privacidade.
 *
 * ⚠️ **NADA AQUI COBRA NINGUÉM** (`docs/plano-clube-do-livro.md` §1): **não há
 * contador de resultados** (decisão G — "12 resultados" é a forma que a
 * `COUNTER_SHAPE` da varredura anti-culpa proíbe, e ela existe por decisão de
 * produto: "incentivo por presença, não por comparação"), nenhum vermelho fora
 * de erro real, e o estado sem resultado fala da palavra, nunca de quem escreveu
 * pouco. Se o dono quiser o número, é ele que decide relaxar a guarda.
 *
 * ⚠️ **NÃO HÁ EDITOR AQUI.** Nenhum `@clube/ui/editor`: o chunk de entrada do
 * PWA continua sem TipTap, e o acusador é o `bundle-guard.test.ts`, que compila
 * de verdade. Quem escreve são os formulários, e lá o editor entra por
 * `React.lazy()`.
 *
 * ⚠️ **O `matchesAuthor` do `acervo-entries.ts` NÃO É CHAMADO AQUI, e é
 * deliberado.** Aquele docblock registra que esta tela seria "a segunda
 * chamadora" e que o ramo `myId === null` dele é inalcançável no acervo — quem o
 * chamasse com `me` nulo herdaria a lista partida ao contrário **sem teste**.
 * Esta tela não parte a lista por autoria (não há filtro de pessoa aqui: a
 * pergunta é "onde está esta palavra" — decisão do escopo enxuto), então ela
 * reusa só o que é do MODELO: a entrada (`AcervoEntry`), a `key` (`keyOf`) e a
 * ordem (`mergeEntries`). O ramo continua sem chamador; ele **não** ganhou um
 * por acidente.
 */

/**
 * ⚠️ **O TETO DE 500 LINHAS POR LISTAGEM — A DECISÃO, ESCRITA (regra 16).**
 *
 * Cada repositório corta o `find` em **500 linhas** (`FIND_ROW_LIMIT`, em
 * `prisma-note-repository.ts` e `prisma-highlight-repository.ts`), ordenadas por
 * `createdAt desc`. Então um clube com mais de 500 **anotações** (ou mais de 500
 * **grifos**) que casam o termo perde as mais antigas — **em silêncio**.
 *
 * **A decisão desta tela é NÃO DIZER NADA, e o teto fica registrado aqui como
 * dívida com o número.** As duas alternativas foram consideradas e as duas
 * custam mais do que compram:
 *
 * 1. **Um aviso quando a listagem volta com exatamente 500 linhas.** Ele exigiria
 *    o **front conhecer o 500** — um **terceiro dono** de um número que já vive
 *    duas vezes no backend (uma constante por repositório, cada uma com o próprio
 *    docblock justificando por que são o mesmo valor). No dia em que alguém
 *    mudar o teto, a tela mente na direção pior: fica calada quando cortou, ou
 *    avisa quando não cortou. O conserto honesto é o **servidor** dizer que
 *    truncou (um campo na resposta, ou um header) — e isso é mudança de
 *    **contrato de rota**, que pelo §6.8 exige campo `optional()` primeiro e os
 *    dois lados subindo juntos: **fatia própria**, fora desta.
 * 2. **Mostrar a contagem** e deixar a pessoa concluir. É exatamente o que a
 *    decisão G proíbe (`COUNTER_SHAPE`), por decisão de produto.
 *
 * E a ordem de grandeza da dívida, para quem a for pagar: o plano real tem ~30
 * dias por livro e o clube inicial tem 2 pessoas, ou seja **~60 anotações por
 * livro-mês**. 500 anotações são ~8 meses de registro **completo** — e o corte só
 * morde se o termo casar **todas** elas.
 *
 * ⚠️ **MAS ESSA CONTA VALE SÓ PARA A ANOTAÇÃO DO PLANO, e o prazo real é MUITO
 * mais curto — correção medida da auditoria.** Os 60/mês saem de "um dia, uma
 * pessoa, uma anotação", que é o único caso com teto natural:
 *
 * - a anotação **AVULSA é ilimitada** (o índice único é `(planItemId, userId)`,
 *   e ele **não compara `NULL` com `NULL`** — é o que faz N avulsas do mesmo
 *   autor conviverem, decisão do `BACKLOG` registrada no
 *   `NoteRepositoryFake.assertUniquePlanItemAndUser`);
 * - o **GRIFO é ilimitado**, e está escrito no docblock do próprio
 *   `PrismaHighlightRepository` ("a tabela não tem `@@unique`", "grifar o mesmo
 *   trecho outra vez, com outra cor, é o caso de uso");
 * - e o corte é por **listagem do clube inteiro** — todos os livros, todo o
 *   tempo —, não por livro nem por mês.
 *
 * Um leitor que grifa 5 trechos por dia chega a 500 grifos em **~3 meses,
 * sozinho**. Então a dívida não é "distante": ela é **do grifo primeiro**, e o
 * prazo é de meses, não de anos. Continua sendo dívida escrita e não aviso na
 * tela, pelos dois motivos acima (o terceiro dono do número e a decisão G) — mas
 * quem a for pagar deve olhar o **grifo**, não a anotação do plano.
 *
 * ⚠️ **E NÃO HÁ CONSTANTE AQUI DE PROPÓSITO.** Um `const FIND_ROW_LIMIT = 500`
 * nesta tela seria justamente o terceiro dono descrito acima, e um número que
 * nenhuma linha de código lê é pior que a prosa: ele *parece* estar em uso.
 */

/**
 * ⚠️ **O MÍNIMO DE CARACTERES — e ele existe para NÃO PEDIR NADA** (decisão F,
 * regra 9).
 *
 * Uma letra casa quase tudo e custa **duas** consultas de até 500 linhas cada.
 * Duas letras já recortam de verdade. O número é do produto, não da rede: um
 * termo de uma letra não é uma busca, é um acidente de teclado.
 *
 * ⚠️ E o corte é sobre o termo **já sem as pontas**: `' a '` tem três
 * caracteres e uma letra.
 */
const MIN_TERM_LENGTH = 2;

/**
 * ⚠️ **O DEBOUNCE — 400 ms, e ele é DEBOUNCE, não throttle.**
 *
 * A espera **reinicia** a cada tecla (o `clearTimeout` da limpeza do efeito),
 * então digitar "esmeralda" dispara **uma** busca e não nove. Um throttle
 * dispararia a cada 400 ms de digitação contínua — nove requisições para um
 * termo.
 *
 * ⚠️ **400 e não os 1500 do autosave** (Tarefa 18), e a diferença é o que a
 * espera custa: no autosave, esperar protege o servidor de uma escrita por
 * tecla e a pessoa **não está esperando resposta**; aqui a pessoa está olhando a
 * lista, e 1500 ms de tela parada em cima de um campo de busca é a tela parecendo
 * quebrada. 400 ms é abaixo do limiar em que a espera é percebida como travamento
 * e acima do intervalo entre teclas de quem digita rápido.
 *
 * ⚠️ **E ISSO SE PROVA POR CONTAGEM, com timers falsos — nunca por cronômetro**
 * (`docs/CONVENCOES-CODIGO.md` §7.3). O teste de fronteira é o da Tarefa 18: um
 * tique **antes** do prazo, **zero** requisições; no tique, **duas** (as duas
 * listagens). Teste de tempo real é instável por construção.
 */
const SEARCH_DEBOUNCE_MS = 400;

/**
 * ⚠️ **AS DUAS LISTAGENS SÃO UM ESTADO, e é o precedente MEDIDO da Tarefa 28.**
 *
 * A busca chega em duas requisições, e cada uma pode falhar sozinha. Guardar dois
 * estados e mostrar o que deu certo daria uma lista **silenciosamente
 * incompleta**: a pessoa veria as anotações, não veria grifo nenhum, e nada na
 * tela diria por quê — que é exatamente o defeito que a política de teste de UI
 * do `CLAUDE.md` manda cobrir ("só os fluxos que quebram em silêncio"). Uma busca
 * só é verdadeira quando as duas metades chegaram, e é o `Promise.all` — que
 * rejeita na PRIMEIRA falha — que garante isso (regra 14).
 *
 * O `failed` **não** carrega o `error`: esta tela tem uma frase própria para
 * qualquer falha da busca e um "tentar de novo" que refaz **as duas**. Guardar o
 * objeto seria guardar texto da API que ninguém pode mostrar (§6.2).
 *
 * ⚠️ E o `idle` é um estado **próprio**, não "ready com zero" (regra 11): "ainda
 * não me disseram o que procurar" e "procurei e não achei" são frases diferentes,
 * e é a lição das Tarefas 19, 25 e 28 — os dois estados nunca são o mesmo.
 */
type ResultsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      notes: readonly NoteResponse[];
      highlights: readonly HighlightResponse[];
    }
  | { status: 'failed' };

const RESULTS_IDLE: ResultsState = { status: 'idle' };

/** Identidade estável para o `useMemo` da estante (evita `Map` novo por render). */
const NO_BOOKS: readonly BookResponse[] = [];

/**
 * Para onde uma anotação leva — o mesmo mapeamento do acervo.
 *
 * A do DIA abre a tela do dia (é lá que ela se escreve: o `upsertPlanNote`, e o
 * `editNote` recusa nota do dia de propósito). A avulsa abre a tela da avulsa,
 * que decide sozinha entre correção e leitura pela autoria — e é por isso que a
 * anotação ALHEIA tem link e o grifo alheio não.
 *
 * ⚠️ **ELE ESTÁ DUPLICADO COM O `acervo.tsx` E ISSO É DECISÃO MEDIDA, NÃO
 * DESCUIDO — registrado, não consertado (achado BAIXO 4 da auditoria).**
 *
 * O `excerptOf` e as três constantes de prévia **desceram** para o
 * `acervo-entries.ts` na mesma rodada, e este **não** desceu. A diferença é uma
 * só: ele precisa de `dayNotePath` e `freeNotePath`, que moram em duas **TELAS**
 * (`day-note.tsx` e `free-note.tsx`). Os dois lares candidatos foram medidos e
 * os dois custam mais do que a duplicação:
 *
 * - **`paths.ts` é CICLO DE VERDADE, medido:** `free-note.tsx:26` **já importa**
 *   `paths.ts` (o `acervoPath`), então um `paths.ts → free-note.tsx` fecha o
 *   ciclo. E os dois lados têm `const` de MÓDULO (`AUTOSAVE_DELAY_MS`,
 *   `SAVED_RESET_MS`) — exatamente a forma que a auditoria da Tarefa 20 mediu e
 *   precificou: uma `const` de módulo lida através da aresta derruba a rota **no
 *   import**, tela branca, e qual lado é o frágil depende só da ordem alfabética
 *   dos imports do `router.tsx`.
 * - **`acervo-entries.ts` não fecha ciclo hoje**, mas poria dois `.tsx` no grafo
 *   do módulo cujo valor declarado é justamente **não saber o que é React** — e
 *   o docblock dele promete, hoje, que "ele não importa nenhuma tela, e é isso
 *   que o mantém livre do ciclo". Trocar uma promessa verdadeira por um
 *   comentário do tipo "hoje ainda não morde" é a armadilha que aquele mesmo
 *   docblock nomeia.
 *
 * E a duplicação **está guardada nos dois lados**, medido: mutar a condição para
 * `false` (tudo vira avulsa) acusa **3** testes em `acervo.test.tsx` e **1** em
 * `busca.test.tsx`. Não é uma cópia que possa divergir em silêncio.
 *
 * ⚠️ **O CONSERTO LIMPO EXISTE E ESTÁ FORA DA AUTORIZAÇÃO DESTA FATIA**, para
 * quem o for fazer: mover `DAY_NOTE_PATH`/`dayNotePath` e
 * `FREE_NOTE_PATH`/`freeNotePath` **para o `paths.ts`** e deixar as duas telas
 * REEXPORTANDO-os — que é o precedente já estabelecido no próprio `paths.ts`
 * ("o `book.tsx` REEXPORTA `BOOK_PATH`/`bookPath` daqui de propósito"). Aí o
 * `noteTarget` cabe no `paths.ts` sem ciclo nenhum, e `acervo-entries.ts`
 * continua neutro. Isso toca `day-note.tsx` e `free-note.tsx`, que esta fatia
 * não pode tocar.
 */
function noteTarget(note: NoteResponse): string {
  return note.kind === 'PLAN' && note.planItemId !== null
    ? dayNotePath(note.bookId, note.planItemId)
    : freeNotePath(note.bookId, note.id);
}

export function BuscaPage() {
  const { t } = useTranslation();
  const { api } = useAuth();
  const {
    activeClub,
    error: meError,
    me,
    reload,
    status: meStatus,
  } = useActiveClub();

  /** O que está no campo, tecla por tecla. */
  const [term, setTerm] = useState('');
  /**
   * O termo que a busca de fato usou — o campo **depois** do debounce e do
   * mínimo. Dois estados e não um: é a distância entre eles que faz o debounce
   * existir, e é `query` (nunca `term`) que entra nas dependências do efeito que
   * pede.
   */
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultsState>(RESULTS_IDLE);
  /**
   * O "tentar de novo" da busca tem contador PRÓPRIO — a lição medida do
   * `book.tsx` e do `acervo.tsx`: um contador compartilhado faz o retry de uma
   * carga derrubar a outra e disparar requisições a mais.
   */
  const [attempt, setAttempt] = useState(0);
  const [books, setBooks] = useState<readonly BookResponse[]>(NO_BOOKS);
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);

  const clubId = activeClub === null ? null : activeClub.id;
  const myId = me === null ? null : me.id;

  /*
    O DEBOUNCE (regra 9), e o `clearTimeout` da limpeza é o que faz a espera
    **reiniciar** a cada tecla em vez de virar throttle: cada mudança do `term`
    desmonta o timer anterior e monta outro.

    ⚠️ **O termo curto sai SEM timer**, e é o que faz "nenhuma requisição para um
    caractere" ser verdade mesmo depois de o prazo passar: `setQuery('')` é
    imediato, e `query === ''` é o que o efeito de baixo trata como "não peça
    nada". Um `setTimeout` que checasse o tamanho lá dentro deixaria a tela em
    "procurando…" por 400 ms para nada.
  */
  useEffect(() => {
    const trimmed = term.trim();
    if (trimmed.length < MIN_TERM_LENGTH) {
      setQuery('');
      return;
    }

    const timer = setTimeout(() => {
      setQuery(trimmed);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [term]);

  /*
    AS DUAS LISTAGENS, sempre juntas (regra 14). O `attempt` está nas
    dependências: é o "tentar de novo" refazendo AS DUAS.
  */
  useEffect(() => {
    if (clubId === null) return;
    if (query === '') {
      setResults(RESULTS_IDLE);
      return;
    }

    let cancelled = false;
    setResults({ status: 'loading' });

    void Promise.all([
      api.get(
        `/clubs/${encodeURIComponent(clubId)}/notes`,
        notesResponseSchema,
        {
          // O `text` sai pela opção `query` do cliente, que usa
          // `URLSearchParams` e escapa sozinha — **nunca** por concatenação. É a
          // armadilha que a Tarefa 24 mediu com o `#` da cor (`?color=#facc15`
          // não chega ao servidor), e aqui ela morderia em `&`, `#` e `+`, que
          // são caracteres normais no que alguém escreveu num livro.
          query: { text: query },
        },
      ),
      api.get(
        `/clubs/${encodeURIComponent(clubId)}/highlights`,
        highlightsResponseSchema,
        { query: { text: query } },
      ),
    ])
      .then(([notes, highlights]) => {
        if (cancelled) return;
        setResults({ status: 'ready', notes, highlights });
      })
      .catch(() => {
        if (cancelled) return;
        // `Promise.all` rejeita na PRIMEIRA falha, e é o que queremos: meia
        // busca é uma lista incompleta em silêncio.
        setResults({ status: 'failed' });
      });

    return () => {
      // A resposta velha chega e é DESCARTADA: sem isso, quem digita uma letra
      // a mais vê o resultado do termo curto sobrescrever o do termo longo.
      cancelled = true;
    };
  }, [api, clubId, query, attempt]);

  /*
    A ESTANTE — é ela que dá o TÍTULO de cada livro (decisão E: sem isso um
    resultado de clube é ambíguo, "página 112" em qual livro?).

    Efeito PRÓPRIO e carga ÚNICA por clube: os títulos não mudam entre buscas, e
    repedi-los por termo digitado seria uma requisição por tecla depois do
    debounce. Uma falha aqui **não** apaga a busca — o rótulo do livro degrada
    para a frase neutra do catálogo, do mesmo jeito que o nome de quem escreveu
    degrada quando `/members` falha.
  */
  useEffect(() => {
    if (clubId === null) return;

    let cancelled = false;
    setBooks(NO_BOOKS);

    void api
      .get(`/clubs/${encodeURIComponent(clubId)}/books`, booksResponseSchema)
      .then((shelf) => {
        if (cancelled) return;
        setBooks(shelf);
      })
      .catch(() => {
        /*
          Nada a escrever: o estado já é vazio desde o começo do efeito, e não há
          frase de erro para mostrar — ninguém lê um texto de servidor por causa
          do rótulo de um livro. O `catch` existe para a rejeição ter dono.
        */
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubId, attempt]);

  /*
    QUEM É O CLUBE (a rota da Tarefa 26a) — o nome de quem escreveu. Efeito
    próprio, e a falha degrada em silêncio para o glifo neutro.
  */
  useEffect(() => {
    if (clubId === null) return;

    let cancelled = false;
    setMembers(MEMBERS_UNKNOWN);

    void api
      .get(
        `/clubs/${encodeURIComponent(clubId)}/members`,
        clubMembersResponseSchema,
      )
      .then((list) => {
        if (cancelled) return;
        setMembers({ status: 'ready', members: list });
      })
      .catch(() => {
        // Idem: o estado já é `unknown`, e o nome cai no glifo neutro.
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubId, attempt]);

  /**
   * `userId` → nome. O dono da regra é o `club-names.ts` (o `acervo.tsx` e o
   * `book.tsx` o dividem) — aqui só se guarda o `Map` por resposta, para a
   * resolução de cada linha ser O(1).
   */
  const memberNames = useMemo(() => memberNamesOf(members), [members]);

  /** `bookId` → título. Montado uma vez por resposta da estante. */
  const bookTitles = useMemo(
    () => new Map(books.map((book) => [book.id, book.title])),
    [books],
  );

  /**
   * O título do livro de um resultado — a frase neutra quando a estante não
   * chegou.
   *
   * ⚠️ **NUNCA O `bookId` COMO RÓTULO**: um UUID na linha tem cara de
   * informação e não é de ninguém — é a mesma medição do `nameOfWriter`
   * ("comunicar errado é pior que não comunicar"). E nunca **nada**: o campo é o
   * que distingue esta tela do acervo do livro, e uma linha em que ele
   * desaparece em silêncio faz a pessoa achar que aquele resultado não tem livro.
   */
  function bookLabelOf(bookId: string): string {
    return bookTitles.get(bookId) ?? t('pages.busca.item.unknownBook');
  }

  /**
   * Quem escreveu, em TEXTO — nunca só a cor do avatar.
   *
   * "Você" ganha do nome quando é meu: eu não me leio pelo nome numa lista em que
   * também estão os outros. O vocabulário é o do acervo (`pages.acervo.item.*`)
   * de propósito — ver o comentário do `typeLabelOf`.
   */
  function authorLabelOf(userId: string): string {
    if (userId === myId) return t('pages.acervo.item.author.you');
    return (
      nameOfWriter(userId, me, memberNames) ??
      t('pages.acervo.item.author.other')
    );
  }

  /**
   * O TIPO em texto, em toda linha (ADR 0004: o grifo **não** é um tipo de
   * anotação, e numa lista unificada o leitor não pode ter de adivinhar).
   *
   * ⚠️ **AS CHAVES SÃO AS DO ACERVO (`pages.acervo.kind.*`), e é decisão —
   * lição nº 3 do MVP 1.** "Do dia", "Avulsa" e "Grifo" são o vocabulário do
   * MODELO de entrada (o que o `acervo-entries.ts` chama de `type`), não da
   * tela; um `pages.busca.kind.*` seria uma segunda verdade sobre as mesmas três
   * palavras, e o `pt.ts` já registra esse exato cuidado no bloco do acervo. O
   * mesmo vale para `item.author.*`, `item.page` e `item.edit`.
   */
  function typeLabelOf(type: AcervoEntry['type']): string {
    if (type === 'HIGHLIGHT') return t('pages.acervo.kind.highlight');
    return t(
      type === 'PLAN' ? 'pages.acervo.kind.plan' : 'pages.acervo.kind.free',
    );
  }

  /**
   * A LINHA DE ANOTAÇÃO — o `ListItem` do design system, como no acervo.
   *
   * O subtítulo carrega **o livro**, **quem escreveu** e a prévia, nesta ordem:
   * o livro primeiro porque é ele que desambigua um resultado de clube
   * (decisão E).
   */
  function noteRow(entry: NoteEntry): ReactNode {
    const { note } = entry;
    const writerName = nameOfWriter(note.userId, me, memberNames);
    const excerpt = excerptOf(note.plainText, NOTE_EXCERPT_LENGTH);
    const context = `${bookLabelOf(note.bookId)} · ${authorLabelOf(note.userId)}`;

    return (
      <ListItem
        // O TIPO é legível, não deduzido do endereço.
        end={typeLabelOf(entry.type)}
        href={noteTarget(note)}
        key={keyOf(entry)}
        // ⚠️ `Link` do roteador, NUNCA âncora crua: `<a href>` é navegação de
        // DOCUMENTO e recarrega o PWA inteiro — a lição medida da Tarefa 16.
        renderLink={listItemRouterLink}
        start={<PersonAvatar id={note.userId} name={writerName} size="sm" />}
        subtitle={excerpt === '' ? context : `${context} · ${excerpt}`}
        title={note.title}
      />
    );
  }

  /**
   * A LINHA DE GRIFO — card próprio, e **não** um `ListItem`.
   *
   * O `ListItemProps` declara que o item inteiro é um `button`/`a` e que o slot
   * `end` é conteúdo **não interativo** ("um botão dentro de outro é HTML
   * inválido"), e a linha de grifo carrega um controle próprio (o link de
   * correção). A diferença visual entre as duas é o ADR 0004 visível: um grifo
   * não se parece com uma anotação porque não é uma anotação.
   */
  function highlightRow(entry: HighlightEntry): ReactNode {
    const { highlight } = entry;
    const mine = highlight.userId === myId;
    const writerName = nameOfWriter(highlight.userId, me, memberNames);
    const comment = excerptOf(highlight.commentText, COMMENT_EXCERPT_LENGTH);

    return (
      <li className="flex" key={keyOf(entry)}>
        <div className="flex w-full flex-col gap-2 rounded-control border border-line bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {/* O LIVRO primeiro — é ele que desambigua o resultado (decisão E). */}
            <span className="font-medium text-content">
              {bookLabelOf(highlight.bookId)}
            </span>
            <span className="font-medium">{typeLabelOf(entry.type)}</span>
            {/*
              A COR TEM NOME, e o nome é texto de verdade. A amostra é
              `aria-hidden` (o nome está ao lado); cor como único portador de
              informação é o defeito que ninguém vê olhando.
            */}
            <ColorSwatch color={highlight.color} />
            <span>{t(COLOR_LABEL_KEYS[highlight.color])}</span>
            {/*
              SEM PÁGINA É SILÊNCIO. Nem "página null", nem o rótulo órfão: a
              ausência não se anuncia (é o anti-culpa aplicado ao espaço vazio).
            */}
            {highlight.page !== null ? (
              <span>
                {t('pages.acervo.item.page', { number: highlight.page })}
              </span>
            ) : null}
            <PersonAvatar id={highlight.userId} name={writerName} size="sm" />
            <span>{authorLabelOf(highlight.userId)}</span>
          </div>

          <p className="text-content">
            {excerptOf(highlight.quote, QUOTE_EXCERPT_LENGTH)}
          </p>

          {/*
            SEM COMENTÁRIO, NENHUMA ÁREA DE COMENTÁRIO.

            ⚠️ A guarda é a PRÉVIA VAZIA, e não `commentDoc === null`: o
            `commentText` é DERIVADO do `commentDoc` no backend (ADR 0001), então
            `null` no documento implica `''` no texto — e o documento que EXISTE e
            não diz nada (o parágrafo em branco que o editor emite) também cai
            aqui.
          */}
          {comment === '' ? null : (
            <p className="text-sm text-muted">{comment}</p>
          )}

          {/*
            ⚠️ **SÓ O MEU GRIFO TEM AFFORDANCE, e o alheio aparece INTEIRO
            (regra 13).**

            Isso é AUTORIA, não privacidade — o trecho está aqui porque dentro do
            clube não existe conteúdo privado (ADR 0002), e nada nesta tela é
            rotulado como permissão.

            ⚠️ **E ele não tem nem LINK, ao contrário da anotação alheia** — a
            assimetria é MEDIDA, não gosto: a anotação de outra pessoa abre em
            LEITURA (o `free-note.tsx` decide leitura × correção pela autoria), e
            para grifo **não existe tela de leitura** — o `highlight-form.tsx`
            recusa o grifo alheio com `pages.highlightForm.notYours`. Um link
            levaria a um beco.
          */}
          {mine ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className={TEXT_LINK_CLASS}
                to={highlightPath(highlight.bookId, highlight.id)}
              >
                {t('pages.acervo.item.edit')}
              </Link>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  function rowOf(entry: AcervoEntry): ReactNode {
    return entry.type === 'HIGHLIGHT' ? highlightRow(entry) : noteRow(entry);
  }

  function resultsBody(): ReactNode {
    if (results.status === 'idle') {
      /*
        ⚠️ **O ESTADO INICIAL, e ele é PRÓPRIO (regras 8 e 11).** Ele fala do
        que fazer — "escreva uma palavra" —, nunca do que a pessoa deixou de
        registrar, e é DIFERENTE do "não achei": os dois estados nunca são o
        mesmo (a lição das Tarefas 19, 25 e 28).
      */
      return (
        <Notice
          description={t('pages.busca.start.description')}
          title={t('pages.busca.start.title')}
        />
      );
    }

    if (results.status === 'loading') {
      return <p className="text-sm text-muted">{t('pages.busca.loading')}</p>;
    }

    if (results.status === 'failed') {
      return (
        <Notice
          action={
            <Button
              onClick={() => {
                // Refaz AS DUAS listagens (regra 14): o `attempt` está nas
                // dependências do efeito que as pede juntas.
                setAttempt((previous) => previous + 1);
              }}
              variant="ghost"
            >
              {t('pages.busca.retry')}
            </Button>
          }
          title={t('pages.busca.unavailable')}
        />
      );
    }

    /*
      ⚠️ **A ORDEM É O `mergeEntries` DO `acervo-entries.ts`** (decisão H e
      regra 12): `createdAt` decrescente, com os dois tipos **intercalados**.

      "Concatenar as duas listagens" é a implementação errada mais provável —
      cada uma já chega ordenada do backend, então concatenar *parece* funcionar
      e põe todas as anotações antes de todos os grifos. Reusar o módulo é o que
      faz esta tela não repetir o erro; ranking por relevância é fora de escopo,
      e o custo de trocar a ordem está medido na Tarefa 28 (12 testes posicionais).
    */
    const entries = mergeEntries(results.notes, results.highlights);

    if (entries.length === 0) {
      /*
        ⚠️ **"NÃO ACHEI" FALA DA PALAVRA, NÃO DE QUEM ESCREVEU** (regra 11 +
        anti-culpa): a frase sugere trocar o termo, e nunca insinua que o clube
        escreveu pouco. E ela é distinta da inicial.
      */
      return (
        <Notice
          description={t('pages.busca.empty.description')}
          title={t('pages.busca.empty.title')}
        />
      );
    }

    return (
      <List aria-label={t('pages.busca.label')} className="gap-2">
        {entries.map((entry) => rowOf(entry))}
      </List>
    );
  }

  function body(): ReactNode {
    if (meStatus === 'failed') {
      return (
        <Notice
          action={
            <Button onClick={reload} variant="ghost">
              {t('pages.busca.retry')}
            </Button>
          }
          title={messageFor(t, resolveApiError(meError, { fields: [] }).key)}
        />
      );
    }

    /*
      ⚠️ `!== 'ready'` E NÃO `=== 'loading'`, e o motivo é o FLASH medido na
      home: o `/me` só é disparado num efeito, então o primeiro frame de quem tem
      sessão não é `loading` — e com um `=== 'loading'` aqui aquele frame cairia
      no estado "sem clube" logo abaixo.
    */
    if (meStatus !== 'ready') {
      /*
        ⚠️ **`clubLoading` E NÃO `loading` — conserto medido da auditoria.**

        Aqui **nada foi pedido**: o `/me` ainda está no ar e não há nem campo na
        tela. Dizer "Procurando…" seria mentir sobre o que o app está fazendo. E
        o custo real era outro: com a MESMA frase nos dois estados, o teste do
        `/me` pendente afirmava a frase e a varredura de DOM não conseguia
        distinguir os dois — uma cobrança plantada no `loading` da BUSCA passava
        verde porque o estado que a suíte varria era este (§7.9).
      */
      return (
        <p className="text-sm text-muted">{t('pages.busca.clubLoading')}</p>
      );
    }

    // O primeiro login do projeto tem `clubs: []` (o seed cria o super-admin sem
    // membership nenhum). Sem clube não há acervo para buscar, e a frase diz o
    // que fazer sem prometer botão que não existe.
    if (activeClub === null) {
      return (
        <Notice
          description={t('pages.busca.noClubs.description')}
          title={t('pages.busca.noClubs.title')}
        />
      );
    }

    return (
      <>
        {/*
          O CAMPO. `type="search"` e não `type="text"`: o papel é `searchbox`, o
          teclado do celular mostra a tecla de busca, e o navegador oferece o
          botão de limpar de graça.

          ⚠️ **NÃO É UM `<form>`, e é decisão:** não há "enviar" — o debounce é o
          gatilho. Um `<form>` daria um submit por Enter que dispararia uma
          terceira requisição idêntica à que o debounce já fez, e no celular
          ainda fecharia o teclado.
        */}
        <Field label={t('pages.busca.field.label')}>
          {(control) => (
            <input
              {...control}
              autoComplete="off"
              className={TEXT_INPUT_CLASS}
              onChange={(event) => {
                setTerm(event.target.value);
              }}
              placeholder={t('pages.busca.field.placeholder')}
              type="search"
              value={term}
            />
          )}
        </Field>

        {resultsBody()}
      </>
    );
  }

  return <Screen title={t('pages.busca.title')}>{body()}</Screen>;
}
