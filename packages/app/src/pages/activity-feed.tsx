import {
  type ActivityEventResponse,
  activityResponseSchema,
  type ActivityType,
  type BookResponse,
  clubMembersResponseSchema,
} from '@clube/shared';
import { List, ListItem } from '@clube/ui';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import type { ActiveClubMe } from '../club/active-club';
import { listItemRouterLink } from '../router-link';
import { Notice } from './chrome';
import {
  memberNamesOf,
  MEMBERS_UNKNOWN,
  type MembersState,
  nameOfWriter,
} from './club-names';
import { dayNotePath } from './day-note';
import { freeNotePath } from './free-note';
import { bookPath, highlightPath } from './paths';

/**
 * O FEED DE ATIVIDADE DA HOME (Tarefa 35) — "o clube está vivo", sem placar.
 *
 * ⚠️ **ESTA É A SUPERFÍCIE MAIS PERIGOSA DO MVP PARA O §1 DO PLANO.** Um feed é,
 * por construção, uma superfície de **comparação**: quem fez mais aparece mais.
 * `docs/ACEITE-MVP.md` (MVP 3, pergunta 1, respondida pelo dono) decide que
 * atividade é **presença, não placar**, e cada decisão daqui executa isso:
 *
 * - **a linha é uma FRASE, não uma tabela** (decisão A). Uma coluna de pessoa
 *   convida o olho a varrê-la e contar; a frase obriga a ler uma coisa de cada
 *   vez. É o mesmo motivo pelo qual o plano usa avatar por dia e não contagem.
 * - **ordem cronológica pura, sem agrupar** (decisão B). Agrupar por pessoa **é**
 *   o placar; agrupar por dia cria cabeçalhos que viram régua ("ontem: 4 · hoje:
 *   0").
 * - **nenhum número em lugar nenhum** (regra 5): nem contagem, nem "+N", nem
 *   "e mais 3". E a metade ESTRUTURAL é mais forte que a varredura: o contrato
 *   da rota (`activityEventResponseSchema`) não devolve contagem nenhuma, então
 *   não existe número para renderizar por engano.
 * - **sem "carregar mais"** — um botão de histórico é o convite a rolar
 *   procurando quem fez mais, que é a comparação pela porta dos fundos.
 *
 * ⚠️ **MÓDULO PRÓPRIO, e a razão é a lição nº 8 do MVP 1 (divida ANTES de a tela
 * crescer).** A home entrou nesta fatia com **284 linhas** pelo contador
 * canônico (o docblock de `acervo.tsx`), e o feed traz três coisas novas: duas
 * cargas de rede com estado próprio, a frase por tipo, e o tempo relativo.
 * Enfiadas lá, a home passaria de 400. É o mesmo corte que a Tarefa 32b fez com
 * o `reading-marks.tsx`, e ele fica ao lado do `club-names.ts` — o vizinho de
 * assunto, porque quem escreveu, quem leu e quem aparece no feed se nomeiam pelo
 * MESMO `nameOfWriter`.
 *
 * ⚠️ **O EVENTO NÃO CARREGA O TEMA DO DIA, e isso é decisão registrada
 * (decisão E).** Ele tem `bookId` e `planItemId`, não o título. A home **tem** a
 * estante (então o nome do livro é resolvível de graça) e **não** tem o plano
 * dos outros livros — dizer "sobre o Cap. 3" seria uma requisição por livro do
 * feed, ou denormalizar o título dentro do evento (que envelhece quando o admin
 * corrige o plano). A pergunta está registrada para o dono em
 * `docs/tasks/35-feed-na-home.md`; ela **não** foi decidida aqui.
 */

/**
 * ⚠️ **O ALVO DE CADA TIPO — regra 4, e é uma função, não um `switch` dentro do
 * JSX.**
 *
 * A linha INTEIRA é o link (decisão D): é o padrão do acervo, e um alvo dentro
 * de outro alvo em celular é toque errado garantido (a decisão I da Tarefa 32b).
 *
 * ⚠️ **O `planItemId` É ANULÁVEL NO CONTRATO**, e os dois tipos que levam ao dia
 * o leem. Sem a queda para o livro, um evento sem dia montaria
 * `/books/b/days/undefined` — um endereço que CASA no roteador, abre a tela do
 * dia e pede uma anotação de um dia que não existe. Cair no livro mostra o
 * plano, que é o lugar de onde o dia saiu.
 *
 * O `READ` leva ao **dia**, como o `PLAN_NOTE`: o `subjectId` dele é o id do
 * `ReadingLog`, que não tem tela nenhuma — e "o que a pessoa leu" é o trecho
 * daquele dia.
 */
export function activityTarget(event: ActivityEventResponse): string {
  if (event.type === 'FREE_NOTE') {
    return freeNotePath(event.bookId, event.subjectId);
  }
  if (event.type === 'HIGHLIGHT') {
    return highlightPath(event.bookId, event.subjectId);
  }
  return event.planItemId === null
    ? bookPath(event.bookId)
    : dayNotePath(event.bookId, event.planItemId);
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

interface TimeRung {
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}

/**
 * ⚠️ **A ESCADA DO TEMPO RELATIVO — do maior degrau para o menor.**
 *
 * ⚠️ **ELA PARA NA SEMANA, E ISSO É DECISÃO, NÃO ESQUECIMENTO.** Mês e ano não
 * são múltiplos fixos de dia: "há 1 mês" calculado como 30 dias é um **número
 * errado na tela**, e a conta certa é calendário — que neste projeto tem dono e
 * é o Luxon, **só no backend** (`CLAUDE.md`). "Há 40 semanas" é feio e nunca
 * está errado, e o feed pede as últimas linhas de um clube ativo, não o
 * histórico.
 *
 * ⚠️ **E ELA É EXPORTADA PORQUE A GUARDA DA REGRA 13 A PERCORRE.** Um teste que
 * enumerasse `['minute', 'hour', 'day']` à mão ficaria verde sobre um degrau
 * novo — a forma de "guarda no lugar errado" do §7.9 nascendo de uma lista que
 * envelhece. O acusador percorre esta mesma constante.
 */
export const ACTIVITY_TIME_LADDER: readonly TimeRung[] = [
  { unit: 'week', ms: WEEK_MS },
  { unit: 'day', ms: DAY_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'minute', ms: MINUTE_MS },
];

/**
 * O piso: menos de um minuto é "agora".
 *
 * `second` com valor **0** e não `-30`: "há 30 segundos" num feed é precisão que
 * ninguém pediu, e o zero com `numeric: 'auto'` vira uma palavra sem dígito
 * nenhum ("agora" / "now").
 */
export const ACTIVITY_TIME_FLOOR: Intl.RelativeTimeFormatUnit = 'second';

export interface ActivityMoment {
  value: number;
  unit: Intl.RelativeTimeFormatUnit;
}

/**
 * "Quando" — sempre no passado.
 *
 * ⚠️ **NUNCA O FUTURO, e a razão é física**: o `createdAt` vem do servidor e o
 * "agora" vem do celular. Um relógio adiantado faria a tela dizer "em 2 minutos"
 * sobre uma coisa que já aconteceu. O piso também é a resposta para um
 * `createdAt` que não parseia — `Date.parse` devolve `NaN`, e toda comparação
 * com `NaN` é falsa, então a escada inteira não casa e a função cai no "agora".
 */
export function activityMoment(createdAt: string, now: Date): ActivityMoment {
  const elapsed = now.getTime() - Date.parse(createdAt);

  for (const rung of ACTIVITY_TIME_LADDER) {
    if (elapsed >= rung.ms) {
      return { value: -Math.floor(elapsed / rung.ms), unit: rung.unit };
    }
  }

  return { value: 0, unit: ACTIVITY_TIME_FLOOR };
}

/**
 * O "quando" em palavras, no idioma da tela.
 *
 * ⚠️ **`numeric: 'auto'` e não `'always'`**: é ele que dá "ontem", "anteontem",
 * "semana passada" e "agora" no lugar de "há 1 dia" — e, de quebra, tira o
 * dígito da linha em todos esses casos. `Intl` nativo, sem biblioteca: é a mesma
 * disciplina do `formatClubMonth` da home, e o teto do chunk do PWA não paga
 * nada por ele.
 *
 * ⚠️ **O QUE ELE ESCREVE NÃO PASSA PELO `t()`**, e é a única superfície de texto
 * do app assim. A guarda de catálogo não a vê e a varredura de DOM só a vê em
 * `pt`; quem a guarda nos dois idiomas é `__tests__/activity-feed.test.ts`
 * (regra 13). **Medido: zero ofensores** em `pt` e `en`, em todos os degraus.
 */
export function formatActivityMoment(
  createdAt: string,
  now: Date,
  locale: string,
): string {
  const moment = activityMoment(createdAt, now);
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    moment.value,
    moment.unit,
  );
}

/**
 * ⚠️ **QUANTAS LINHAS A HOME PEDE — decisão I, e o limite é EXPLÍCITO.**
 *
 * O contrato (`ACTIVITY_FEED_DEFAULT_LIMIT`) usa 50 quando ninguém diz nada, e
 * a home não mostra 50 linhas. Pedir o que a tela mostra é o que impede o feed
 * de virar histórico — e não há "e mais N" nem "carregar mais": um botão de
 * histórico é o convite a rolar procurando quem fez mais, que é a comparação
 * pela porta dos fundos.
 *
 * Doze é "os últimos dias de um clube ativo" sem virar rolagem.
 */
export const HOME_FEED_LIMIT = 12;

/**
 * A frase de cada tipo.
 *
 * ⚠️ **QUATRO CHAVES, NUNCA UMA MONTADA EM RUNTIME.** O `t()` deste projeto é
 * TIPADO pelo catálogo, e uma chave por concatenação devolveria `string` e
 * apagaria a checagem: uma chave inexistente apareceria crua na tela, que é o
 * sintoma exato que a tipagem existe para impedir.
 */
const SENTENCE_KEYS = {
  PLAN_NOTE: 'pages.home.feed.planNote',
  FREE_NOTE: 'pages.home.feed.freeNote',
  HIGHLIGHT: 'pages.home.feed.highlight',
  READ: 'pages.home.feed.read',
} as const satisfies Record<ActivityType, string>;

/**
 * ⚠️ **VAZIO E FALHA SÃO ESTADOS DIFERENTES, e não falam a mesma frase**
 * (decisão G, e a lição das Tarefas 19/25/28): "ainda não há atividade" é
 * constatação, "não foi possível carregar" é falha nossa. Um estado que fala
 * pela frase do outro é um estado que a varredura de DOM **não consegue
 * distinguir** — foi assim que uma cobrança plantada no `loading` da busca
 * passou com o teste do `/me` verde.
 */
type FeedState =
  | { status: 'loading' }
  | { status: 'ready'; events: readonly ActivityEventResponse[] }
  | { status: 'failed' };

const FEED_LOADING: FeedState = { status: 'loading' };

export interface ActivityFeedProps {
  clubId: string;
  /** Quem sou eu — para a minha linha dizer "Você" (decisão H). */
  me: ActiveClubMe | null;
  /**
   * A estante que a home JÁ carregou (medição 1 da spec): é ela que dá o nome
   * de cada livro. ⚠️ Buscar o livro de cada evento seriam N requisições para
   * enfeitar uma frase.
   */
  books: readonly BookResponse[];
}

/**
 * "O que aconteceu por aqui".
 *
 * ⚠️ **DUAS CARGAS, PARALELAS ENTRE SI, E NENHUMA BLOQUEIA A ESTANTE** (decisão
 * F). São dois efeitos independentes, e é de propósito: serial seria "o feed e,
 * quando ele voltar, os membros" — com o feed pendurado no metrô, os nomes nunca
 * chegariam. E as duas falham em separado: sem os nomes as linhas aparecem com a
 * frase neutra (regra 8), e a estante nem toma conhecimento.
 *
 * ⚠️ **A FALHA DOS MEMBROS É SILENCIOSA; a do FEED tem frase.** Ninguém lê um
 * texto de servidor por causa de um nome — o `MEMBERS_UNKNOWN` degrada para
 * "Alguém do clube", como no acervo e na busca. O feed é diferente: sem frase
 * ele desapareceria, e "não aconteceu nada" é justamente o que a decisão G
 * proíbe dizer quando o que caiu foi a rede.
 */
export function ActivityFeed({ books, clubId, me }: ActivityFeedProps) {
  const { i18n, t } = useTranslation();
  const { api } = useAuth();

  const [feed, setFeed] = useState<FeedState>(FEED_LOADING);
  const [members, setMembers] = useState<MembersState>(MEMBERS_UNKNOWN);

  useEffect(() => {
    let cancelled = false;
    setFeed(FEED_LOADING);

    void api
      .get(
        `/clubs/${encodeURIComponent(clubId)}/activity?limit=${String(HOME_FEED_LIMIT)}`,
        activityResponseSchema,
      )
      .then((events) => {
        if (cancelled) return;
        /*
          A ordem é a que a API devolveu (do mais recente para trás, no
          `listActivity`). ⚠️ A tela NÃO reordena e NÃO agrupa — duas ordens
          seriam duas verdades, e agrupar por pessoa É o placar (decisão B).
        */
        setFeed({ status: 'ready', events });
      })
      .catch(() => {
        if (cancelled) return;
        setFeed({ status: 'failed' });
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubId]);

  useEffect(() => {
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
        /*
          Nada a escrever: o estado já é `unknown` desde o começo do efeito, e o
          nome cai na frase neutra. O `catch` existe para a rejeição ter dono.
        */
      });

    return () => {
      cancelled = true;
    };
  }, [api, clubId]);

  /** `userId` → nome. O dono da regra é o `club-names.ts`. */
  const memberNames = useMemo(() => memberNamesOf(members), [members]);

  /** `bookId` → título. Um `Map` por estante; resolução O(1) por linha. */
  const bookTitles = useMemo(
    () => new Map(books.map((book) => [book.id, book.title])),
    [books],
  );

  /*
    "AGORA" no corpo do render, sem `useMemo` — a mesma disciplina do "hoje" da
    home: um `useMemo` congelaria o relógio numa aba aberta desde ontem, e o
    feed inteiro passaria a mentir sobre quando as coisas aconteceram.
  */
  const now = new Date();
  const locale = i18n.resolvedLanguage ?? 'pt';

  /**
   * ⚠️ **"Você" ganha do meu nome** (decisão H): eu não me leio pelo nome numa
   * lista em que também estão os outros, e uma frase dizendo o próprio nome na
   * terceira pessoa soa a registro de ponto. O vocabulário é o do acervo
   * (`pages.acervo.item.author.*`) de propósito — duas chaves para a mesma
   * palavra seriam duas verdades sobre o mesmo nome (lição nº 3 do MVP 1).
   */
  function authorLabelOf(userId: string): string {
    if (me !== null && userId === me.id) {
      return t('pages.acervo.item.author.you');
    }
    return (
      nameOfWriter(userId, me, memberNames) ??
      t('pages.acervo.item.author.other')
    );
  }

  /**
   * O livro da linha — frase neutra quando a estante não o conhece (regra 6:
   * livro arquivado, ou de um mês que a listagem não trouxe).
   *
   * ⚠️ **NUNCA o `bookId` cru**: um UUID na linha tem cara de informação e não é
   * de ninguém (a medição do `nameOfWriter`). E nunca **nada**: "em que livro" é
   * metade do que a linha diz. A chave é a da busca, que já responde exatamente
   * esta pergunta — um `pages.home.feed.unknownBook` seria a mesma frase com
   * dois donos.
   */
  function bookLabelOf(bookId: string): string {
    return bookTitles.get(bookId) ?? t('pages.busca.item.unknownBook');
  }

  function lines() {
    if (feed.status === 'loading') {
      return (
        <p className="text-sm text-muted">{t('pages.home.feed.loading')}</p>
      );
    }

    if (feed.status === 'failed') {
      /*
        ⚠️ **`Notice` E SEM "TENTAR DE NOVO", e os dois são decisão.** O
        `Notice` não tem cor de perigo: o vermelho aqui seria o §1 do plano
        sendo violado pelo caminho de erro. E o feed é o ACESSÓRIO da home
        (decisão F) — um segundo botão de repetir ao lado do da estante daria ao
        acessório o mesmo peso do produto.
      */
      return <Notice title={t('pages.home.feed.failed')} />;
    }

    if (feed.events.length === 0) {
      return <Notice title={t('pages.home.feed.empty')} />;
    }

    return (
      <List aria-label={t('pages.home.feed.label')} className="gap-1">
        {feed.events.map((event) => (
          <ListItem
            /*
              O "quando" no slot de FIM, que é onde o `ListItem` põe data. Ele
              descreve o que ACONTECEU, nunca o que não aconteceu: não existe
              "há 3 dias ninguém escreve" (decisão C).
            */
            end={formatActivityMoment(event.createdAt, now, locale)}
            href={activityTarget(event)}
            key={event.id}
            renderLink={listItemRouterLink}
            /*
              ⚠️ UMA FRASE, não uma tabela (decisão A): quem · o quê · em que
              livro, numa linha de texto só. Uma coluna de pessoa convida o olho
              a varrê-la e a contar quem fez mais.
            */
            title={t(SENTENCE_KEYS[event.type], {
              name: authorLabelOf(event.userId),
              book: bookLabelOf(event.bookId),
            })}
          />
        ))}
      </List>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted">
        {t('pages.home.feed.heading')}
      </h2>
      {lines()}
    </section>
  );
}
