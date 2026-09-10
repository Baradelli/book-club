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
import { Button, List, ListItem, PersonAvatar } from '@clube/ui';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';
import { useActiveClub } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
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
import { acervoPath, bookEditPath, isClubAdmin } from './paths';

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
 * **247** depois desta fatia — a ordem de grandeza de uma tela de plano. A lição
 * nº 8 do MVP 1 é dividir **antes** de a tela crescer, e esta fatia foi o
 * "antes" marcado pela 25 e pela 27.
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
 * ⚠️ **E ELA TRAZ SÓ `userId` — NENHUM NOME.** Daí a resolução pelo
 * `nameOfWriter` abaixo, contra o `GET /clubs/:clubId/members` (Tarefa 26a): com
 * o `userId` cru, o `PersonAvatar` extrai a primeira letra do UUID e desenha um
 * "F" ou um "C" — **uma inicial que tem cara de inicial e não é de ninguém**.
 * Medido na Tarefa 17. Comunicar errado é pior que não comunicar, e `null` cai
 * no glifo neutro que a Tarefa 13 pôs ali exatamente para "sem nome", escolhido
 * para não parecer cobrança. A **cor** continua vindo do `id`, então duas
 * pessoas seguem distinguíveis entre si.
 *
 * ⚠️ E o `me` é `null` fora do `ready` do `/me` — nesse frame TODO avatar cai
 * no glifo neutro, que é a resposta honesta para "ainda não sei quem é você".
 */
function writersByPlanItem(
  writers: BookWithPlanResponse['writers'],
): Map<string, readonly string[]> {
  return new Map(writers.map((entry) => [entry.planItemId, entry.userIds]));
}

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
      state.status === 'ready'
        ? writersByPlanItem(state.data.writers)
        : new Map<string, readonly string[]>(),
    [state],
  );

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
        <div className="flex">
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
                  */
                  start={
                    authors.length === 0 ? undefined : (
                      <span className="flex items-center gap-1">
                        {authors.map((userId) => {
                          const authorName = nameOfWriter(
                            userId,
                            me,
                            memberNames,
                          );

                          return (
                            <PersonAvatar
                              id={userId}
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
