import {
  type BookWithPlanResponse,
  bookWithPlanResponseSchema,
  clubMembersResponseSchema,
  isCalendarDay,
  localDay,
  localTimeZone,
  type PlanItemResponse,
} from '@clube/shared';
import { ApiError } from '@clube/shared/client';
import {
  BookSpine,
  Button,
  cx,
  Eyebrow,
  FOCUS_RING,
  List,
  ListItem,
  MarginRail,
  PresenceMark,
} from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import { Notice, Screen, TEXT_LINK_CLASS } from './chrome';
import { formatClubMonth } from './club-month';
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
import { MarginHighlight } from './margin-highlight';
import { acervoPath, bookEditPath, isClubAdmin } from './paths';
import { ReadMarks, TodayReading } from './reading-marks';

/**
 * A TELA DO LIVRO — o mês inteiro, dia por dia.
 *
 * Ela é **panorama e navegação**, não escrita: quem vai escrever chega pelo
 * atalho da home ou tocando num dia daqui.
 *
 * ⚠️ **E ELA VOLTOU A SER SÓ O PLANO NA TAREFA 28** (decisão B). Da Tarefa 19 à
 * 27 ela carregava também o ACERVO de anotações — uma segunda lista, um filtro
 * por pessoa e uma terceira requisição —, e tinha DUAS abas inconsistentes
 * entre si: "Anotações" listava ali mesmo e "Grifos" navegava. Agora anotações
 * e grifos moram num lugar só (`acervo.tsx`, `/books/:bookId/acervo`) e o que
 * fica aqui é o plano mais **um** link.
 *
 * ⚠️ **O TAMANHO, MEDIDO E REGISTRADO** (contador canônico no docblock de
 * `acervo.tsx`): **400** linhas antes da Tarefa 27, **486** depois (o filtro por
 * pessoa trouxe uma terceira requisição, um estado e o construtor dos chips), e
 * **247** depois da Tarefa 28 — a ordem de grandeza de uma tela de plano. A
 * lição nº 8 do MVP 1 é dividir **antes** de a tela crescer, e a 28 foi o
 * "antes" marcado pela 25 e pela 27.
 *
 * ⚠️ **A TAREFA 32b DIVIDIU DE NOVO, E ANTES DE CRESCER.** A marca de leitura,
 * o toque "li hoje" e o recado de falha foram para `reading-marks.tsx`, e o que
 * ficou aqui foi a FIAÇÃO: qual é o dia de hoje, quem leu cada dia, e a
 * releitura depois de marcar. O teto que a spec daquela fatia escreveu era
 * ~~"~350"~~ — **aproximado, e a palavra é do próprio texto**.
 *
 * ⚠️⚠️ **O TETO É 420 LINHAS CANÔNICAS DESDE 2026-09-23 — decisão do dono, com
 * a data ao lado.**
 *
 * ⚠️ **O ~350 da Tarefa 32b fica RISCADO, não apagado, e isso é regra.** Ele é
 * histórico: `docs/tasks/32b-marca-de-leitura-na-tela.md:126` continua sendo o
 * endereço da cláusula, e a **lição nº 8 do MVP 1** ("dividir antes de a tela
 * crescer") foi citada por outras fatias com aquele número na mão. Apagar o
 * número faria a próxima pessoa achar que a cláusula nunca existiu — a mesma
 * razão pela qual a seção "o que NÃO fazer agora" do `CLAUDE.md` risca em vez
 * de apagar. Leia o ~350 como **data**, não como proibição em vigor.
 *
 * **Por que o teto subiu:** a tela ganhou quatro coisas que não existiam em
 * 32b, e as quatro são do canvas, não da conveniência de quem escreveu —
 * a **lombada** (`BookSpine`, Tarefa 44), o **sumário** (a lista virou
 * `ListItemLook="sumario"`, Tarefa 44), a **margem de desktop**
 * (`MarginRail` com "As marcas", Tarefa 44) e agora o **inventário**
 * ("Neste livro" e "Último grifo", Tarefa 44b). Uma tela de plano de 2026-09
 * não é a mesma coisa que a de 2026-08.
 *
 * ⚠️⚠️ **E A IRONIA MEDIDA, POR ESCRITO, porque ela é o registro que serve à
 * próxima fatia.** A Tarefa 44b **extraiu 45 linhas** para
 * `margin-highlight.tsx` e se anotou como fatia que dividiu — mas o corte saiu
 * do **`day-note.tsx`** (506 → 478, **−28**). A tela que estourou o teto
 * **não perdeu uma linha**: ela foi de 360 a 408, e a rodada de correção a
 * levou a 414. Extrair de A não é encolher B. **Isto é registro, não
 * acusação** — a extração estava certa pelo §7.1 e o número dela é real; o que
 * faltou foi notar que o alívio foi para o arquivo errado. A próxima fatia que
 * tocar esta margem corta **aqui**, e o corte continua sendo por ASSUNTO (o
 * cabeçalho × a margem, que já tem três seções).
 *
 * ⚠️⚠️ **O TAMANHO DE HOJE, COM A DATA AO LADO — e a linha anterior daqui
 * estava OBSOLETA.** Ela dizia "a tela saiu de 247 para 277" como se fosse
 * permanente, e era um número medido num instante: exatamente a classe de erro
 * que a nota nº 9 da Tarefa 44 diz querer evitar, cometida três linhas depois.
 * Todos os números abaixo saem do **contador canônico**, que é o comando do
 * docblock de `acervo.tsx:115-126` — o único do projeto, criado porque a
 * auditoria da Tarefa 25 achou três contagens diferentes para este mesmo
 * arquivo no mesmo commit.
 *
 * | medição | `book.tsx` | `reading-marks.tsx` |
 * | --- | --- | --- |
 * | antes da Tarefa 44 (commit `11c9171`) | 277 | 105 |
 * | fim da Tarefa 44 (2026-09-22) | **356** | **107** |
 * | fim da rodada de correção da 44 (2026-09-22) | **360** | **107** |
 * | fim da Tarefa 44b (2026-09-23) | **408** | **107** |
 * | fim da rodada de correção da 44b (2026-09-23) | **414** | **107** |
 *
 * A Tarefa 44 acrescentou **+99 / −20 = +79** linhas canônicas (`diff -w` sobre
 * o texto já passado pelo contador); a rodada de correção dela, **+4** (o
 * import do `formatClubMonth` e três linhas do `Eyebrow` do cabeçalho); a 44b,
 * **+48**; e a rodada de correção da 44b, **+6** — os dois filetes de 1px do
 * canvas (`LivroDesktop.dc.html:194` e `:209`) e o fragmento que embrulha o
 * segundo com o bloco do grifo. **Sobram 6 linhas de folga contra o teto de
 * 420.**
 *
 * ⚠️ **E o `wc -l` NÃO é a unidade aqui:** ele dá mais de 900 e a maior parte
 * disso é docblock. A nota nº 9 da Tarefa 44 comparou `wc -l` (886, na época)
 * com um teto do contador canônico e concluiu que a tela havia estourado 2,5×.
 * As duas medidas existem; misturá-las é que não.
 *
 * ⚠️ **E O "LI HOJE" É SÓ DO DIA DE HOJE — escopo, não simplificação.** A rota
 * aceita qualquer `planItemId`; 30 toggles na lista virariam auditoria
 * retroativa, que é onde a cobrança nasce. Se o dono quiser marcar dia
 * passado, a pergunta está registrada em
 * `docs/tasks/32b-marca-de-leitura-na-tela.md`.
 *
 * ⚠️ **O QUE **NÃO** SAIU, e é regra testada: a SOBREPOSIÇÃO DE AUTORIA
 * continua dizendo o NOME.** O `GET /clubs/:clubId/members` ficou aqui —
 * ele não era do acervo, era do NOME de quem escreveu —, e é ele que faz o
 * avatar de cada dia do plano mostrar a inicial de verdade e o `aria-label`
 * interpolado que a Tarefa 27 acabou de consertar. Tirar a requisição junto com
 * o acervo teria desfeito aquela correção em silêncio.
 *
 * ⚠️ **E A RESOLUÇÃO DO NOME MORA EM `club-names.ts`, dividida com o
 * `acervo.tsx` — conserto medido da rodada.** A primeira versão desta fatia
 * **copiou** `MembersState`, `MEMBERS_UNKNOWN` e `nameOfWriter` para a tela
 * nova, byte a byte: duas verdades sobre o mesmo nome, que é exatamente a
 * inconsistência que a Tarefa 27 existiu para fechar ("Maria" no acervo e
 * "alguém do clube" no plano). Consertar uma cópia e esquecer a outra a
 * reabriria. Medido antes e depois: **3 acusadores** nos dois lados (2 no
 * acervo, 1 aqui), e agora UMA mutação do dono único atinge os dois.
 *
 * ⚠️ **O PRINCÍPIO ANTI-CULPA É REGRA TESTADA AQUI**
 * (`docs/plano-clube-do-livro.md` §1). Esta é a tela onde a cobrança nasceria
 * naturalmente: trinta dias em lista, e a maioria deles sem anotação. Então:
 *
 * - **nada de vermelho.** Nenhum `text-danger`, nenhum fundo de `--danger`,
 *   nenhuma cor de
 *   valor arbitrário (`[#…`), nenhum `style` com `--danger`;
 * - **nada de contador.** Nem "3 de 30 dias", nem "+2" ao lado dos avatares,
 *   nem número nenhum derivado de dado. As duas sobreposições dizem **quem**
 *   escreveu e **quem** leu, e **nunca quantos** — isso seria placar, e o §1
 *   proíbe comparação. É a decisão do dono em `docs/ACEITE-MVP.md` (MVP 3,
 *   pergunta 1): progresso é **presença**, e a rota não devolve contagem
 *   nenhuma, então o número é irrenderizável por CONTRATO, não por estilo
 *   (→ `docs/adr/0002-visibilidade-total-no-clube.md`). ⚠️ **A pergunta 1 foi
 *   revertida pelo dono na Tarefa 38c** (→ `docs/adr/0010-…`), mas **a tela do
 *   livro não mudou**: o foguinho vive na home, e esta tela continua sem
 *   contador porque a resposta dela continua sem contagem;
 * - **só hoje é destacado.** Destacar "atrasados" é cobrança desenhada;
 *   destacar o futuro não serve para nada.
 *
 * O acusador da palavra é o catálogo (`shared/src/locales/__tests__/
 * anti-guilt.test.ts`); o acusador da **cor** e do **número**
 * é a varredura de DOM de `__tests__/book.test.tsx`, que roda em **todos** os
 * estados desta tela.
 *
 * ⚠️ **E NÃO HÁ EDITOR AQUI.** Nenhum `@clube/ui/editor`: o bundle do PWA
 * continua sem TipTap, e o acusador é o `bundle-guard.test.ts`, que compila de
 * verdade.
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

/**
 * A META DA DIREITA — o dia e o trecho, em monoespaçada, depois do condutor
 * (`Livro.dc.html:78`: `8 SET · 9`; `:146`: `Hoje · 161`).
 *
 * ⚠️ **ELA SE CHAMAVA `subtitleFor` ATÉ A TAREFA 44, e o nome deixou de ser
 * verdade junto com o slot.** A nota do `ListItemLook`
 * (`packages/ui/src/components/list.tsx`) previu a migração por escrito: o
 * braço `sumario` declara `subtitle?: never`, e o compilador a cobrou —
 * `TS2322: Type '"sumario"' is not assignable to type '"row"'`, porque o
 * `subtitle: string` já tinha estreitado a união para o outro braço. Manter o
 * nome antigo apontando para o slot `end` seria a classe de defeito que o
 * `dayRange` do `CLAUDE.md` registra: um nome que manda o próximo leitor
 * procurar a coisa errada.
 *
 * ⚠️ **E O DIA DE HOJE TROCA A DATA PELA PALAVRA, não a acrescenta.** É o que
 * o canvas desenha, e é o que impede a linha de hoje de dizer duas vezes a
 * mesma coisa. `todayLabel` é `null` em todo dia que não é hoje.
 */
function endFor(
  item: PlanItemResponse,
  locale: string,
  todayLabel: string | null,
): string {
  const head = todayLabel ?? formatPlanDay(item.date, locale);
  return item.reference === null ? head : `${head} · ${item.reference}`;
}

/** O endereço do livro — UM, para a carga e para a releitura (decisão F). */
function bookUrl(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}`;
}

/**
 * Uma sobreposição → `planItemId` → pessoas.
 *
 * ⚠️ **UMA FUNÇÃO PARA AS DUAS, e não duas byte-idênticas** (§7.1, "extrair,
 * não cobrir duas vezes"). `writers` e `readers` têm o MESMO formato e não o
 * mesmo assunto (decisão D da Tarefa 31): o que se divide é a CONTA, não o
 * nome. Duas cópias divergiriam na primeira correção — foi o que aconteceu com
 * o `GUILT_TERMS` e com o `matches` dos fakes.
 *
 * As duas trazem **só os dias que têm registro** (o front sobrepõe no plano que
 * já tem), então a ausência da chave é o caso comum, não uma falha.
 *
 * ⚠️ **E ELAS TRAZEM SÓ `userId` — NENHUM NOME.** Daí a resolução pelo
 * `nameOfWriter`, contra o `GET /clubs/:clubId/members` (Tarefa 26a): com o
 * `userId` cru, o `PersonAvatar` extrai a primeira letra do UUID e desenha um
 * "F" ou um "C" — **uma inicial que tem cara de inicial e não é de ninguém**.
 * Medido na Tarefa 17. Comunicar errado é pior que não comunicar, e `null` cai
 * no glifo neutro que a Tarefa 13 pôs ali exatamente para "sem nome", escolhido
 * para não parecer cobrança. A **cor** continua vindo do `id`, então duas
 * pessoas seguem distinguíveis entre si.
 *
 * ⚠️ E o `me` é `null` fora do `ready` do `/me` — nesse frame TODO avatar cai
 * no glifo neutro, que é a resposta honesta para "ainda não sei quem é você".
 */
function byPlanItem(
  overlay: BookWithPlanResponse['writers'] | BookWithPlanResponse['readers'],
): Map<string, readonly string[]> {
  return new Map(overlay.map((entry) => [entry.planItemId, entry.userIds]));
}

/** O `Map` vazio das duas sobreposições fora do `ready` — uma referência só. */
const NO_OVERLAY: Map<string, readonly string[]> = new Map();

export function BookPage() {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const { clubs, me } = useActiveClub();
  const navigate = useNavigate();
  const { bookId } = useParams();

  const [state, setState] = useState<BookState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);

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
      .get(bookUrl(bookId), bookWithPlanResponseSchema)
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
    QUEM É O CLUBE (Tarefa 26a). Depende do CLUBE DO LIVRO — `book.clubId`, e
    não o clube ativo do cabeçalho: o dono do livro é quem manda, e o backend
    faz o corte de tenant contra o `Membership` (sem membership, 404).

    Efeito PRÓPRIO: uma falha aqui não apaga o plano, e trocar de livro refaz as
    duas cargas.

    ⚠️ **E O "TENTAR DE NOVO" DO LIVRO REFAZ ESTA CARGA SEM PRECISAR ESTAR NAS
    DEPENDÊNCIAS.** A Tarefa 27 amarrava este efeito ao `notesAttempt` do
    acervo, que saiu desta tela na 28. Não entrou um `attempt` no lugar porque o
    `clubOfBook` já faz o trabalho: o "tentar de novo" põe o `state` de volta em
    `loading`, o `clubOfBook` vira `null` (o efeito sai pela guarda), e quando o
    livro chega ele volta a ser o id — o efeito roda outra vez. Um segundo
    gatilho seria um segundo dono da mesma regra.
  */
  const clubOfBook = state.status === 'ready' ? state.data.book.clubId : null;

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
          por causa de uma inicial de avatar. O `catch` existe para a rejeição
          ter dono; se um dia a falha ganhar ação própria, ela volta a ser uma
          variante do union.
        */
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubOfBook]);

  const writers = useMemo(
    () =>
      state.status === 'ready' ? byPlanItem(state.data.writers) : NO_OVERLAY,
    [state],
  );

  const readers = useMemo(
    () =>
      state.status === 'ready' ? byPlanItem(state.data.readers) : NO_OVERLAY,
    [state],
  );

  /**
   * ⚠️ **A RELEITURA DEPOIS DE MARCAR — decisão F, e ela NÃO passa pelo
   * `attempt`.**
   *
   * O caminho óbvio seria somar 1 ao `attempt` e deixar o efeito refazer tudo.
   * Ele custa duas coisas medidas: o efeito começa com `setState(LOADING)`, o
   * que APAGA a lista por um frame (a pessoa toca "li hoje" e o plano pisca),
   * e o `clubOfBook` vira `null` no caminho, o que dispara um segundo
   * `GET /clubs/:clubId/members` que ninguém pediu. Uma releitura é UMA
   * requisição.
   *
   * Ela **propaga** a rejeição de propósito: quem mostra o recado é o
   * `TodayReading`, que é quem tem o "tentar de novo" (decisão G). Engolir o
   * erro aqui deixaria a marca velha na tela sem uma palavra.
   */
  async function refreshBook(): Promise<void> {
    if (bookId === undefined) return;
    const data = await api.get(bookUrl(bookId), bookWithPlanResponseSchema);
    setState({ status: 'ready', data });
  }

  /**
   * `userId` → nome. O dono da regra é o `club-names.ts` (o `acervo.tsx` a
   * divide) — aqui só se guarda o `Map` por resposta, para a resolução de cada
   * dia do plano ser O(1).
   */
  const memberNames = useMemo(() => memberNamesOf(members), [members]);

  const locale = i18n.resolvedLanguage ?? 'pt';

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

    /*
      ⚠️ **O DIA DE HOJE NO PLANO, e ele pode NÃO EXISTIR** (decisão E). Um
      livro do mês passado não tem "hoje": o toque simplesmente não aparece.
      Um botão desabilitado ali seria cobrança silenciosa ("você não pode
      mais"), que é o anti-culpa aplicado ao espaço vazio — o mesmo que o dia
      sem autoria já faz.
    */
    const todayItem = planItems.find((item) => item.date === today);
    /** A palavra que substitui a data na linha de hoje (`Livro.dc.html:146`). */
    const todayLabel = t('pages.book.plan.today');

    return (
      <>
        {/*
          ⚠️ **O CABEÇALHO DO LIVRO — LOMBADA, AUTOR E A LINHA DE MONO**
          (decisão C da Tarefa 44). `Livro.dc.html:43-52` e
          `LivroDesktop.dc.html:46-62`.

          ⚠️ **DUAS LOMBADAS NO DOM, e é declarado.** O `BookSpine` recebe o
          tamanho por PROP (`md` = 58×84, `lg` = 88×128), e o corte de 1120px é
          media query — então as duas ficam montadas e o CSS esconde uma. A
          alternativa seria uma prop responsiva no componente, que serviria a
          um chamador só (o "peso" que a decisão B da 41a proíbe).

          As duas são `aria-hidden` por construção (`label` ausente): o título
          está escrito ao lado, no `h1` do `Screen`, e anunciá-lo três vezes é
          o defeito que o docblock do `BookSpine` nomeia.

          ⚠️ **E O `h1` FICA ONDE ESTAVA.** O canvas põe a lombada À ESQUERDA do
          título; o `h1` é do `Screen` (Tarefa 42), e trazê-lo para cá seria
          mexer no cromo de dez telas por causa de uma. Divergência declarada:
          a lombada abre o corpo, com o autor e a posição ao lado dela.
        */}
        <div className="flex items-center gap-4 min-[1120px]:gap-[26px]">
          <BookSpine
            className="min-[1120px]:hidden"
            size="md"
            title={book.title}
          />
          <BookSpine
            className="hidden min-[1120px]:flex"
            size="lg"
            title={book.title}
          />
          <div className="flex min-w-0 flex-col gap-1.5 min-[1120px]:gap-2">
            {/*
              ⚠️ O autor em Instrument Serif itálico (`Livro.dc.html:49`:
              17px; `LivroDesktop.dc.html:52`: 21px). Os dois corpos estão fora
              da escala de sete degraus da Tarefa 39; sai `text-reading`
              (17,5px) nas duas larguras, e os 21px do desktop ficam como
              divergência declarada — meio pixel de um lado, três degraus e
              meio do outro, e nenhum degrau novo entra sem decisão do dono.
            */}
            {book.author !== null ? (
              <p className="truncate font-quote text-reading italic text-muted">
                {book.author}
              </p>
            ) : null}
            {/*
              ⚠️⚠️ **A LINHA DE MONO DO CABEÇALHO: O MÊS, E DEPOIS A POSIÇÃO NO
              PLANO** — decisão do dono de 2026-09-22, na rodada de correção
              desta fatia.

              `Livro.dc.html:50` desenha aqui "Setembro de 2026 · 288 p." e
              `LivroDesktop.dc.html:53` "Setembro de 2026 · 288 páginas · 30
              dias". A execução desta fatia escreveu que reproduzir isso
              pediria chaves NOVAS — "o mês por extenso e o 'p.'" — e a
              metade do mês é **falsa**: o mês sai do `formatClubMonth`
              (`./club-month`, extraído do `home.tsx`, que já o formatava com
              `Intl` desde a Tarefa 16), e `book.month` já vem no
              `bookResponseSchema` que esta tela carrega. **Zero chave nova.**

              O "288 p." continua fora: esse **seria** chave nova de verdade —
              o `pt.ts` só tem `totalPages = 'Total de páginas'`, que é rótulo
              de campo de formulário, não legenda de cabeçalho.

              ⚠️ **"Dia 11 de 30" É A ÚNICA FRASE DO APP ISENTA DA VARREDURA
              DE PLACAR.** Ela diz ONDE a leitura de hoje está no mês; o número
              não muda com o que ninguém fez, e é por isso que não é placar
              (decisão do dono, `docs/BACKLOG.md`). A isenção é NOMINAL, por
              chave, em `COUNTER_EXEMPT_KEYS` — e a varredura de DOM desta tela
              chama `expectNoGuiltWithPlanPosition()`, que exige que a
              subtração aconteça de verdade.

              ⚠️ **A POSIÇÃO SÓ ENTRA QUANDO HÁ UM DIA DE HOJE; o MÊS entra
              sempre.** Um livro do mês passado não tem posição, e inventar uma
              ("Dia 0 de 30") seria o vazio anunciado que o §1 do plano proíbe.
              O mês, esse, é do livro — não depende de hoje.

              ⚠️ **A TIPOGRAFIA É O `Eyebrow`, E ISSO NASCEU DE UM MUTANTE
              SOBREVIVENTE (M15).** Esta linha copiava à mão, byte a byte, a
              string de classes do componente; trocar a cópia por
              `text-ui text-muted` passava por **926 testes**. Era o terceiro
              sítio de tipografia de rótulo neste arquivo — dois pelo
              componente, um copiado —, e mudar o `tracking` do `Eyebrow` o
              faria divergir em silêncio. O acusador é `book.test.tsx › writes
              the header META LINE as an Eyebrow`.

              ⚠️ **O TOM É `muted`, MEDIDO NO ARTBOARD DESTA TELA.**
              `Inicio.dc.html:41` desenha a posição em `var(--gold)`, mas isso
              é a HOME. Aqui o slot é o da meta do mês: `Livro.dc.html:50` usa
              `color:var(--text-muted)` e `LivroDesktop.dc.html:53` usa
              `#565b52`, que é `--text-muted` no claro (`theme.css:122`).

              ⚠️ **DIVERGÊNCIA DECLARADA:** o canvas usa 9,5px/0,1em no celular
              e 10px/0,1em no desktop; o `Eyebrow` é 10px/0,12em nas duas. A
              cópia à mão que saiu daqui já tinha esses valores — a divergência
              é antiga, não é efeito deste conserto.
            */}
            <Eyebrow className="truncate">
              {todayItem === undefined
                ? formatClubMonth(book.month, locale)
                : `${formatClubMonth(book.month, locale)} · ${t(
                    'pages.book.plan.dayOfPlan',
                    {
                      number: planItems.indexOf(todayItem) + 1,
                      total: planItems.length,
                    },
                  )}`}
            </Eyebrow>
          </div>
        </div>

        {/*
          ⚠️ **"LI HOJE" — e o estado vem de EU ESTAR entre os leitores de
          hoje, não de o dia TER leitor.** A diferença é a fatia inteira: com a
          segunda leitura, o botão de quem ainda não leu nasceria marcado no
          instante em que a outra pessoa do clube marcasse.

          `me` é `null` enquanto o `/me` não chegou, e aí `iRead` é `false` —
          a resposta honesta para "ainda não sei quem é você" é oferecer o
          gesto, não a desfeita dele.
        */}
        {todayItem === undefined ? null : (
          <TodayReading
            marked={
              me !== null && (readers.get(todayItem.id) ?? []).includes(me.id)
            }
            onChanged={refreshBook}
            planItemId={todayItem.id}
          />
        )}

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
          ⚠️ **REGRA 14 DA TAREFA 28: UM LINK PARA O ACERVO, no lugar das duas
          abas.**

          As abas eram inconsistentes entre si — "Anotações" listava nesta tela
          e "Grifos" navegava —, e o `FilterChip` que a primeira usava obrigava a
          escrever à mão as classes da segunda, porque o `FilterChipProps` da
          Tarefa 13 não aceita `renderLink`. Com uma lista só do outro lado, não
          há aba nenhuma: há uma saída, e ela é um LINK de texto.

          ⚠️ **E É O `Link` DO ROTEADOR, NUNCA ÂNCORA CRUA.** `<a href>` é
          navegação de DOCUMENTO: num PWA ela recarrega o shell inteiro e perde
          o estado em memória (a sessão, o clube ativo, o rascunho do editor) —
          a lição medida da Tarefa 16. O `Link` renderiza um `<a href>` de
          verdade (Ctrl+clique e "abrir em nova aba" continuam) **e** intercepta
          o clique normal.

          ⚠️ **A CLASSE VEM DO `./chrome`**, que é onde o app decidiu o visual de
          link de texto — uma vez, num lugar. O `HIGHLIGHTS_TAB_CLASS` local que
          vivia aqui (as classes de chip escritas à mão) morreu com as abas, e
          com ele a lacuna de `renderLink` em `packages/ui` deixou de ter
          chamador nesta tela.
        */}
        {/*
          ⚠️ **ESTE LINK SOME NO DESKTOP DESDE A TAREFA 44b, e é o canvas que
          manda.** `Livro.dc.html:60` põe "Ver o acervo do livro" no CORPO;
          `LivroDesktop.dc.html:206` o põe **só** na margem, dentro de "Neste
          livro". Sem o `min-[1120px]:hidden` a mesma frase apareceria duas
          vezes na mesma tela acima de 1120px — e o par de classes é o MESMO
          desenho das duas lombadas do cabeçalho, alguns dedos acima.
        */}
        <div className="flex min-[1120px]:hidden">
          <Link className={TEXT_LINK_CLASS} to={acervoPath(book.id)}>
            {t('pages.book.acervoLink')}
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
          <section className="flex flex-col gap-1">
            {/*
              ⚠️ **O RÓTULO DE SEÇÃO É O `Eyebrow` (decisão G)**, sobre o filete
              de 2px em `--accent` que `Livro.dc.html:66` desenha. A Tarefa 43
              já pôs o componente em uso na tela do dia; duas tipografias de
              rótulo na mesma tela é a "correção incompleta" que a auditoria da
              41b nomeou como classe e que a da 42 achou nos `h1`.

              ⚠️ **O `<h2>` FICA, e o `Eyebrow` vai DENTRO dele.** O componente
              é um `<span>` por decisão escrita — "a tipografia do rótulo, não a
              semântica dele" —, e isto aqui É uma seção.

              ⚠️ **DIVERGÊNCIA DECLARADA:** o canvas escreve "Plano de leitura"
              e a tela escreve "Dias do plano de leitura", que é o valor de
              `pages.book.plan.label` — a chave que já nomeava a lista para quem
              ouve. Encurtá-la seria chave NOVA, e a regra 9 não permite
              nenhuma.

              A legenda da direita é `pages.book.marks.hint` ("Cheio =
              escreveu"), uma das quatro chaves que a Tarefa 40 deixou sem
              consumidor. Ela é mono 9,5px / 0.08em / `--text-subtle`
              (`Livro.dc.html:68`) — e **não** é um `Eyebrow`: ela não nomeia
              seção nenhuma, ela explica a forma do glifo.
            */}
            <div className="flex items-baseline justify-between gap-3 border-b-2 border-accent pb-[7px]">
              <h2>
                <Eyebrow>{t('pages.book.plan.label')}</Eyebrow>
              </h2>
              <span className="shrink-0 font-mono text-micro uppercase tracking-[0.08em] text-subtle">
                {t('pages.book.marks.hint')}
              </span>
            </div>
            <List aria-label={t('pages.book.plan.label')} className="gap-1">
              {/*
              REGRA 2: a ordem é a que a API devolveu (o `getBookWithPlan`
              ordena por `order`). A tela NÃO reordena — duas ordens seriam duas
              verdades, e a que a pessoa vê mudaria com a tela.
            */}
              {planItems.map((item) => {
                const authors = writers.get(item.id) ?? [];
                const whoRead = readers.get(item.id) ?? [];
                // REGRAS 3 e 4: comparação de STRING contra o `localDay`, nunca
                // `new Date()`. E é a ÚNICA marca da lista: nada distingue passado
                // de futuro.
                const isToday = item.date === today;

                return (
                  <ListItem
                    /*
                    ⚠️ **A META DA DIREITA, NO SLOT `end` (decisão A da Tarefa
                    44).** Ela era `subtitle` desde a Tarefa 17; o canvas a
                    desenha em monoespaçada depois do condutor pontilhado, e o
                    `ListItem variant="sumario"` (Tarefa 41a) recusa `subtitle`
                    pelo tipo para que a migração não pudesse ser esquecida.
                  */
                    end={endFor(item, locale, isToday ? todayLabel : null)}
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

                    ⚠️ **E DESDE A TAREFA 32b AS DUAS SOBREPOSIÇÕES DIVIDEM
                    ESTE ESPAÇO** (decisão B): quem LEU e quem ESCREVEU, na
                    mesma linha. Uma segunda lista ("quem leu") duplicaria o
                    plano e obrigaria o olho a cruzar duas colunas. As duas são
                    distinguíveis sem cor — forma e `aria-label` diferentes —,
                    e o dono desse contrato é o `reading-marks.tsx`.

                    ⚠️ **E DESDE A TAREFA 44 AS DUAS SÃO O MESMO DESENHO EM DOIS
                    ESTADOS** (decisão B): o `PersonAvatar` saiu daqui e entrou
                    o `PresenceMark`, que é o círculo de 18×18 com a inicial
                    que o canvas desenha — CHEIO para quem escreveu
                    (`Livro.dc.html:73`), VAZADO para quem leu (`:83`). O
                    portador deixou de ser glifo × letra e passou a ser
                    preenchimento × contorno; a regra ("distinguível sem cor")
                    é a mesma, e o acusador continua sendo o mesmo `it()`.

                    ⚠️ E o `size="sm"` do `PersonAvatar` (32px) morreu com ele:
                    o `PresenceMark` tem UM tamanho, porque o canvas desenha um
                    só. O alvo de toque não regride — a marca nunca foi alvo
                    (decisão I da 32b), o alvo é a linha inteira.
                  */
                    start={
                      authors.length === 0 &&
                      whoRead.length === 0 ? undefined : (
                        <span className="flex items-center gap-1">
                          <ReadMarks
                            me={me}
                            names={memberNames}
                            userIds={whoRead}
                          />
                          {authors.map((userId) => {
                            const authorName = nameOfWriter(
                              userId,
                              me,
                              memberNames,
                            );

                            return (
                              <PresenceMark
                                key={userId}
                                /*
                                ⚠️ **REGRA 15 DA TAREFA 28: ISTO CONTINUA
                                DIZENDO O NOME.**

                                A primeira versão da Tarefa 27 deu nome ao
                                ACERVO e deixou esta sobreposição — dois dedos
                                acima, na mesma tela — com o glifo neutro e a
                                frase genérica: a mesma pessoa aparecia como
                                "Maria" embaixo e como "alguém" em cima,
                                visível ao dono no primeiro scroll. A Tarefa 28
                                tirou o acervo daqui e **não** pode desfazer a
                                correção — é por isso que o
                                `GET /clubs/:clubId/members` ficou nesta tela.

                                A razão de a chave ser INTERPOLADA (e não o nome
                                cru) é a metade FALADA: "escreveu neste dia" é o
                                que dá sentido ao avatar sozinho para quem ouve
                                a tela.

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
                                state="wrote"
                              />
                            );
                          })}
                        </span>
                      )
                    }
                    title={item.title}
                    /*
                    ⚠️ **O TOM É O ÚNICO LUGAR ONDE HOJE E O FUTURO SE
                    DISTINGUEM** (decisão D). O `today` traz o papel
                    `--surface-today` e o filete dourado em cima e embaixo
                    (`Livro.dc.html:139`); o `future` traz `--text-subtle`.

                    ⚠️ **O PASSADO FICA SEM TOM, e isso é o §1 do plano.**
                    Apagar o dia que já passou é cobrança desenhada, e
                    destacá-lo é "você não leu isto". Ele é uma linha comum.
                  */
                    tone={
                      isToday
                        ? 'today'
                        : item.date > today
                          ? 'future'
                          : undefined
                    }
                    variant="sumario"
                  />
                );
              })}
            </List>
          </section>
        )}
      </>
    );
  }

  /**
   * ⚠️ **A MARGEM DO DESKTOP — A LEGENDA DAS MARCAS** (decisão E da Tarefa 44).
   *
   * `LivroDesktop.dc.html:180-192`: 320px com `border-left` e
   * `padding-left:40px`, e o bloco "As marcas" — uma amostra VAZADA com "Leu
   * neste dia" e uma CHEIA com "Leu e escreveu". São três das sete chaves que a
   * Tarefa 40 criou e que ninguém consumia.
   *
   * ⚠️ **ABAIXO DE 1120px ELA DESCE PARA O FLUXO**, e isso é do `MarginRail`:
   * media query e só. O artboard de celular põe a mesma explicação em uma linha
   * ao lado do rótulo de seção (`Livro.dc.html:68`, "Cheio = escreveu"), que é
   * onde ela ficou — as duas convivem, e é de propósito: uma é a frase curta ao
   * lado do sumário, a outra é a legenda com as duas amostras desenhadas.
   *
   * ⚠️ **AS AMOSTRAS SÃO DECORATIVAS AQUI**, e por isso vão dentro de um
   * `aria-hidden`: a informação está escrita ao lado, em texto de verdade. O
   * `PresenceMark` exige `label`, e é certo que exija — na linha do plano ele é
   * a ÚNICA coisa que diz quem passou por ali. Na legenda não é, e anunciar
   * "Leu neste dia, imagem. Leu neste dia" seria a lição nº 16 do MVP 2.
   *
   * ⚠️ **A INICIAL DA AMOSTRA É A MINHA**, quando o `/me` já chegou. Um "A"
   * cravado seria texto de interface fora do catálogo; o glifo neutro do
   * `PresenceMark` (o caso `name === null`) é a resposta honesta enquanto não
   * sei quem é você, e é o mesmo que a linha do plano já desenha.
   *
   * ⚠️ **SEM `aria-label` NA REGIÃO**, que o `MarginRail` declara opcional:
   * nomeá-la pediria uma chave NOVA, e a regra 9 desta fatia não permite
   * nenhuma. O que se perde é o atalho de pular a região, não informação — o
   * rótulo da seção está em texto dentro dela. É o mesmo registro da Tarefa 43.
   *
   * ⚠️⚠️ **OS OUTROS DOIS BLOCOS ENTRARAM NA TAREFA 44b — e o que os barrava
   * era um LIMITE DA API, não uma decisão de tela.**
   *
   * A Tarefa 44 parou nos dois pela regra 9 dela, e a parada estava certa:
   * `GET /books/:bookId` não devolvia contagem nenhuma, e as duas listagens
   * que teriam os dados cortam em `FIND_ROW_LIMIT = 500` — *lista truncada é
   * registro; contagem truncada é mentira*. O dono abriu exceção ao
   * fora-de-escopo do MVP 3.5 e autorizou backend numa fatia própria; hoje a
   * resposta traz `inventory` (contado com `count()` no banco) e
   * `lastHighlight` (um `findFirst` ordenado), e as três chaves
   * `pages.book.inBook.*` que a Tarefa 40 criou finalmente têm consumidor.
   *
   * - **"Neste livro"** (`LivroDesktop.dc.html:196-207`): dois números e três
   *   links, todos para `acervoPath(book.id)`. ⚠️ **Chegar ao acervo com o
   *   tipo PRÉ-FILTRADO é território da Tarefa 46** (decisão E da 44b): o
   *   estado do filtro teria de ir para a URL, e o `acervo.tsx` não usa
   *   `useSearchParams` hoje. Registrado, não feito aqui;
   * - **"Último grifo"** (`:211-218`): a bolinha da caneta, a página, o nome e
   *   o trecho. O desenho é o `MarginHighlight`, dividido com a tela do dia
   *   (§7.1, "extrair, não cobrir duas vezes").
   *
   * ⚠️⚠️ **OS NÚMEROS SÃO INVENTÁRIO, NÃO PLACAR — e está escrito aqui porque
   * a próxima auditoria vai encontrá-los nesta tela**, que é justamente a que
   * o docblock do topo declara sem contador nenhum. Três propriedades, e as
   * três valem ao mesmo tempo: não há **total** contra o qual comparar ("18"
   * não é "18 de 30", e é por isso que a frase não casa o `COUNTER_SHAPE`); o
   * número **não muda quando alguém deixa de escrever**, então ele não pode
   * virar dívida; e ele **não é por pessoa**, então não há com quem se
   * comparar. O que o §1 do plano proíbe é comparação e cobrança — o tamanho
   * do que o clube fez junto não é nenhuma das duas. → o docblock do
   * `bookInventoryResponseSchema`, em `packages/shared/src/book.ts`.
   *
   * ⚠️ **O BLOCO DO GRIFO SÓ EXISTE QUANDO HÁ GRIFO.** `lastHighlight` é
   * `null` em todo livro recém-cadastrado, e um bloco vazio com o rótulo ali
   * seria o vazio anunciado que o §1 proíbe — a mesma razão pela qual o dia
   * sem autoria não ganha "ninguém escreveu".
   */
  function rail(data: BookWithPlanResponse): ReactNode {
    const { book, inventory, lastHighlight } = data;

    /*
      As duas linhas de inventário, montadas aqui para as CHAVES ficarem
      LITERAIS. Uma chave montada por interpolação compila, roda e desaparece
      de toda varredura que procura a chave escrita no fonte — é a mesma classe
      do mapa `bg-pen-*` montado em runtime, que o `GrifoText` documenta: o
      código funciona e a ferramenta que deveria guardá-lo para de ver.
    */
    const inBook = [
      { count: inventory.notes, label: t('pages.book.inBook.notes') },
      { count: inventory.highlights, label: t('pages.book.inBook.highlights') },
    ];

    return (
      <MarginRail className="gap-[26px] pt-4 min-[1120px]:pt-0">
        <section className="flex flex-col gap-3">
          <h2>
            <Eyebrow>{t('pages.book.marks.heading')}</Eyebrow>
          </h2>
          {(
            [
              ['read', t('pages.book.marks.read')],
              ['wrote', t('pages.book.marks.wrote')],
            ] as const
          ).map(([state_, phrase]) => (
            <div className="flex items-center gap-2.5" key={state_}>
              <span aria-hidden="true" className="flex">
                <PresenceMark
                  label={phrase}
                  name={me?.name ?? null}
                  state={state_}
                />
              </span>
              <span className="text-ui text-content">{phrase}</span>
            </div>
          ))}
        </section>

        {/*
          ⚠️ **O FILETE DE 1px ENTRE BLOCOS** (`LivroDesktop.dc.html:194` e
          `:209`: `height: 1px; background: #e3ddc9`, que é `--border-soft`).
          Ele é o que separa três assuntos numa coluna de 320px sem precisar
          de peso nem de cor — o mesmo papel que o `border-b` faz dentro das
          linhas de inventário.

          ⚠️ **`aria-hidden`, e não é zelo:** um `<div>` vazio anunciado no
          meio da margem é a lição nº 16 do MVP 2 pela porta dos fundos. A
          separação já está dita pelo `<h2>` de cada seção.

          ⚠️ **E ELE NÃO EXISTIA até a rodada de correção da Tarefa 44b**,
          embora a Definição de pronto daquela fatia o declarasse desenhado:
          os três `<section>` eram separados só pelo `gap-[26px]`. O acusador
          é `draws the three blocks in the CANVAS ORDER, with a hairline
          between them`.
        */}
        <div aria-hidden="true" className="h-px bg-line-soft" />

        <section className="flex flex-col gap-3">
          <h2>
            <Eyebrow>{t('pages.book.inBook.heading')}</Eyebrow>
          </h2>
          {inBook.map(({ count, label }) => (
            /*
              `justify-between` com o filete embaixo (`:198-205`), e o número em
              MONOESPAÇADA: é o mesmo tratamento que o canvas dá a todo número
              de aparato, e é o que o separa do rótulo sem precisar de cor.

              A linha inteira é o alvo, e ela leva ao acervo do livro — o
              `Link` do roteador, nunca âncora crua: num PWA `<a href>` é
              navegação de DOCUMENTO e recarrega o shell inteiro (a lição
              medida da Tarefa 16).
            */
            <Link
              className={cx(
                'flex items-baseline justify-between gap-3 border-b border-line-soft py-[7px] text-ui',
                FOCUS_RING,
              )}
              key={label}
              to={acervoPath(book.id)}
            >
              <span>{label}</span>
              <span className="font-mono text-ui text-muted">{count}</span>
            </Link>
          ))}
          {/*
            ⚠️ **O TERCEIRO LINK É O MESMO `pages.book.acervoLink` DO CORPO, e
            os dois nunca aparecem juntos.** A spec desta fatia previa uma chave
            NOVA aqui; medido, ela já existia (`pt.ts`, e o valor é
            exatamente "Ver o acervo do livro" do artboard). O que não pode
            existir é a frase DUAS vezes na mesma tela: o canvas de celular põe
            o link no corpo (`Livro.dc.html:60`) e o de desktop **só** na
            margem (`LivroDesktop.dc.html:206`).

            Daí o par de media queries, que é o MESMO desenho das duas lombadas
            do cabeçalho: os dois ficam montados e o CSS mostra um. A
            alternativa seria condicionar por largura em JavaScript, que é
            estado novo para resolver o que uma classe resolve.
          */}
          <Link
            className={cx('hidden py-2 min-[1120px]:inline-flex', FOCUS_RING)}
            to={acervoPath(book.id)}
          >
            {/*
              ⚠️ **DIVERGÊNCIA DECLARADA:** o canvas escreve este link com
              `letter-spacing: 0.1em` e o `Eyebrow` é 0,12em. Um
              `tracking-[0.1em]` ao lado **não** é o conserto — as duas classes
              são valores arbitrários do Tailwind, então quem vence é a ordem no
              CSS emitido, não a ordem de escrita, e o resultado seria um
              espaçamento decidido por sorte. É a mesma divergência que o
              `Eyebrow` do cabeçalho desta tela já declara.
            */}
            <Eyebrow>{t('pages.book.acervoLink')}</Eyebrow>
          </Link>
        </section>

        {/*
          ⚠️ **O SEGUNDO FILETE VIVE DENTRO DO MESMO `null` DO BLOCO DO
          GRIFO** (`LivroDesktop.dc.html:209`). Um separador escrito "depois
          de toda seção" deixaria um traço solto no fim da coluna em todo
          livro recém-cadastrado — que é o estado mais comum de todos, e é o
          que o acusador `drops the second hairline together with the
          last-highlight block` guarda.
        */}
        {lastHighlight === null ? null : (
          <>
            <div aria-hidden="true" className="h-px bg-line-soft" />
            <section className="flex flex-col gap-2.5">
              <h2>
                <Eyebrow>{t('pages.book.inBook.lastHighlight')}</Eyebrow>
              </h2>
              <MarginHighlight
                authorName={nameOfWriter(lastHighlight.userId, me, memberNames)}
                color={lastHighlight.color}
                page={lastHighlight.page}
                quote={lastHighlight.quote}
              />
            </section>
          </>
        )}
      </MarginRail>
    );
  }

  /*
    O título do livro É o título da tela quando ele chegou; antes disso, o nome
    da tela. O `h1` vem do `Screen` de `./chrome`, e é ele que faz
    "carregando", "não foi possível abrir" e "sem plano" serem estados de uma
    tela — não telas brancas (regra 9).
  */
  /*
    ⚠️ **SEM FILETE (Tarefa 42, auditoria B2).** O canvas não desenha o par de
    traços nesta tela — conferido pelo `gap:3px` dos 21 artboards —, e o
    padrão do `Screen` é `top`. Sem o `rule="none"` a tela ganha um traço
    que o desenho não tem, e nada acusa: filete a mais não muda texto, nem
    papel, nem foco. O acusador é
    `chrome.test.tsx › the screens the canvas draws with NO rule`.
  */
  return (
    <Screen
      /*
        ⚠️ **A MARGEM SÓ EXISTE COM O LIVRO CARREGADO** (a decisão C da Tarefa
        42): ausente ≠ vazio. Fora do `ready` não nasce `<aside>` nenhum, e
        portanto nem o filete vertical nem os 320px em branco ao lado de
        "Carregando…".
      */
      rail={state.status === 'ready' ? rail(state.data) : undefined}
      rule="none"
      title={
        state.status === 'ready' ? state.data.book.title : t('pages.book.title')
      }
    >
      {body()}
    </Screen>
  );
}
