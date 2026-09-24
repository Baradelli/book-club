import { HIGHLIGHT_PAGE_MAX, type HighlightResponse } from '@clube/shared';
import { cx, Eyebrow, Field, FOCUS_RING, type PenKey } from '@clube/ui';
import { lazy, Suspense, useId } from 'react';
import { useTranslation } from 'react-i18next';

import { TEXT_INPUT_CLASS } from './form-styles';
import {
  COLOR_LABEL_KEYS,
  COLOR_PEN_KEYS,
  HIGHLIGHT_COLORS,
  type HighlightColor,
  PEN_DOT_CLASS,
} from './highlight-colors';

/**
 * OS CAMPOS DO GRIFO — o que os dois modos do formulário dividem.
 *
 * ⚠️ **A DIVISÃO É FEITA ANTES DE A TELA CRESCER, e é o precedente exato da
 * decisão B da Tarefa 20** (`book-form.tsx` + `plan-editor.tsx`). Medido pelo
 * comando que o docblock de `highlights.tsx` fixa: com tudo num arquivo, o
 * `highlight-form.tsx` daria **618 linhas de código** — mais que o
 * `free-note.tsx` (**565**), que a Tarefa 19 já havia registrado como "o
 * próximo lugar onde a complexidade morde", e mais que qualquer tela do app.
 * Divididos, eram **423 + 189**. Entregar a maior tela do projeto com um recado
 * no relatório dizendo "devia ser dividida" é o contrário da lição nº 8 do
 * MVP 1.
 *
 * ⚠️ **ESTE ARQUIVO É O QUE RECEBEU O CRESCIMENTO DA TAREFA 47a: 189 → 304, e
 * 309 depois da rodada de correção dela**
 * (contador canônico do docblock de `acervo.tsx`). O `highlight-form.tsx`
 * ficou nos **427** que já tinha, e isso foi escolha: ele está 27 acima do teto
 * de 400, e a fatia que "cabe" empurrando o crescimento para o vizinho sem
 * registrar é como um teto para de existir sem ninguém decidir. Fica
 * registrado aqui, no arquivo que recebeu, e não só no relatório — é a lição
 * medida da Tarefa 46, onde uma tela encolheu 33 e a vizinha absorveu 208 sem
 * uma linha de comentário em lugar nenhum.
 *
 * O que fica no `highlight-form.tsx`: as duas TELAS (registrar e corrigir), o
 * editor `lazy` e os corpos das requisições — ou seja, tudo o que fala com a
 * API. O que mora aqui: os campos, a paleta e o que a tela recusa antes de
 * enviar. Este módulo **não conhece a API nem o roteador**.
 */

/** O que o editor emite para um documento vazio. */
export const EMPTY_DOC: Record<string, unknown> = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const EMPTY_DOC_JSON = JSON.stringify(EMPTY_DOC);

/**
 * ⚠️ **"NÃO HÁ COMENTÁRIO" É UMA PROPRIEDADE DO DOCUMENTO, NÃO DO EVENTO**
 * (regra 16).
 *
 * O editor sempre tem um documento — o parágrafo em branco —, então uma guarda
 * escrita como "o editor emitiu `onChange`?" trataria "abri e apaguei tudo"
 * como um comentário de verdade. O que se grava é `null`, e o backend deriva
 * `commentText: ''` dele (ADR 0001); um documento em branco gravado como
 * comentário faria a coleção renderizar uma área de comentário VAZIA, que é o
 * defeito que a regra 6 proíbe.
 *
 * `null` = não há comentário · objeto = há.
 */
export function commentOf(
  doc: Record<string, unknown> | undefined,
): Record<string, unknown> | null {
  if (doc === undefined) return null;
  return JSON.stringify(doc) === EMPTY_DOC_JSON ? null : doc;
}

/** O que a pessoa digitou — tudo `string`, porque é o que um `<input>` entrega. */
export interface Draft {
  quote: string;
  page: string;
  reference: string;
}

export const EMPTY_DRAFT: Draft = { quote: '', page: '', reference: '' };

export function draftOf(highlight: HighlightResponse): Draft {
  return {
    quote: highlight.quote,
    // `null` é campo em BRANCO, nunca a palavra "null" no `<input>`.
    page: highlight.page === null ? '' : String(highlight.page),
    reference: highlight.reference ?? '',
  };
}

/**
 * REGRA 14 — o que a tela recusa na PÁGINA, antes de enviar.
 *
 * ⚠️ **É a borda repetida de propósito, e a razão é medida.** Na Tarefa 24: o
 * Prisma **trunca** a fração (`page: 45.5` chega ao SQL como `45`) e é o
 * `.int()` da borda que responde 400; fora do int32 ele **lança**, e é o
 * `.max()` que responde 400. Nos dois casos quem escreveu descobriria o
 * problema por uma mensagem do Zod **em inglês**, sem lugar na tela para
 * mostrá-la (§6.2) — e depois de uma ida à rede.
 *
 * O teto vem de `HIGHLIGHT_PAGE_MAX`, de `@clube/shared`: é o contrato da
 * coluna `Int?`, não um número escolhido aqui. Uma segunda constante seria uma
 * segunda dona da mesma regra.
 */
export function isValidPage(value: string): boolean {
  if (!/^\d+$/u.test(value)) return false;
  const page = Number(value);
  return page >= 1 && page <= HIGHLIGHT_PAGE_MAX;
}

/** REGRA 15 — campo opcional em branco é AUSÊNCIA, nem `''`. */
export function textOrAbsent(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * ============================================================================
 * AS TRÊS PINTURAS DE CADA CANETA (Tarefa 47a, decisão A)
 * ============================================================================
 *
 * ⚠️ **MAPAS LITERAIS, NUNCA MONTADOS A PARTIR DA CHAVE** — a decisão C da
 * Tarefa 41b, e ela é a mais tentadora justamente aqui: são quinze linhas que
 * "só mudam uma letra". A interpolação compila, roda, põe a classe certa no DOM
 * e deixa todo teste de render verde; o que ela **não** faz é gerar CSS, porque
 * o Tailwind emite o CSS das classes que encontra **escritas** no código-fonte.
 * O sintoma seria um papel sem cor nenhuma, na tela, em produção — medido na
 * 41b, onde o mesmo atalho apagou dez seletores sem um vermelho.
 *
 * ⚠️ **SÃO TRÊS MAPAS E NÃO UM, e a razão é que os três destinos DIFEREM:** o
 * preenchimento do papel é o par claro da caneta; o filete do papel e a aspa
 * pendurada são o par escuro (o mesmo que a bolinha usa). E a pílula
 * selecionada quer só o preenchimento — juntá-los num mapa só a faria receber
 * também um filete de caneta, que brigaria com o filete dourado do escolhido.
 *
 * ⚠️ **OS CINCO HEXES NÃO ENTRAM AQUI, e é o ponto inteiro.**
 * `HIGHLIGHT_COLORS` é dado persistido (coluna, filtro de rota e índice); quem
 * traduz hex → caneta é `highlight-colors.tsx`. Daqui para baixo só existe
 * caneta.
 */
const PEN_FILL_CLASS: Readonly<Record<PenKey, string>> = {
  a: 'bg-pen-a',
  v: 'bg-pen-v',
  l: 'bg-pen-l',
  z: 'bg-pen-z',
  r: 'bg-pen-r',
};

const PEN_EDGE_CLASS: Readonly<Record<PenKey, string>> = {
  a: 'border-pen-a-dot',
  v: 'border-pen-v-dot',
  l: 'border-pen-l-dot',
  z: 'border-pen-z-dot',
  r: 'border-pen-r-dot',
};

const PEN_INK_CLASS: Readonly<Record<PenKey, string>> = {
  a: 'text-pen-a-dot',
  v: 'text-pen-v-dot',
  l: 'text-pen-l-dot',
  z: 'text-pen-z-dot',
  r: 'text-pen-r-dot',
};

/**
 * ⚠️ **O PAPEL ANTES DE HAVER CANETA — o estado que o canvas não desenha.**
 *
 * Os dois artboards mostram a tela já com a caneta amarela escolhida, mas o
 * registro **começa sem cor** (ela é obrigatória, regra 13). Pintar o papel de
 * amarelo enquanto ninguém escolheu amarelo seria mentir sobre o que vai ser
 * gravado — e seria a mesma classe de defeito do `aria-invalid="false"` num
 * campo intocado. Sem caneta, o campo é superfície e filete.
 *
 * ⚠️ **A TINTA DA ASPA SEM CANETA É O CINZA MÉDIO, E NÃO O MAIS CLARO** — o
 * mais claro reprova 4,5:1 nos dois temas (2,45 e 2,58) e tem guarda própria
 * em `__tests__/theme-tokens.test.ts`, que recusa o PRIMEIRO uso dele. A aspa é
 * decorativa, então o piso de texto não a alcançaria; mas a guarda é de USO do
 * utilitário, não de papel semântico, e contorná-la com uma isenção seria
 * abrir a porta que ela existe para manter fechada.
 */
const NO_PEN_FILL_CLASS = 'bg-surface';
const NO_PEN_EDGE_CLASS = 'border-line';
const NO_PEN_INK_CLASS = 'text-subtle';

/**
 * ⚠️ **O FILETE VERMELHO DO ERRO — o que a Tarefa 47a tinha PERDIDO.**
 *
 * Até esta fatia o campo do trecho era um `TEXT_INPUT_CLASS`, e aquela
 * constante traz a borda vermelha do campo inválido. Ao virar papel, o campo
 * saiu do estilo compartilhado e o vermelho foi junto: sobrava a mensagem
 * abaixo e mais nada, enquanto o campo de PÁGINA da mesma tela continuava
 * acendendo a borda. Um campo em erro indistinguível de um campo em repouso é
 * metade do erro faltando, e a assimetria dentro da MESMA tela é o que torna
 * isso um defeito e não uma escolha.
 *
 * ⚠️ **E AQUI ELE VEM DA PROP, NÃO DO ATRIBUTO — de propósito.** O
 * `form-styles.ts` acende a borda pela variante de atributo porque é uma
 * CONSTANTE compartilhada: ela não enxerga estado nenhum, e quem põe o
 * atributo no controle é o `Field`. Este componente já é o dono do `error` e
 * já decide por ele três vezes (a descrição, o atributo e a mensagem), então a
 * quarta sai da mesma fonte — duas donas da mesma regra é o que aquele padrão
 * existe para evitar, e aqui só há uma. O que se ganha é o §7.9: a
 * propriedade vira **decidível em jsdom**, porque é o render que muda, e não
 * uma regra de CSS que o jsdom não avalia.
 *
 * ⚠️ **ELE SUBSTITUI o filete da caneta, não se soma a ele.** Dois utilitários
 * de cor de borda na mesma lista deixariam a ORDEM DE EMISSÃO do CSS decidir
 * qual vence — exatamente a invariante que a auditoria da Tarefa 46 teve de
 * pinar à mão. O fundo do papel não muda: o erro pinta a fronteira, não a cor
 * do que a pessoa escreveu.
 */
const ERROR_EDGE_CLASS = 'border-danger';

/**
 * REGRA 13 — AS CINCO CANETAS, com estado ativo ACESSÍVEL.
 *
 * A cor é obrigatória e vem de `HIGHLIGHT_COLORS` (`@clube/shared`): a tela não
 * inventa cor nem grafia — o valor gravado é o hex minúsculo, e o `=` de texto
 * do Postgres é byte-sensível.
 *
 * ⚠️ E o estado ativo **não é só a cor** — ele é três coisas: `aria-pressed`,
 * que o leitor de tela anuncia; o NOME da cor, em texto, ao lado da bolinha; e
 * a **espessura** do filete, que é a única das três que sobrevive num monitor
 * em escala de cinza. É a mesma regra que o `PresenceMark` cumpre na Tarefa 44
 * e o `StreakSeal` na 45.
 *
 * ⚠️ **ELA NÃO É UM `FilterChip`, e a decisão é medida.** O docblock daquele
 * componente previa que esta fatia o pintasse pelo `className` da opção; com o
 * `diff` na mão, o estado pressionado dele precisaria de **quatro**
 * sobreposições (o preenchimento, a cor do filete, a espessura do filete e a
 * cor do texto), e o `cx` **não resolve conflito de utilitário** — quem
 * venceria seria a ordem de emissão do CSS, que é exatamente a invariante que a
 * auditoria da Tarefa 46 teve de pinar à mão depois de descobri-la sem guarda
 * nenhuma. Medido no CSS compilado desta entrada: a regra do preenchimento da
 * caneta sai 366 bytes depois da regra do preenchimento de ação — ou seja, hoje
 * daria certo, e por um motivo que ninguém declarou.
 *
 * O `FilterChip` continua com o consumidor dele (o `FilterBar`), e o estado
 * "escolhido" **genérico** dele continua sendo o certo para as dimensões que
 * não têm cor própria. Esta tem.
 */
function PenPill({
  label,
  onPress,
  pen,
  pressed,
}: {
  label: string;
  pen: PenKey;
  pressed: boolean;
  onPress: () => void;
}) {
  return (
    /*
      `<button>` NATIVO (regra 26 da Tarefa 27): é a plataforma que dá Enter e
      Espaço de graça, e Espaço é a tecla de quem usa leitor de tela.

      `min-h-11` é o piso de 44px — o mesmo que o canvas desenha para esta
      pílula, sem divergência nenhuma.
    */
    <button
      aria-pressed={pressed}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition-colors',
        pressed
          ? cx('border-[1.5px] border-gold text-content', PEN_FILL_CLASS[pen])
          : 'border border-line bg-transparent text-muted hover:border-line-strong hover:text-content',
        FOCUS_RING,
      )}
      onClick={onPress}
      type="button"
    >
      {/*
        `aria-hidden` de propósito: o NOME da cor está escrito ao lado, e um
        rótulo igual faria o leitor de tela dizer a cor duas vezes — o mesmo
        cuidado do `ColorSwatch`, que continua sendo a amostra das telas de
        leitura (acervo, busca, margem).
      */}
      <span
        aria-hidden="true"
        className={cx('size-3 shrink-0 rounded-full', PEN_DOT_CLASS[pen])}
      />
      {label}
    </button>
  );
}

export function ColorField({
  error,
  onPick,
  value,
}: {
  value: HighlightColor | null;
  error: string | undefined;
  onPick: (color: HighlightColor) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2.5">
      {/*
        ⚠️ **A LEGENDA É NEUTRA, E ISSO É O CONTRÁRIO DO RÓTULO DO PAPEL
        (decisão D).** São duas tintas de propósito: a dourada marca **o campo
        que é o papel**, e uniformizar as duas é o erro fácil — a tela perde o
        que distingue o campo principal. O acusador tem os dois sentidos.

        `Eyebrow` sem `tone` é o neutro, que é o valor padrão dele: rótulo que
        só NOMEIA uma seção. O dourado é o que é de hoje ou o que está sendo
        criado agora — e o docblock do componente nomeia "Trecho grifado" como
        o exemplo dele.
      */}
      <Eyebrow>{t('pages.highlightForm.fields.color')}</Eyebrow>
      <div
        aria-label={t('pages.highlightForm.fields.colorGroup')}
        className="flex flex-wrap items-center gap-2"
        role="group"
      >
        {/* A ordem é a de `@clube/shared` — a mesma da barra do editor. */}
        {HIGHLIGHT_COLORS.map((candidate) => (
          <PenPill
            key={candidate}
            label={t(COLOR_LABEL_KEYS[candidate])}
            onPress={() => {
              onPick(candidate);
            }}
            pen={COLOR_PEN_KEYS[candidate]}
            pressed={value === candidate}
          />
        ))}
      </div>
      {error !== undefined ? (
        <p className="text-sm text-danger">{error}</p>
      ) : null}
    </div>
  );
}

/**
 * ============================================================================
 * ⚠️⚠️ O CAMPO DO TRECHO **É** O PAPEL GRIFADO (Tarefa 47a, decisão A)
 * ============================================================================
 *
 * É o coração da fatia: o trecho não é digitado numa caixa branca e depois
 * grifado em outro lugar — ele nasce **sobre** o papel da caneta escolhida, e o
 * papel **repinta** nos três elementos quando a caneta muda.
 *
 * ⚠️ **ELE NÃO USA O `Field`, e não é descuido.** O `Field` põe o rótulo em
 * mono neutra e a dica **abaixo** do controle; aqui o rótulo é dourado e a dica
 * fica na mesma linha, alinhada pela base, à direita. São duas decisões de
 * desenho do canvas que o `Field` não expõe por prop — e crescer o `Field` com
 * duas props de variante para **um** chamador seria especulação paga por todas
 * as outras telas. A fiação de acessibilidade é a mesma do `Field`, refeita
 * aqui à mão: `htmlFor` ↔ `id`, `aria-describedby` na ordem dica→erro (o
 * precedente do GOV.UK), e `aria-invalid` só quando há erro.
 *
 * ⚠️ **E ELE NÃO É O `GrifoText`. Medido, e as duas coisas só compartilham o
 * nome da caneta:** o `GrifoText` é um `<span>` **em linha**, com auréola de 2px
 * (um anel, não uma borda), raio de 2px e **sem filete nenhum**, e a razão de
 * existir dele é alargar a marca para fora da caixa do texto, como caneta de
 * verdade. Ele tem
 * um consumidor, `margin-highlight.tsx:102`, e lá o trecho é **somente
 * leitura**. Aqui o papel é um **bloco** com filete de 1px na cor escura da
 * caneta, raio de 3px, recuo de 34px à esquerda para a aspa caber, e um
 * `<textarea>` dentro. Reusar o componente exigiria três props novas
 * (`as`, `ring`, `border`) para um segundo chamador que não quer nada do que
 * ele faz. São dois desenhos, não duas instâncias de um.
 *
 * ⚠️⚠️ **CORREÇÃO MEDIDA (rodada de correção da 47a): "zero propriedades em
 * comum" ERA FALSO, e a propriedade em comum é a central.** O mapa de canetas
 * do `GrifoText` começa pelo MESMO utilitário de preenchimento que o
 * `PEN_FILL_CLASS` daqui — o par claro de cada caneta, literal, duplicado em
 * dois pacotes. O que o parágrafo acima mede de verdade é o **componente**, e
 * essa conclusão continua de pé; o que ele não mediu foi o **mapa**.
 *
 * **Medido agora, e decidido com o número:** o projeto tem **cinco** mapas
 * literais de caneta em produção (o preenchimento e o anel juntos, no
 * `GrifoText`; o preenchimento, o filete e a tinta da aspa, aqui; e a bolinha,
 * em `highlight-colors.tsx`), e a superfície REALMENTE duplicada entre eles é
 * de **cinco nomes de classe** — só o preenchimento. **Escolhido: não
 * extrair**, por três medições:
 *
 * 1. o motivo de um mapa literal existir é o scanner do Tailwind, e ele já é
 *    satisfeito nos dois lugares de forma independente — extrair não emite um
 *    seletor a mais nem a menos;
 * 2. o `GrifoText` guarda preenchimento e anel como UM par (o acusador dele
 *    compara igualdade entre as duas metades da mesma string). Partir a string
 *    para importar metade dela **enfraquece** aquela guarda, que é o oposto do
 *    que a extração deveria comprar;
 * 3. um rename de utilitário — o único risco que a duplicação cria — não passa
 *    em silêncio: a bijeção token↔utilitário tem guarda própria em
 *    `__tests__/theme-tokens.test.ts`, e ela acusa dos dois lados.
 *
 * Fica registrado para a Tarefa 48 reabrir **se** aparecer um sexto mapa: três
 * donos do mesmo par é onde o §7.1 manda extrair em vez de cobrir de novo.
 *
 * ⚠️ **A ASPA É O CARACTERE, NÃO UM ÍCONE** (decisão B). `<svg>` inline é
 * proibido em toda tela do app (`adr-0002-iconography.test.ts`), e ela é
 * **decoração**: `aria-hidden`, porque o rótulo e o texto ao lado já dizem tudo
 * e uma aspa anunciada viraria ruído antes de cada trecho.
 *
 * ⚠️ **AS DUAS DIVERGÊNCIAS DE ESCALA, DECLARADAS** (o `theme.css` fecha a
 * escala em sete degraus):
 *
 * - o trecho tem **dezessete** pixels no canvas e sai em `text-reading`, que é
 *   o degrau de leitura de 17,5px — meio pixel, e a Tarefa 43 já mediu que este
 *   é o degrau daquele texto;
 * - a aspa tem **quarenta** pixels, que não é degrau nenhum e nem poderia ser:
 *   a escala vai até 25px, e um oitavo degrau para um glifo decorativo de um
 *   lugar só entraria também na lista fechada de isenções do `light-dark()`.
 *   Ela sai em valor arbitrário, como as três da lombada do `BookSpine`.
 *
 * ⚠️ **E A ALTURA MÍNIMA DO PAPEL NÃO É ESCRITA, ELA É CONSEQUÊNCIA.** O canvas
 * declara 150px de mínimo no papel e 114px de altura no `<textarea>`, com 18px
 * de folga em cima e embaixo — 114 + 18 + 18 = 150. Escrever os dois números
 * seria dar dois donos à mesma medida, e o segundo envelheceria sozinho na
 * primeira vez que alguém mexesse no recuo.
 */
function QuoteField({
  error,
  onChange,
  pen,
  value,
}: {
  value: string;
  pen: PenKey | null;
  error: string | undefined;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const generated = useId();
  const controlId = `${generated}-quote`;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        {/*
          ⚠️ **O DOURADO É `--gold-strong`, E NÃO O `--gold` QUE O CANVAS
          ESCREVE — a diferença é uma conta, e ela já tem dois donos.** `--gold`
          no tema claro dá 4,16 / 4,31 / 3,97 contra as três superfícies, e este
          rótulo tem 10px: o piso é 4,5:1 e ele reprova nas três. Quem carrega a
          conta é o `Eyebrow` (o mapa de tom dele), e quem recusa o primeiro uso
          textual do tom fraco é `__tests__/theme-tokens.test.ts` — que ficou
          **vermelho nesta fatia**, com o rótulo escrito à mão, antes de o
          componente entrar no lugar dele.

          O `<label>` fica por FORA: o `Eyebrow` é a tipografia do rótulo, não a
          semântica dele (ele é um `<span>` de propósito), e é o `htmlFor` que
          faz clicar no rótulo focar o papel.
        */}
        <label htmlFor={controlId}>
          <Eyebrow tone="gold">{t('pages.highlightForm.fields.quote')}</Eyebrow>
        </label>
        <span className="text-label text-muted" id={hintId}>
          {t('pages.highlightForm.fields.quoteHint')}
        </span>
      </div>
      <div
        className={cx(
          /*
            ⚠️ O `border` NU É A LARGURA, e ele não é decoração de escrita: sem
            ele a borda vai a ZERO e o filete da linha seguinte não pinta nada.
            Um mutante que o apagou sobreviveu a 975 testes na primeira entrega
            desta fatia, porque a guarda afirmava a COR e não a largura.

            ⚠️ E O RECUO É ASSIMÉTRICO DE PROPÓSITO: a aspa é posicionada em
            absoluto e não empurra o texto, então os 34px da esquerda são a
            única coisa que impede o trecho de começar debaixo dela.
          */
          'relative rounded-callout border py-[18px] pr-[18px] pl-[34px]',
          pen === null ? NO_PEN_FILL_CLASS : PEN_FILL_CLASS[pen],
          error !== undefined
            ? ERROR_EDGE_CLASS
            : pen === null
              ? NO_PEN_EDGE_CLASS
              : PEN_EDGE_CLASS[pen],
        )}
      >
        <span
          aria-hidden="true"
          className={cx(
            'absolute left-2.5 top-2 font-quote text-[40px] leading-none',
            pen === null ? NO_PEN_INK_CLASS : PEN_INK_CLASS[pen],
          )}
        >
          {'“'}
        </span>
        <textarea
          aria-describedby={
            error === undefined ? hintId : `${hintId} ${errorId}`
          }
          aria-invalid={error !== undefined ? true : undefined}
          className={cx(
            'min-h-[114px] w-full resize-none bg-transparent font-reading text-reading leading-[1.6] text-content',
            FOCUS_RING,
          )}
          id={controlId}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          value={value}
        />
      </div>
      {error !== undefined ? (
        <p className="text-sm text-danger" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Os campos comuns aos dois modos. */
export function HighlightFields({
  color,
  colorError,
  draft,
  onColor,
  onField,
  pageError,
  quoteError,
}: {
  draft: Draft;
  color: HighlightColor | null;
  quoteError: string | undefined;
  pageError: string | undefined;
  colorError: string | undefined;
  onField: (key: keyof Draft, value: string) => void;
  onColor: (color: HighlightColor) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {/*
        ⚠️ **`<textarea>` E NÃO `<input>`** (decisão E da Tarefa 25): é um
        trecho de livro copiado à mão, e duas frases é o caso normal. Não há
        teto de tamanho no domínio — o teto é o `bodyLimit` de 256 KiB da rota.
      */}
      <QuoteField
        error={quoteError}
        onChange={(next) => onField('quote', next)}
        pen={color === null ? null : COLOR_PEN_KEYS[color]}
        value={draft.quote}
      />

      <ColorField error={colorError} onPick={onColor} value={color} />

      {/*
        ⚠️ **`type="text"` + `inputMode="numeric"`, NÃO `type="number"`** — o
        precedente medido do mês no `book-form.tsx` (§7.6.1): o algoritmo de
        sanitização do `type="number"` (que o jsdom implementa, como o
        navegador) troca todo valor malformado por `''`, então a regra 14
        viraria "página em branco" e o mutante que apaga o `isValidPage`
        sobreviveria. Fixture que o framework interpreta diferente do runtime
        real é falso verde.
      */}
      <Field
        error={pageError}
        hint={t('pages.highlightForm.fields.pageHint')}
        label={t('pages.highlightForm.fields.page')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            inputMode="numeric"
            onChange={(event) => onField('page', event.target.value)}
            type="text"
            value={draft.page}
          />
        )}
      </Field>

      <Field
        hint={t('pages.highlightForm.fields.referenceHint')}
        label={t('pages.highlightForm.fields.reference')}
      >
        {(control) => (
          <input
            {...control}
            className={TEXT_INPUT_CLASS}
            onChange={(event) => onField('reference', event.target.value)}
            type="text"
            value={draft.reference}
          />
        )}
      </Field>
    </>
  );
}

/** O rótulo do comentário, acima do editor (que não é um controle de `Field`). */
export function CommentLabel() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-content">
        {t('pages.highlightForm.fields.comment')}
      </span>
      <span className="text-sm text-subtle">
        {t('pages.highlightForm.fields.commentHint')}
      </span>
    </div>
  );
}

/** Quais campos a tela reprova antes de enviar — regras 12, 13 e 14. */
export interface Problems {
  quote: boolean;
  color: boolean;
  page: boolean;
}

export const NO_PROBLEMS: Problems = {
  quote: false,
  color: false,
  page: false,
};

export function problemsOf(
  draft: Draft,
  color: HighlightColor | null,
): Problems {
  return {
    quote: draft.quote.trim() === '',
    color: color === null,
    page: draft.page.trim() !== '' && !isValidPage(draft.page.trim()),
  };
}

export function hasProblem(problems: Problems): boolean {
  return problems.quote || problems.color || problems.page;
}

/** O terceiro import dinâmico do editor no app. → `free-note.tsx`. */
const RichEditor = lazy(async () => {
  const editor = await import('@clube/ui/editor');
  return { default: editor.RichEditor };
});

/**
 * O CAMPO DO COMENTÁRIO — o editor, sempre dentro de um `Suspense`, porque o
 * chunk é o maior do app e sem `fallback` a tela ficaria em branco no lugar
 * dele (regra 20 da Tarefa 25).
 *
 * ⚠️ **ELE MUDOU DE ARQUIVO NA TAREFA 47b, E O MOTIVO É O TETO DE 400.** A
 * fatia acrescentou ao `highlight-form.tsx` a margem de desktop (duas props
 * `rail` e o `me` do contexto), e aquele arquivo já estava **27 acima do
 * teto** — a 47a o deixou em **427** de propósito, escrevendo que "um teto que
 * vale para um arquivo só é um teto que anda de lado". Então o comentário veio
 * para cá, que é onde moram os outros campos do grifo, e o formulário saiu da
 * fatia **menor do que entrou**: 427 → 407, e este arquivo foi de 309 para
 * 337.
 * Os números estão na entrada 47b do `docs/BACKLOG.md`.
 */
export function LazyComment({
  doc,
  onChange,
}: {
  doc: Record<string, unknown> | undefined;
  onChange: (doc: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();

  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted">
          {t('pages.highlightForm.editorLoading')}
        </p>
      }
    >
      <RichEditor
        className="rounded-control border border-line bg-surface"
        doc={doc}
        onChange={onChange}
      />
    </Suspense>
  );
}
