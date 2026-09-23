import { HIGHLIGHT_PAGE_MAX } from '@clube/shared';
import {
  cx,
  FilterBar,
  type FilterGroup,
  type FilterOption,
  FOCUS_RING,
  MarginRail,
  PersonAvatar,
  Sheet,
} from '@clube/ui';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { ActiveClubMe } from '../club/active-club';
import {
  ALL_SCOPE,
  authorScope,
  EVERY_COLOR,
  EVERY_PAGE,
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
 * ⚠️⚠️ **E NA TAREFA 46 ESTE MÓDULO VIROU O QUARTO MAIOR ARQUIVO DO APP, 65
 * ACIMA DO TETO DE 400 QUE O `acervo.tsx:140` NOMEIA — e ninguém perguntou.**
 * Achado M4 da rodada de correção. Medido pelo contador canônico, sobre os
 * arquivos de produção de `packages/app/src`:
 *
 * ```
 * free-note.tsx        602
 * day-note.tsx         478
 * acervo.tsx           478   ← a TELA, que a regra 12 da 46 protegia
 * acervo-filters.tsx   465   ← este, +81% numa fatia (257 → 465)
 * book-form.tsx        456
 * ```
 *
 * A regra 12 proibia a TELA de crescer, e ela encolheu 33. O vizinho absorveu
 * **+208** e a nota 9 da fatia celebrou o −33 sem uma palavra sobre isto. É a
 * lição da 44b na sua terceira cara: **extrair de um arquivo não encolhe o
 * outro, e um teto que vale para um arquivo só é um teto que anda de lado.**
 *
 * Este módulo tem **465** linhas canônicas (165 até a Tarefa 38g, 194 até a
 * 38h, 257 até a 46), e nenhuma delas é estado. A conta por função, medida com
 * o mesmo comando:
 *
 * ```
 *  65  activeChips()         ← o próximo corte
 *  56  filterGroups()
 *  48  RefineBand()          ← o próximo corte
 *  34  ReadingSelect()
 *  32  authorOptions()
 *  31  AcervoControls()
 *  26  PageRangeFilter()
 *  23  TextFilter()
 *  22  PageBound()
 *  17  FilterSheet()
 *   7  FilterMargin()
 * ```
 *
 * ⚠️ **O PRÓXIMO CORTE ESTÁ NOMEADO, E DE PROPÓSITO NÃO É AGORA: `activeChips`
 * + `RefineBand` + os dois tipos deles, ~125 linhas canônicas, para um
 * `acervo-band.tsx`.** Elas são o assunto mais separável que sobrou — a FAIXA,
 * que só existe abaixo de 1120px — e dependem de quatro coisas do resto:
 * `FilterGroup`, o `NEUTRAL_VALUE` lido do `acervo-entries.ts`, o `t` e o
 * pacote `AcervoControlsProps`. Cortar **agora** seria churn sobre uma fatia
 * já entregue e medida, então fica como **dívida endereçada à 47/48**, com o
 * endereço escrito aqui em vez de uma promessa genérica de "quando crescer".
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

/**
 * ⚠️ **OS SEIS CONTROLES NUM PACOTE SÓ (Tarefa 46) — e o pacote existe porque
 * agora eles têm DUAS CASAS.**
 *
 * Até aqui os controles moravam soltos no `collection()` do `acervo.tsx`. A
 * fatia 46 lhes dá dois hospedeiros — o bottom sheet do celular e a margem do
 * desktop —, e escrever a lista de controles duas vezes seria a forma exata
 * pela qual a leitura aparece num e não no outro (é a lição do `authorLabel` da
 * 38g e da decisão G da 27, de novo).
 *
 * ⚠️ **AS CONDIÇÕES DE EXISTÊNCIA VIAJARAM JUNTO, e continuam com UM dono.** O
 * `<select>` de leitura só existe com plano **e** `readingApplies`; a faixa de
 * página só existe com `highlightApplies`. Quem CALCULA os dois booleanos
 * continua sendo a tela (`typeCanCarryReading`/`typeCanIncludeHighlight` do
 * `acervo-entries.ts`) — recolher os controles num painel não pode transformar
 * "condicional" em "sempre visível", e é isso que o acusador de decisão G mede
 * nos dois sentidos.
 */
export interface AcervoControlsProps {
  t: TFunction;
  /** Já montados e já derivados pela tela (regra 12). */
  groups: readonly FilterGroup[];
  readings: readonly PlanDay[];
  selectedReading: string;
  onReading: (value: string) => void;
  /** Decisão E: o `<select>` só existe quando o tipo pode carregar leitura. */
  readingApplies: boolean;
  /** Decisão C da 38h: a cor e a faixa fazem a MESMA pergunta ao tipo. */
  highlightApplies: boolean;
  text: string;
  onText: (value: string) => void;
  range: PageRange;
  onRange: (range: PageRange) => void;
}

function AcervoControls({
  groups,
  highlightApplies,
  onRange,
  onReading,
  onText,
  range,
  readingApplies,
  readings,
  selectedReading,
  t,
  text,
}: AcervoControlsProps): ReactNode {
  return (
    <div className="flex flex-col gap-3">
      <FilterBar groups={groups} />

      <TextFilter onText={onText} t={t} text={text} />

      {readings.length === 0 || !readingApplies ? null : (
        <ReadingSelect
          onSelect={onReading}
          readings={readings}
          selected={selectedReading}
          t={t}
        />
      )}

      {highlightApplies ? (
        <PageRangeFilter onRange={onRange} range={range} t={t} />
      ) : null}
    </div>
  );
}

/**
 * A CASA DO DESKTOP — o painel na margem.
 *
 * ⚠️ **NÃO EXISTE `AcervoDesktop.dc.html`** (medido: os 21 artboards não o
 * têm). O desktop desta tela é DERIVADO do padrão que as fatias 42–45 fixaram —
 * coluna de 680px e margem de 320px com filete, acima de 1120px —, e é o mesmo
 * `MarginRail` do Início e da tela do dia.
 *
 * ⚠️ **E AQUI A MARGEM SOME NO CELULAR, ao contrário da home — de propósito, e
 * a assimetria é a fatia inteira.** Na home *"no celular nada desaparece"*: a
 * corrente e o feed descem para o fluxo, porque não há segunda casa para eles.
 * Aqui há: abaixo de 1120px os mesmos controles vivem no bottom sheet, e deixar
 * a margem descer para o fluxo daria DUAS cópias dos seis controles na mesma
 * tela — com `id` duplicado (`acervo-reading`, `acervo-text`,
 * `acervo-page-from`/`-to` são fixos), que é defeito de acessibilidade de
 * verdade e não incômodo de teste. O que guarda a outra metade é a faixa: ela é
 * o caminho até o painel, e some **só** acima do corte.
 *
 * ⚠️⚠️ **E O `hidden` DESTA LINHA COLIDE COM O `flex` QUE O `MarginRail` TRAZ
 * NA BASE — quem resolve é a ORDEM DE EMISSÃO DO CSS, não o `cx`.** Achado B5
 * da rodada de correção. O `cx` não é `tailwind-merge` (está escrito em
 * `packages/ui/src/cx.ts`, e é a mesma razão pela qual esta fatia recusou um
 * `border-y-0` no bloco recolhido): as três regras têm especificidade `0,1,0`
 * e `@media` não acrescenta nenhuma, então vence a última emitida. Isso
 * funciona, e agora está PINADO em vez de suposto — o acusador é
 * `src/__tests__/ui-source-scan.test.ts › the hidden × flex cascade`, que mede
 * os offsets no CSS compilado de verdade. Se a ordem invertesse, esta margem
 * ficaria `display:none` em toda largura e nenhum teste de DOM veria, porque o
 * `jsdom` não aplica media query.
 */
export function FilterMargin(props: AcervoControlsProps): ReactNode {
  return (
    <MarginRail className="hidden pt-4 min-[1120px]:flex">
      <AcervoControls {...props} />
    </MarginRail>
  );
}

export interface FilterSheetProps extends AcervoControlsProps {
  open: boolean;
  onClose: () => void;
}

/**
 * A CASA DO CELULAR — o bottom sheet da Tarefa 41a.
 *
 * ⚠️ **O CONTEÚDO DESTE PAINEL É LACUNA PREENCHIDA, NÃO FIDELIDADE.** Medido:
 * `grep -in "refinar"` nos 21 artboards devolve **uma** linha — o BOTÃO
 * (`Acervo.dc.html:61`). O que ele abre não é desenhado em lugar nenhum, e a
 * escolha de pôr os seis controles inteiros aqui é decisão desta fatia.
 *
 * ⚠️ **O `Sheet` FECHADO NÃO ESTÁ NO DOM** (regra 15 da Tarefa 13), e é isso
 * que faz a invariante de UMA CÓPIA se sustentar sem um segundo booleano: com o
 * painel aberto a tela deixa de montar a margem, com ele fechado a margem
 * volta, e em nenhum instante os dois existem.
 */
export function FilterSheet({
  onClose,
  open,
  ...controls
}: FilterSheetProps): ReactNode {
  const { t } = controls;

  return (
    <Sheet
      closeLabel={t('pages.acervo.filters.close')}
      onClose={onClose}
      open={open}
      title={t('pages.acervo.filters.refine')}
    >
      <AcervoControls {...controls} />
    </Sheet>
  );
}

/** Uma dimensão ESCOLHIDA, pronta para virar chip removível. */
export interface ActiveChip {
  /** A `key` do React, e o nome da dimensão. Não aparece na tela. */
  id: string;
  /** JÁ TRADUZIDO — o mesmo rótulo que o controle daquela dimensão mostra. */
  label: string;
  onRemove: () => void;
}

/**
 * ⚠️ **O NEUTRO DAS TRÊS DIMENSÕES DE CHIP É A MESMA STRING**, e isso é fato
 * medido do `acervo-entries.ts`: `ALL_SCOPE`, `EVERY_TYPE` e `EVERY_COLOR`
 * valem todos `'all'`. Ele é lido de UMA delas em vez de escrito aqui, para o
 * dia em que um deles mudar ficar vermelho em vez de silencioso.
 */
const NEUTRAL_VALUE = ALL_SCOPE;

/**
 * OS CHIPS ATIVOS — **um por dimensão escolhida**, e nenhum no estado neutro
 * (decisão H da Tarefa 46).
 *
 * ⚠️ **REMOVER UM CHIP MEXE SÓ NA DIMENSÃO DELE.** O `onRemove` das três
 * primeiras é o `onSelect` do próprio grupo com a opção NEUTRA — não um setter
 * novo —, e é isso que faz o chip de TIPO descartar as três escolhas
 * condicionais exatamente como o toque no chip "Tudo" já descarta (o `onType`
 * do `acervo.tsx` continua sendo o dono único daquela regra).
 *
 * ⚠️ **A FAIXA DE PÁGINA É **UM** CHIP, e não dois:** "de" e "até" são as duas
 * metades da mesma pergunta e vivem num estado só (`PageRange`), então dois
 * chips dariam dois botões para desfazer meia faixa — e meia faixa é uma faixa
 * válida, que o `boundOf` já sabe ler.
 *
 * ⚠️ **E O RÓTULO DELA É MONTADO DOS RÓTULOS QUE JÁ EXISTEM** ("Da página 10 ·
 * Até a página 90"), em vez de uma chave nova com `{{from}}`/`{{to}}`: as duas
 * pontas são OPCIONAIS (decisão D da 38h), então uma frase fechada precisaria de
 * três chaves para os três casos — e três frases para a mesma faixa é como duas
 * delas saem de sincronia. O canvas escreve `p. 120–160` (`Acervo.dc.html:70`);
 * a divergência está declarada nas notas da fatia.
 */
export function activeChips({
  groups,
  onRange,
  onReading,
  onText,
  range,
  readings,
  selectedReading,
  t,
  text,
}: AcervoControlsProps): ActiveChip[] {
  const chips: ActiveChip[] = [];

  for (const group of groups) {
    const neutral = group.options.find(
      (option) => option.value === NEUTRAL_VALUE,
    );
    const chosen = group.options.find(
      (option) => option.value === group.selected,
    );
    /*
      Um grupo sem neutro, ou com um `selected` que não está nas opções, não
      vira chip: a regra 12 já devolve o grupo ao neutro no render seguinte, e
      um chip com o rótulo `undefined` seria um "· undefined ·" na cara de quem
      está lendo — o mesmo cuidado que o `summaryOf` de `packages/ui` toma.
    */
    if (neutral === undefined || chosen === undefined) continue;
    if (chosen.value === neutral.value) continue;

    chips.push({
      id: group.id,
      label: chosen.label,
      onRemove: () => {
        group.onSelect(neutral);
      },
    });
  }

  const day = readings.find((reading) => reading.id === selectedReading);
  if (day !== undefined) {
    chips.push({
      id: 'reading',
      label: day.title,
      onRemove: () => {
        onReading(EVERY_READING);
      },
    });
  }

  if (text !== '') {
    chips.push({
      id: 'text',
      label: text,
      onRemove: () => {
        onText('');
      },
    });
  }

  const bounds = [
    range.from === ''
      ? null
      : `${t('pages.acervo.filters.page.from')} ${range.from}`,
    range.to === '' ? null : `${t('pages.acervo.filters.page.to')} ${range.to}`,
  ].filter((bound): bound is string => bound !== null);

  if (bounds.length > 0) {
    chips.push({
      id: 'page',
      label: bounds.join(' · '),
      onRemove: () => {
        onRange(EVERY_PAGE);
      },
    });
  }

  return chips;
}

export interface RefineBandProps {
  t: TFunction;
  groups: readonly FilterGroup[];
  chips: readonly ActiveChip[];
  onRefine: () => void;
}

/**
 * A FAIXA DO CELULAR — a linha de resumo, o "Refinar" e os chips removíveis.
 *
 * `Acervo.dc.html:56` é a faixa (filete em cima e embaixo, `padding:12px 0`,
 * `gap:9px`), `:58` a linha de resumo, `:59-62` o botão e `:64-73` a fila de
 * chips.
 *
 * ⚠️ **O FILETE É DO `FilterBar` RECOLHIDO, e por isso os chips ficam ABAIXO
 * dele e não dentro da moldura.** O bloco recolhido da Tarefa 41a já carrega o
 * `border-y border-line-soft py-3` do `:56` na própria linha do `:57`; pôr os
 * chips dentro da mesma moldura exigiria ou uma segunda decisão de borda aqui
 * (duas verdades sobre o mesmo filete) ou passar `border-y-0` pelo `className`
 * — e o `cx` **não resolve conflito de utilitário**, por decisão escrita
 * (`packages/ui/src/cx.ts`): quem venceria seria a ordem do CSS emitido, não a
 * ordem daqui. A divergência está declarada nas notas da fatia.
 *
 * ⚠️ **ELA SOME SÓ ACIMA DE 1120px.** Abaixo do corte ela é o ÚNICO caminho até
 * os seis controles; acima, eles estão na margem e a faixa seria um segundo
 * caminho para o mesmo lugar. `min-[1120px]:hidden` escrito por extenso — o
 * Tailwind só emite o que está literal no fonte (decisão G do MVP 3.5).
 *
 * ⚠️ **E ISSO QUER DIZER QUE NO DESKTOP NÃO HÁ LINHA DE RESUMO NEM CHIP
 * REMOVÍVEL — a Definição de pronto promete os três SEM QUALIFICAR, e a frase
 * faltava.** Achado B4 da rodada de correção. Acima de 1120px a faixa inteira
 * some junto com o "Refinar", e o que resta são os seis controles abertos na
 * margem: lá o resumo seria uma paráfrase do que já está visível logo ao lado,
 * e o chip removível, um segundo botão para o mesmo gesto que o próprio
 * controle faz (voltar ao neutro). É escolha, não esquecimento — mas quem ler
 * só a Definição de pronto vai procurar os chips no desktop e não achar.
 *
 * ⚠️ **O `gap-[9px]` É O VALOR DO CANVAS, e não bate com escala nenhuma do
 * repo — declarado, que é o que faltava (achado B3).** `Acervo.dc.html:56`
 * desenha `gap:9px`. Os sete `--size-*` de `theme.css` (9.5 · 10 · 11 · 14 ·
 * 15 · 17.5 · 25) são **tamanho de fonte**, não espaçamento, então não há com
 * o que comparar — e valor arbitrário de espaçamento já é prática medida aqui
 * (`gap-[26px]` no `book.tsx` e no `day-note.tsx`, e a altura arbitrária do
 * `context-bar.tsx`, existem no repo pelo mesmo motivo). O valor fica; o que
 * estava errado era não dizer de onde ele vem.
 *
 * ⚠️ **E ESTE PARÁGRAFO CUSTOU 24 BYTES DE CSS ATÉ SER REESCRITO, o que é uma
 * medição sobre o Tailwind que vale mais que o parágrafo:** o scanner do
 * Tailwind v4 lê o **texto bruto do arquivo**, comentário incluído. Citar a
 * altura do `context-bar.tsx` na forma NUA fez o build emitir a classe — que
 * no código existe só com a variante de 1120px. Quem escrever prosa sobre
 * classes neste repo cita a forma com variante, ou mede o CSS depois.
 */
export function RefineBand({
  chips,
  groups,
  onRefine,
  t,
}: RefineBandProps): ReactNode {
  return (
    <div
      className="flex flex-col gap-[9px] min-[1120px]:hidden"
      data-acervo-band=""
    >
      <FilterBar
        collapsed
        groups={groups}
        onRefine={onRefine}
        refineLabel={t('pages.acervo.filters.refine')}
      />

      {chips.length === 0 ? null : (
        <div className="flex flex-wrap gap-1.5 pb-3">
          {chips.map((chip) => (
            <span
              className="inline-flex h-[30px] items-center gap-2 rounded-pill border border-line bg-surface-raised px-2.5 text-xs text-content"
              data-acervo-chip=""
              key={chip.id}
            >
              {chip.label}
              <button
                /*
                  ⚠️ **O NOME ACESSÍVEL CARREGA O RÓTULO.** Seis chips na mesma
                  faixa com o nome "Remover" seriam a mesma palavra para seis
                  gestos, e quem ouve a tela não saberia qual é qual.
                */
                aria-label={t('pages.acervo.filters.remove', {
                  label: chip.label,
                })}
                className={cx(
                  'relative flex size-4 shrink-0 items-center justify-center rounded-full text-muted hover:text-content',
                  /*
                    ⚠️ **O ALVO DE TOQUE É 44px, e o desenho é 30px** — a faixa
                    do canvas tem `height:30px` (`Acervo.dc.html:65`) e a
                    decisão fechada do MVP 3.5 fixa o alvo em ≥44px. O
                    pseudoelemento resolve os dois sem mentir sobre nenhum: 16px
                    de botão mais 14px de cada lado dão 44px de área clicável,
                    e nada disso pinta um pixel.
                  */
                  "after:absolute after:-inset-3.5 after:content-['']",
                  FOCUS_RING,
                )}
                onClick={chip.onRemove}
                type="button"
              >
                {/* `lucide-react` (`CLAUDE.md`): `<svg>` inline em
                    `packages/app/src` é proibido por teste, porque a varredura
                    do ADR 0002 pega PALAVRA e desenho não tem palavra. */}
                <X aria-hidden="true" className="size-3.5" focusable="false" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
