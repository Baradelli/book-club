import {
  type ActivityEventResponse,
  activityResponseSchema,
  type ActivityType,
  type BookResponse,
  clubMembersResponseSchema,
  type ClubStreaksResponse,
  clubStreaksResponseSchema,
} from '@clube/shared';
import { Eyebrow, List, ListItem } from '@clube/ui';
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
import { StreakBar } from './streak-bar';

/**
 * O FEED DE ATIVIDADE DA HOME (Tarefa 35) — "o clube está vivo", ~~sem placar~~.
 *
 * ⚠️ **"SEM PLACAR" CAIU NA TAREFA 38c, E ESTE ARQUIVO É O PRIMEIRO A DESMENTIR
 * O QUE ESCREVE.** O dono pediu a corrente de leitura — o foguinho — e reafirmou
 * com a objeção e a medição na mão; está registrado em
 * `docs/adr/0010-corrente-de-leitura-visivel.md`. A `<StreakBar>` importada logo
 * acima e renderizada no TOPO desta tela mostra um **número por pessoa do clube**.
 * ⚠️ **Nada abaixo foi apagado, porque quase tudo continua valendo** — as decisões
 * A, B e D seguem de pé e seguem testadas. O que caiu é a promessa LARGA, e ela
 * está riscada onde aparece. Leia o resto como "o feed em si não conta nada",
 * não como "esta tela não tem número".
 *
 * ⚠️ **ESTA É A SUPERFÍCIE MAIS PERIGOSA DO MVP PARA O §1 DO PLANO.** Um feed é,
 * por construção, uma superfície de **comparação**: quem fez mais aparece mais.
 * `docs/ACEITE-MVP.md` (MVP 3, pergunta 1, respondida pelo dono) decidia que
 * atividade é **presença, não placar** — ⚠️ **e o próprio dono reverteu essa
 * resposta depois (ADR 0010)**. As decisões daqui continuam executando a parte
 * que sobreviveu:
 *
 * - **a linha é uma FRASE, não uma tabela** (decisão A). Uma coluna de pessoa
 *   convida o olho a varrê-la e contar; a frase obriga a ler uma coisa de cada
 *   vez. É o mesmo motivo pelo qual o plano usa avatar por dia e não contagem.
 * - **ordem cronológica pura, sem agrupar** (decisão B). Agrupar por pessoa **é**
 *   o placar; agrupar por dia cria cabeçalhos que viram régua ("ontem: 4 · hoje:
 *   0").
 * - ~~**nenhum número em lugar nenhum** (regra 5): nem contagem, nem "+N", nem
 *   "e mais 3".~~ ⚠️ **ESTA É A QUE MORREU** — o foguinho é exatamente um número
 *   nesta tela. ✅ **A metade ESTRUTURAL, porém, continua inteira e é o que
 *   importa guardar:** o contrato do EVENTO (`activityEventResponseSchema`) não
 *   devolve contagem nenhuma e **não mudou** na 38c; o número da corrente vem de
 *   outra rota (`GET /clubs/:clubId/streaks`), por outro schema. Nenhuma LINHA
 *   do feed ganhou número — continua sendo impossível renderizar "3 atividades"
 *   por engano aqui.
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
 * ⚠️ ~~**O EVENTO NÃO CARREGA O TEMA DO DIA, e isso é decisão registrada
 * (decisão E).** Ele tem `bookId` e `planItemId`, não o título. A home **tem** a
 * estante (então o nome do livro é resolvível de graça) e **não** tem o plano
 * dos outros livros — dizer "sobre o Cap. 3" seria uma requisição por livro do
 * feed, ou denormalizar o título dentro do evento (que envelhece quando o admin
 * corrige o plano). A pergunta está registrada para o dono em
 * `docs/tasks/35-feed-na-home.md`; ela **não** foi decidida aqui.~~
 *
 * ⚠️ **ESTE PARÁGRAFO FICOU FALSO NA TAREFA 38e, e a pergunta que ele registrava
 * foi respondida pelo dono:** *"quero o tema do dia na linha"*
 * (`docs/ACEITE-MVP.md`, MVP 3, pergunta 3). A resposta da API passou a levar
 * `planItemTitle`, e a linha diz "escreveu sobre Cap. 3 — A promessa, em O
 * Hobbit" quando há dia.
 *
 * ✅ **E A RECUSA QUE ELE PROTEGIA CONTINUA INTEIRA, palavra por palavra.**
 * Denormalizar o título **dentro do `ActivityEvent`** segue proibido: o evento é
 * log imutável, **não ganhou coluna**, e um título guardado envelheceria no dia
 * em que o admin corrigisse o plano — aí o feed mentiria sobre o passado, que é
 * pior que não dizer nada.
 *
 * ⚠️ **O que mudou é ONDE a junção acontece, e é essa diferença que fez a fatia
 * caber sem desfazer nada:** o título é resolvido **na LEITURA**, no
 * `listActivity`, a partir do plano **atual**. Ele nunca é guardado, nunca tem
 * versão e não pode divergir do plano — porque *é* o plano. E não são as N
 * requisições que o parágrafo riscado temia: a junção é **uma** consulta a mais
 * no servidor, indexada por id, e a tela não pede nada além do que já pedia.
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
 * do app assim. A guarda de catálogo não a vê, e a varredura de DOM só vê os
 * degraus que a tela renderizar naquele teste; quem a guarda é
 * `__tests__/activity-feed.test.ts` (regra 13), que percorre a escada inteira.
 * **Medido: zero ofensores**, em todos os degraus.
 *
 * ⚠️ **O parâmetro `locale` fica, e ele NÃO é resíduo do segundo catálogo
 * (Tarefa 38d):** é uma tag de `Intl`, dado que vive no navegador e custa zero
 * byte de bundle. O único chamador passa o `i18n.resolvedLanguage`, que hoje só
 * pode ser `'pt'` — e a varredura acima roda em `pt`, que é o que o produto
 * entrega.
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
 * ⚠️ **A frase de quem TEM tema do dia — e o mapa é PARCIAL de propósito.**
 *
 * Só dois dos quatro nascimentos têm dia de leitura: a anotação do dia e o "li".
 * A avulsa e o grifo gravam `planItemId: null` por construção (ADR 0004), então
 * uma chave `freeNoteOnTheme` seria uma frase que o produto nunca mostra — e uma
 * frase que ninguém renderiza é uma frase que ninguém revisa.
 *
 * O `Partial` não é fraqueza de tipo: é ele que obriga o `activitySentenceKey`
 * a ter uma queda explícita, que é justamente o comportamento certo se um dia um
 * título chegar num tipo sem dia.
 */
const SENTENCE_KEYS_ON_THEME = {
  PLAN_NOTE: 'pages.home.feed.planNoteOnTheme',
  READ: 'pages.home.feed.readOnTheme',
} as const satisfies Partial<Record<ActivityType, string>>;

/** A chave de uma frase COM tema — o alfabeto do mapa parcial acima. */
type OnThemeSentenceKey =
  (typeof SENTENCE_KEYS_ON_THEME)[keyof typeof SENTENCE_KEYS_ON_THEME];

/**
 * A chave de qualquer frase de linha. Ela é um LITERAL, e precisa ser: o `t()`
 * deste projeto é tipado pelo catálogo, e uma `string` larga apagaria a checagem
 * que impede uma chave inexistente de aparecer crua na tela.
 */
type FeedSentenceKey =
  (typeof SENTENCE_KEYS)[ActivityType] | OnThemeSentenceKey;

/**
 * ⚠️ **QUAL FRASE A LINHA USA — e é uma função pura, não um ternário no JSX.**
 *
 * Fora do componente porque a propriedade é decidível sem tela (§7.9): "o evento
 * com tema usa a frase com tema" é uma função de um evento para uma chave, e
 * prová-la montando a home seria montar meio app para afirmar um `if`. O
 * `catalogs.test.ts` prova que as seis frases são distintas entre si; ele não
 * consegue provar que a tela escolhe a certa — esta função é a metade que falta,
 * e ela tem acusador em `__tests__/activity-feed.test.ts`.
 *
 * ⚠️ **OS DOIS `null` DE `planItemTitle` CAEM NO MESMO RAMO, e é decisão** (a
 * decisão C da Tarefa 38e): o evento que não tem dia (avulsa, grifo) e o dia que
 * **existia e sumiu** do plano. **Não existe frase de "dia removido"** — seria
 * ruído sobre uma correção de plano que não é da conta de quem lê o feed, e a
 * linha continua inteira dizendo o livro.
 */
export function activitySentenceKey(
  event: ActivityEventResponse,
): FeedSentenceKey {
  /*
    O mapa parcial visto sobre os QUATRO tipos — é o que dá um `undefined`
    tipado para a avulsa e o grifo, em vez de um `as` na chave. Sem `any` e sem
    asserção: o compilador continua sabendo quais literais podem sair daqui.
  */
  const onTheme: Partial<Record<ActivityType, OnThemeSentenceKey>> =
    SENTENCE_KEYS_ON_THEME;
  const withTheme = onTheme[event.type];

  if (event.planItemTitle !== null && withTheme !== undefined) {
    return withTheme;
  }
  return SENTENCE_KEYS[event.type];
}

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

  /*
    ⚠️ **A CORRENTE DE LEITURA (ADR 0010).** Ela mora AQUI, e não num componente
    próprio que busque sozinho, porque este já carrega `members` — dois
    componentes buscando os mesmos membros na mesma tela seriam duas
    requisições para o mesmo dado.

    Falha em silêncio: a corrente é enfeite ao lado do feed, e uma tela que
    troca a atividade do clube por um erro de foguinho errou a prioridade.
  */
  const [streaks, setStreaks] = useState<ClubStreaksResponse>([]);

  useEffect(() => {
    let cancelled = false;
    setStreaks([]);

    void api
      .get(
        `/clubs/${encodeURIComponent(clubId)}/streaks`,
        clubStreaksResponseSchema,
      )
      .then((list) => {
        if (!cancelled) setStreaks(list);
      })
      .catch(() => {
        // Ver o comentário acima: sem corrente, o feed continua inteiro.
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
            title={t(activitySentenceKey(event), {
              name: authorLabelOf(event.userId),
              book: bookLabelOf(event.bookId),
              /*
                ⚠️ **O TEMA É CONTEÚDO DO USUÁRIO** (regra 7 da Tarefa 38e):
                quem digita o título do dia é o admin do clube. Ele entra pelo
                buraco da frase, e é por isso que a frase com tema é uma CHAVE
                própria e não uma concatenação — o buraco é o que separa o nosso
                texto do dele, e é o que mantém as varreduras de vocabulário
                medindo as nossas frases.

                `?? ''` só existe porque o i18next quer `string`: quando o tema
                é `null` a chave escolhida é a SEM tema, e este valor não é lido.
              */
              theme: event.planItemTitle ?? '',
            })}
          />
        ))}
      </List>
    );
  }

  return (
    /*
      ⚠️ **O RITMO DA MARGEM MORA AQUI, E SÓ AQUI — `gap:18px`
      (`InicioDesktop.dc.html:104`)**, que é onde esta seção passou a viver na
      Tarefa 45. O rótulo, a corrente e as linhas são os três blocos que o
      canvas espaça, e os três estão dentro deste `<section>`.

      ⚠️ ~~Ele repete o `gap` do `MarginRail` que a envolve~~ — **repetia, e a
      cópia de lá era LETRA MORTA**: o `MarginRail` é `flex flex-col` e esta
      margem tem UM filho (esta seção), então o `gap` dela não espaçava nada.
      A classe morta saiu de `home.tsx` na auditoria da fatia. Quem mudar este
      número mudou o ritmo inteiro da margem — o acusador é
      `home.test.tsx › ⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o
      ritmo de 18px`.
    */
    <section className="flex flex-col gap-[18px]">
      {/*
        O rótulo de seção em monoespaçada maiúscula — `Inicio.dc.html:93` e
        `InicioDesktop.dc.html:105`, os dois em `--text-muted`. O `<h2>` fica e
        o `Eyebrow` vai DENTRO dele: o componente é a TIPOGRAFIA do rótulo, não
        a semântica (ele é um `<span>` de propósito).

        ⚠️ **E ISTO TEM ACUSADOR DESDE A AUDITORIA DA TAREFA 45.** Medido:
        devolver o `<h2 className="text-sm font-semibold text-muted">` que
        estava aqui passava os 951 testes do app — o `Eyebrow` tinha entrado
        sem ninguém guardando que ele ficasse. Quem guarda é
        `home.test.tsx › ⚠️ o rótulo do feed é o Eyebrow, e a margem guarda o
        ritmo de 18px`.
      */}
      <h2>
        <Eyebrow>{t('pages.home.feed.heading')}</Eyebrow>
      </h2>
      {/*
        ⚠️ ACIMA das linhas, e é escolha: o foguinho é o que o dono quer ver
        primeiro. ⚠️ E ele **contraria o desenho do feed de propósito** (ADR
        0010) — o feed nasceu sem coluna de pessoa e sem número justamente
        porque uma coluna com número convida a comparar.
      */}
      <StreakBar
        me={me}
        names={memberNames}
        readToday={
          me === null
            ? false
            : (streaks.find((row) => row.userId === me.id)?.readToday ?? false)
        }
        streaks={streaks}
      />
      {lines()}
    </section>
  );
}
