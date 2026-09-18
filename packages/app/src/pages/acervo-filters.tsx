import { HIGHLIGHT_PAGE_MAX } from '@clube/shared';
import { type FilterGroup, type FilterOption, PersonAvatar } from '@clube/ui';
import type { TFunction } from 'i18next';
import type { ReactNode } from 'react';

import type { ActiveClubMe } from '../club/active-club';
import {
  ALL_SCOPE,
  authorScope,
  EVERY_COLOR,
  EVERY_READING,
  EVERY_TYPE,
  MINE_SCOPE,
  OTHERS_SCOPE,
  type PageRange,
} from './acervo-entries';
import type { MembersState } from './club-names';
import { TEXT_INPUT_CLASS } from './form-styles';
import {
  COLOR_LABEL_KEYS,
  ColorSwatch,
  HIGHLIGHT_COLORS,
  type HighlightColor,
} from './highlight-colors';

/**
 * OS CONTROLES DAS **SEIS** DIMENSÕES DO ACERVO — o vocabulário e a marcação.
 *
 * ⚠️ **A SEXTA — A FAIXA DE PÁGINA — CHEGOU NA TAREFA 38h, e a conta se
 * repetiu.** *"Os grifos do capítulo 3"* pedido pelo eixo que é do grifo. O
 * módulo foi de **194** para **257**; o `acervo.tsx` continuou em **511**,
 * porque o "tentar de novo", escrito três vezes lá, virou um dono só.
 *
 * ⚠️ **A QUINTA — O TEXTO — CHEGOU NA TAREFA 38g, E ELA É A COSTURA QUE ESTE
 * MÓDULO FOI ABERTO PARA RECEBER.** O docblock abaixo dizia, desde a Tarefa 28,
 * que "é dentro do `collection()` que o campo de busca da Tarefa 29 entra, ao
 * lado destes controles". Entrou — dez fatias depois, e **inteiro aqui**: o
 * `acervo.tsx` estava em 511 linhas canônicas contra um teto de 400, e a regra
 * 5 da 38g proibia que ele subisse uma linha. O módulo foi de **165** para
 * **194**; a tela ficou onde estava.
 *
 * ⚠️ **MÓDULO PRÓPRIO, E A COSTURA FOI CORRIGIDA POR MEDIÇÃO.** O relatório da
 * Tarefa 28 nomeou a linha de grifo como a próxima costura do `acervo.tsx`; a
 * auditoria mediu por função, com o contador canônico, e a resposta é outra:
 *
 * ```
 *                  ANTES   DEPOIS
 * (módulo)           205      197
 * collection()       146       98   ← o corte
 * body()             104      104
 * highlightRow        63       63
 * authorOptions       33        0   ← veio para cá
 * noteRow             24       24
 * archive             23       23
 * rowOf                5        5
 * total do arquivo   603      514
 * ```
 *
 * O `collection()` era **146** linhas — o dobro do card de grifo, que tem
 * **63** (o "~90" do relatório da fatia era a contagem CRUA, com comentário; o
 * número canônico é 63). E é dentro do `collection()` que o **campo de busca da
 * Tarefa 29** entra, ao lado destes controles. Cortar aqui é a lição nº 8 do
 * MVP 1 ("divida **antes** de a tela crescer") com o "antes" sendo a fatia
 * seguinte, não um futuro genérico.
 *
 * Este módulo tem **257** linhas canônicas (165 até a Tarefa 38g, 194 até a
 * 38h), e nenhuma delas é estado.
 *
 * ⚠️ **E NÃO FOI PARA O `acervo-entries.ts`, apesar de ser lá que o assunto
 * mora — a razão é MEDIDA e é o próprio motivo daquele módulo existir.** O
 * `FilterOption.start` é um `ReactNode`: o chip de pessoa carrega um
 * `<PersonAvatar>` e cada chip de cor uma `<ColorSwatch>`. Construir os
 * `FilterGroup[]` **exige JSX**, e o `acervo-entries.ts` vale exatamente por
 * ser a parte que **não sabe o que é React** — transformá-lo em `.tsx` apagaria
 * a única propriedade que o docblock dele promete. Então: o modelo puro fica
 * lá, o vocabulário e a marcação ficam aqui, e a tela orquestra os dois.
 *
 * ⚠️ **CONTROLADO (decisão A da Tarefa 27): nada aqui guarda estado.** As
 * funções recebem o valor corrente e o `set*`; quem decide se o filtro vive na
 * URL, no `useState` ou em nada é a tela. E a DERIVAÇÃO do que está aceso
 * também é da tela — ela precisa do mesmo valor para recortar a lista, e dois
 * lugares calculando "qual chip está aceso" seriam duas verdades (é a regra 12).
 *
 * ⚠️ **NENHUM `role="group"` E NENHUM `aria-pressed` AQUI**: a fronteira
 * acessível é do `FilterBar` de `packages/ui` (decisão C da 27), e escrevê-la
 * numa segunda casa é o jeito silencioso de a segunda sair de sincronia — foi o
 * que aconteceu com as duas varreduras anti-culpa da Tarefa 17 e com as duas
 * listas de `GUILT_TERMS` até a 19.
 */

/**
 * REGRA 7 — OS CHIPS DE PESSOA, e o que **não** entra é metade da regra:
 *
 * - **eu não viro chip** — eu sou o "Minhas". Dois chips para o mesmo recorte é
 *   confusão, e o de baixo faria o de cima parecer quebrado;
 * - **quem saiu do clube não vira chip** (decisão A da 26a): os `ARCHIVED`
 *   chegam na resposta **exclusivamente** para resolver o nome de quem escreveu
 *   e saiu, e isso acontece na LISTA, não no filtro;
 * - **`name: null` não vira chip vazio nem "null"**: cai numa frase do
 *   catálogo, porque o backend não inventa fallback (decisão C da 26a) — e em
 *   qual idioma ele inventaria?
 *
 * ⚠️ **E O `me` NULO DEGRADA A DIMENSÃO INTEIRA, de propósito.** É a armadilha
 * nomeada da Tarefa 18 na sua segunda cara: com os membros carregados e o `me`
 * desconhecido, eu ganharia um chip MEU ao lado de um "Minhas" que mostra tudo.
 * Saber quem são as pessoas não basta — é preciso saber qual delas sou eu.
 */
export function authorOptions(
  t: TFunction,
  members: MembersState,
  me: ActiveClubMe | null,
): FilterOption[] {
  const fixed: FilterOption[] = [
    // O estado neutro é do CHAMADOR (decisão H da 27): o `FilterBar` não sabe
    // que existe um "tudo", e o rótulo dele é texto que só a tela traduz.
    { value: ALL_SCOPE, label: t('pages.acervo.filters.person.all') },
    { value: MINE_SCOPE, label: t('pages.acervo.filters.person.mine') },
  ];

  if (members.status !== 'ready' || me === null) {
    return [
      ...fixed,
      { value: OTHERS_SCOPE, label: t('pages.acervo.filters.person.others') },
    ];
  }

  const mineId = me.id;

  return [
    ...fixed,
    // A ordem é a que a API devolveu (o `listClubMembers` ordena por nome). A
    // tela NÃO reordena — duas ordens seriam duas verdades.
    ...members.members
      .filter(
        (member) => member.status === 'ACTIVE' && member.userId !== mineId,
      )
      .map((member) => ({
        value: authorScope(member.userId),
        label:
          member.name === null
            ? t('pages.acervo.filters.person.unnamed')
            : t('pages.acervo.filters.person.person', { name: member.name }),
        /*
          O `PersonAvatar` no slot `start` do chip, sem `label` de propósito: o
          nome está escrito ao lado, e um `aria-label` igual faria o leitor de
          tela repetir. A cor vem do `id`, e a inicial agora é a de VERDADE — é
          isso que a Tarefa 26a comprou.
        */
        start: <PersonAvatar id={member.userId} name={member.name} size="sm" />,
      })),
  ];
}

export interface FilterGroupsArgs {
  t: TFunction;
  /** Já construídas e já derivadas pela tela (regra 12). */
  authors: readonly FilterOption[];
  selectedAuthor: string;
  onAuthor: (value: string) => void;
  typeScope: string;
  onType: (value: string) => void;
  color: HighlightColor | null;
  /** Decisão E: o grupo de cor só EXISTE quando o tipo pode incluir grifo. */
  colorApplies: boolean;
  onColor: (value: string) => void;
}

/**
 * OS GRUPOS DE CHIPS — pessoa, tipo e (condicionalmente) cor.
 *
 * ⚠️ **A COR NUNCA É O ÚNICO PORTADOR**: a amostra vai no slot `start` e o
 * **nome** vai no `label`. Um chip só-com-bolinha não diria nada a quem não
 * distingue as cinco cores — e o `FilterOption.label` é obrigatório justamente
 * para isso não compilar.
 *
 * ⚠️ **A LEITURA NÃO ESTÁ AQUI, e é a decisão D**: ela é um `<select>` nativo
 * (o `ReadingSelect` abaixo), porque o plano real tem trinta dias e trinta
 * chips num celular é um filtro que ninguém usa.
 */
export function filterGroups({
  authors,
  color,
  colorApplies,
  onAuthor,
  onColor,
  onType,
  selectedAuthor,
  t,
  typeScope,
}: FilterGroupsArgs): FilterGroup[] {
  const groups: FilterGroup[] = [
    {
      id: 'person',
      label: t('pages.acervo.filters.person.label'),
      options: authors,
      selected: selectedAuthor,
      onSelect: (option) => {
        onAuthor(option.value);
      },
    },
    {
      id: 'type',
      label: t('pages.acervo.filters.type.label'),
      options: [
        { value: EVERY_TYPE, label: t('pages.acervo.filters.type.all') },
        { value: 'PLAN', label: t('pages.acervo.kind.plan') },
        { value: 'FREE', label: t('pages.acervo.kind.free') },
        { value: 'HIGHLIGHT', label: t('pages.acervo.kind.highlight') },
      ],
      selected: typeScope,
      onSelect: (option) => {
        onType(option.value);
      },
    },
  ];

  if (colorApplies) {
    groups.push({
      id: 'color',
      label: t('pages.acervo.filters.color.label'),
      options: [
        /* O estado neutro é do CHAMADOR (decisão H da 27): o componente não
           sabe que existe um "todas", e o rótulo dele é texto que só a tela
           traduz. */
        { value: EVERY_COLOR, label: t('pages.acervo.filters.color.all') },
        /* A ordem é a de `@clube/shared` — a mesma da barra do editor. */
        ...HIGHLIGHT_COLORS.map((candidate) => ({
          value: candidate,
          label: t(COLOR_LABEL_KEYS[candidate]),
          start: <ColorSwatch color={candidate} />,
        })),
      ],
      selected: color ?? EVERY_COLOR,
      onSelect: (option) => {
        onColor(option.value);
      },
    });
  }

  return groups;
}

/**
 * ⚠️ **O `id` DO CAMPO DE TEXTO — o mesmo motivo do `<select>` de leitura.**
 *
 * O rótulo é VISÍVEL e associado, nunca um `aria-label` solto: um `aria-label`
 * daria nome a quem OUVE a tela e deixaria quem VÊ sem saber o que aquele campo
 * recorta. Um `id` fixo basta porque a tela é uma por rota.
 */
const TEXT_FILTER_ID = 'acervo-text';

export interface TextFilterProps {
  t: TFunction;
  /** ⚠️ O texto CRU do campo. Quem normaliza é o `acervo-entries.ts`. */
  text: string;
  onText: (value: string) => void;
}

/**
 * A QUINTA DIMENSÃO — O TEXTO (Tarefa 38g), ao lado das outras quatro.
 *
 * ⚠️ **O CAMPO MORA AQUI, E NÃO NO `acervo.tsx`, POR MEDIÇÃO.** Aquela tela
 * está em **511** linhas pelo contador canônico do docblock dela e o teto do
 * projeto é 400 — ela já passou, e a regra 5 desta fatia diz que ela não pode
 * subir **uma** linha. Este módulo existe exatamente para isto: o docblock do
 * `acervo.tsx` até PREVIA o campo por escrito ("é aqui que o campo de busca da
 * Tarefa 29 entra"), previu o lugar e não previu o tamanho.
 *
 * ⚠️ **NÃO É UM `<form>`, e é decisão — a mesma da `/busca`:** não há "enviar".
 * O recorte é DERIVADO do que está no campo, a cada tecla, **no cliente**
 * (decisão A: nada aqui pergunta ao servidor, então não há debounce a pagar nem
 * espera a mostrar). Um `<form>` daria um submit por Enter que não teria o que
 * fazer, e no celular ainda fecharia o teclado.
 *
 * ⚠️ **`type="search"` E NÃO `type="text"`**: o papel é `searchbox`, o teclado
 * do celular mostra a tecla de busca, e o navegador dá o botão de limpar de
 * graça.
 *
 * ⚠️ **E O RÓTULO NÃO USA O `Field` DE `packages/ui`, ao contrário da
 * `/busca`.** O `Field` pinta o rótulo como rótulo de FORMULÁRIO
 * (`text-sm text-content`), e aqui ele fica encostado no rótulo do `<select>`
 * de leitura, que é `text-xs text-muted`. Dois rótulos irmãos com pesos
 * diferentes na mesma barra de filtros é a inconsistência que ninguém vê
 * olhando **um** dos dois. O que o `Field` entrega de verdade — `htmlFor`
 * ligado ao `id` — está escrito aqui do mesmo jeito que o `ReadingSelect` já o
 * escrevia, e o acusador é o `getByLabelText` da suíte, que só acha o controle
 * se a associação existir.
 *
 * ⚠️ **CONTROLADO, como os outros quatro** (decisão A da Tarefa 27): nada aqui
 * guarda estado, e quem decide se o campo EXISTE é a tela.
 */
export function TextFilter({ onText, t, text }: TextFilterProps): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-xs font-medium text-muted"
        htmlFor={TEXT_FILTER_ID}
      >
        {t('pages.acervo.filters.text.label')}
      </label>
      <input
        autoComplete="off"
        className={TEXT_INPUT_CLASS}
        id={TEXT_FILTER_ID}
        onChange={(event) => {
          onText(event.target.value);
        }}
        placeholder={t('pages.acervo.filters.text.placeholder')}
        type="search"
        value={text}
      />
    </div>
  );
}

/**
 * ⚠️ **OS `id` DAS DUAS PONTAS DA FAIXA — e são DOIS controles, não um.**
 *
 * Cada `<input>` tem o SEU rótulo visível e associado, pelo mesmo motivo do
 * `<select>` de leitura e do campo de texto. Ids fixos bastam porque a tela é
 * uma por rota.
 */
const PAGE_FROM_ID = 'acervo-page-from';
const PAGE_TO_ID = 'acervo-page-to';

interface PageBoundProps {
  id: string;
  label: string;
  value: string;
  onValue: (value: string) => void;
}

/**
 * UMA PONTA DA FAIXA — rótulo visível + `<input type="number">`.
 *
 * ⚠️ **AS DUAS PONTAS SÃO O MESMO CONTROLE ESCRITO UMA VEZ.** Escrevê-lo duas
 * vezes seria a forma exata pela qual a ponta de baixo e a de cima saem de
 * sincronia (o teto num e não no outro, o `inputMode` num e não no outro) — é a
 * lição do `authorLabel` da Tarefa 38g e da decisão G da 27, aplicada antes de
 * a segunda cópia existir.
 *
 * ⚠️ **O TETO É O `HIGHLIGHT_PAGE_MAX` DE `@clube/shared` (decisão F)** — o
 * contrato da coluna `Int?`, o mesmo que a borda do grifo aplica e o mesmo que
 * o `isValidPage` do `highlight-fields.tsx` já lê de lá. Um número escrito aqui
 * seria uma segunda verdade sobre a mesma coluna.
 *
 * ⚠️ **E O `min`/`max` DO `<input>` NÃO SÃO A REGRA — são a ajuda do
 * navegador.** Quem decide o que é um limite é o `boundOf` do
 * `acervo-entries.ts`, que tem unitário próprio: o `<input type="number">` já
 * entrega `''` para o que não consegue ler, e uma dimensão que dependesse disso
 * seria uma regra guardada pelo navegador.
 */
function PageBound({ id, label, onValue, value }: PageBoundProps): ReactNode {
  return (
    <div className="flex w-36 flex-col gap-1">
      <label className="text-xs font-medium text-muted" htmlFor={id}>
        {label}
      </label>
      <input
        autoComplete="off"
        className={TEXT_INPUT_CLASS}
        id={id}
        inputMode="numeric"
        max={HIGHLIGHT_PAGE_MAX}
        min={1}
        onChange={(event) => {
          onValue(event.target.value);
        }}
        type="number"
        value={value}
      />
    </div>
  );
}

export interface PageRangeFilterProps {
  t: TFunction;
  /** ⚠️ As duas pontas CRUAS. Quem normaliza é o `acervo-entries.ts`. */
  range: PageRange;
  onRange: (range: PageRange) => void;
}

/**
 * A SEXTA DIMENSÃO — A FAIXA DE PÁGINA (Tarefa 38h).
 *
 * ⚠️ **NENHUM `<fieldset>`, E A AUSÊNCIA É A MESMA REGRA DO `role="group"` DO
 * DOCBLOCK DO TOPO.** Um `<fieldset>` tem `role="group"` implícito: ele criaria
 * uma **quarta** fronteira acessível de grupo nesta tela, ao lado das três do
 * `FilterBar`, sem passar pelo componente que é o dono dela (decisão C da
 * Tarefa 27). Os dois rótulos se bastam — "Da página" e "Até a página" dizem
 * sozinhos o que cada campo recorta, e é por isso que o catálogo não tem um
 * terceiro texto por cima deles.
 *
 * ⚠️ **QUEM DECIDE SE ELE EXISTE É A TELA**, como o `ReadingSelect`: a faixa só
 * faz sentido quando o tipo pode incluir grifo (decisão C), e essa pergunta tem
 * **um** dono — o `typeCanIncludeHighlight` do `acervo-entries.ts`, que a tela
 * já chama para o grupo de cor. Um `if` aqui dentro seria um segundo dono da
 * regra de existência.
 *
 * ⚠️ **CONTROLADO, como os outros cinco** (decisão A da Tarefa 27): nada aqui
 * guarda estado, e as duas pontas viajam juntas — quem digita numa delas recebe
 * a faixa inteira de volta, que é o que impede "o de" e "o até" de virarem dois
 * estados que discordam.
 */
export function PageRangeFilter({
  onRange,
  range,
  t,
}: PageRangeFilterProps): ReactNode {
  return (
    <div className="flex flex-wrap gap-2">
      <PageBound
        id={PAGE_FROM_ID}
        label={t('pages.acervo.filters.page.from')}
        onValue={(from) => {
          onRange({ ...range, from });
        }}
        value={range.from}
      />
      <PageBound
        id={PAGE_TO_ID}
        label={t('pages.acervo.filters.page.to')}
        onValue={(to) => {
          onRange({ ...range, to });
        }}
        value={range.to}
      />
    </div>
  );
}

/** Só o que o `<select>` de leitura precisa do plano: o id e o tema do dia. */
export interface PlanDay {
  id: string;
  title: string;
}

/**
 * ⚠️ **O `id` DO `<select>`, e ele existe para o `<label>` poder apontar.**
 *
 * Decisão D: o rótulo é VISÍVEL e associado, nunca um `aria-label` solto — um
 * `aria-label` daria nome a quem OUVE a tela e deixaria quem VÊ sem saber o que
 * aquela caixa recorta. Um `id` fixo basta porque a tela é uma por rota.
 */
const READING_SELECT_ID = 'acervo-reading';

export interface ReadingSelectProps {
  t: TFunction;
  /** Na ordem do PLANO — a que o `getBookWithPlan` devolveu (por `order`). */
  readings: readonly PlanDay[];
  /** Já derivado pela tela: uma opção que existe (regra 12). */
  selected: string;
  onSelect: (value: string) => void;
}

/**
 * A DIMENSÃO LEITURA — um `<select>` NATIVO, e o motivo é MEDIDO (decisão D).
 *
 * O plano real tem **trinta** dias (é o que o `docs/COMO-TESTAR.md` §5.1 manda
 * gerar), e trinta chips num celular é um filtro que ninguém usa. `<select>`
 * nativo tem teclado e acessibilidade de graça, e `packages/ui` **não tem
 * `Select`** (medido) — um componente novo lá exigiria tokens, foco e teste
 * próprio, sem segundo chamador. Se um dia houver, ele se muda.
 *
 * ⚠️ **A CLASSE VEM DO `form-styles.ts`**, que é onde o app decidiu o visual de
 * campo — uma vez, num lugar. Escrever altura, borda e raio aqui seria a segunda
 * decisão visual sobre a mesma coisa, e é exatamente o que aquele arquivo existe
 * para não deixar acontecer.
 *
 * ⚠️ **QUEM DECIDE SE ELE EXISTE É A TELA**, não este componente: o plano pode
 * estar vazio e o tipo pode não carregar leitura (decisão E generalizada). Um
 * `if` aqui seria um segundo dono da regra de existência.
 */
export function ReadingSelect({
  onSelect,
  readings,
  selected,
  t,
}: ReadingSelectProps): ReactNode {
  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-xs font-medium text-muted"
        htmlFor={READING_SELECT_ID}
      >
        {t('pages.acervo.filters.reading.label')}
      </label>
      <select
        className={TEXT_INPUT_CLASS}
        id={READING_SELECT_ID}
        onChange={(event) => {
          onSelect(event.target.value);
        }}
        value={selected}
      >
        <option value={EVERY_READING}>
          {t('pages.acervo.filters.reading.all')}
        </option>
        {readings.map((day) => (
          <option key={day.id} value={day.id}>
            {day.title}
          </option>
        ))}
      </select>
    </div>
  );
}
