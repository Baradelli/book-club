import {
  ContextBar,
  type ContextBarProps,
  cx,
  FOCUS_RING,
  ReadingColumn,
  RuleDouble,
  type RuleDoubleAccent,
} from '@clube/ui';
import type { ReactNode } from 'react';

import { listItemRouterLink } from '../router-link';

/**
 * O CROMO DAS TELAS — o `Notice` e o `Screen`, num módulo só (Tarefa 25,
 * decisão H).
 *
 * ⚠️ **ELE NASCEU DE UMA MEDIÇÃO, não de gosto por abstração.** Antes desta
 * fatia o `Notice` tinha **cinco** cópias em `pages/` — três byte-idênticas
 * (`book-form`, `day-note`, `free-note`) e **duas com um `description` a mais**
 * (`home`, `book`) — e o mesmo `<section>` + `h1` do `Screen` aparecia em
 * quatro telas, três com a largura de conteúdo de 672px e uma com a de 896px.
 * A tela de grifos
 * seria a sexta cópia de um e a quinta do outro.
 *
 * A divergência já tinha começado (é o que as "duas variantes" são), e é
 * exatamente a **lição nº 3 do MVP 1**: vocabulário compartilhado que mora em N
 * arquivos divergiu na primeira correção. A saída aqui é a mesma que a Tarefa
 * 23 tomou com o `matches` dos fakes de repositório — **extrair, não copiar de
 * novo** —, e ela é o PRIMEIRO commit lógico da fatia, não um refactor de
 * carona no fim: uma tela nova escrita antes da unificação nasce como a próxima
 * cópia, e aí a unificação passa a ter seis lugares para acertar.
 *
 * ⚠️ **E A UNIFICAÇÃO É MENSURÁVEL (regra 2), não declarada.** Um módulo
 * compartilhado que ninguém importa é uma cópia com endereço novo. Mudar a
 * marcação do `Notice` daqui deixa vermelho em **mais de uma** suíte de tela; o
 * acusador estrutural (nenhuma tela declara `function Notice`, e todas importam
 * daqui) está em `__tests__/chrome.test.tsx`.
 *
 * ⚠️ **MORA NO `app`, NÃO EM `packages/ui`**, e é escopo fechado desta fatia: o
 * `ui` é o design system, e um componente novo lá mexe em tokens de tema e no
 * bundle — é fatia própria, com o dono decidindo. Aqui o assunto é a
 * duplicação **entre telas**.
 *
 * ⚠️ **E A HOME USA O `Screen` — a primeira versão desta fatia dizia que não, e
 * o argumento estava errado.** Ele era: "uma prop de espaçamento para UM
 * chamador é especulação". Mas o `ScreenWidth` foi construído com o argumento
 * oposto ("as duas larguras que existem hoje"), e `gap-4`/`gap-6` são
 * **igualmente** dois valores reais, em árvore, hoje — o mesmo critério dando
 * duas respostas.
 *
 * O que decidiu foi a **consequência medível**: a varredura da regra 2 confere
 * ausência de `function Screen(`, e a home **passava trivialmente**, porque ela
 * nunca declarou uma — a 5ª cópia do `<section>` + `h1` dela era **invisível**
 * para a guarda que existe exatamente para pegar isso. Daí o `spacing`, a
 * migração da home, do login e do aceite, e a asserção que fecha a classe de
 * verdade: **nenhuma tela declara `<h1` própria** (`__tests__/chrome.test.tsx`),
 * que não depende do nome de nenhuma função.
 *
 * ⚠️ **AS DUAS EXCEÇÕES SÃO DECLARADAS E MEDIDAS**, e estão nomeadas na guarda
 * (`H1_EXCEPTIONS`, em `__tests__/chrome.test.tsx`): o `accept-invite.tsx` tem
 * o `h1` dentro de um `div gap-2` junto com a descrição (migrar afastaria as
 * duas frases de `gap-2` para `gap-6` — mudança VISUAL numa tela que esta fatia
 * não tocou), e o `not-found.tsx` é `max-w-md items-start gap-3` **sem
 * `w-full`` — três divergências, não uma. O motivo de cada uma está lá.
 */

/**
 * ⚠️ **O LINK DE TEXTO DAS TELAS — a terceira cópia, extraída de verdade.**
 *
 * A primeira versão desta fatia trazia um comentário no `book.tsx` dizendo que
 * as classes de link *"moram em `highlights.tsx` (`CHIP_LINK_CLASS`) para não
 * serem uma segunda cópia"*. A auditoria mediu: `grep -rn "CHIP_LINK_CLASS"`
 * devolvia **uma** ocorrência — **a própria frase**. A constante não existia, e
 * as classes estavam duplicadas **byte a byte** entre `highlights.tsx` (o
 * "Corrigir este grifo") e `highlight-form.tsx` (o "Ver os grifos do livro").
 *
 * É a lição nº 3 do MVP 1 acontecendo **dentro do commit que a cita**, e é a
 * classe dos dois achados da Tarefa 24: **a frase que afirma "medido" é a mais
 * perigosa**, porque ninguém confere prosa.
 *
 * ⚠️ **E A ABA DE GRIFOS DO `book.tsx` NÃO ENTRA AQUI, com o `diff` na mão.**
 * Ela é um **chip**, não um link de texto — as duas strings não têm uma classe
 * em comum além do `FOCUS_RING`:
 *
 * ```
 * aba : inline-flex min-h-11 shrink-0 items-center rounded-full border
 *       border-line bg-surface px-4 text-sm font-medium text-muted
 *       transition-colors hover:border-line-strong hover:text-content
 * link: rounded-control text-sm font-medium text-accent underline-offset-2
 *       hover:underline
 * ```
 *
 * Alvo de toque de 44px, pílula com borda e fundo, e cor `muted` de um lado;
 * sublinhado no `hover` e cor de ação do outro. Juntá-las numa constante com um
 * parâmetro de variante seria reimplementar o `FilterChip` — que é o que
 * deveria existir em `packages/ui` com `renderLink`, e é a lacuna que já está
 * no relatório. A aba fica local no `book.tsx`, com um chamador só.
 *
 * `packages/ui` continua sem saber do roteador (é obrigatório: um design system
 * não arrasta `react-router` para dentro de todo bundle que importa um
 * `Button`), então quem decide o visual do link é o app — num lugar só.
 */
export const TEXT_LINK_CLASS = cx(
  'rounded-control text-sm font-medium text-accent underline-offset-2 hover:underline',
  FOCUS_RING,
);

export interface NoticeProps {
  /** Já traduzido pela tela (ou conteúdo do clube, que não se traduz). */
  title: string;
  /**
   * A segunda linha, quando existe.
   *
   * ⚠️ **Opcional de verdade: ausente NÃO renderiza parágrafo nenhum.** Era o
   * único ponto em que as duas variantes divergiam, e é a forma de tela do
   * "ausente ≠ vazio" que este projeto persegue no `PATCH` — um `<p>` vazio
   * ocupa espaço, entra na fala do leitor de tela como pausa, e ninguém vê o
   * defeito olhando a tela.
   */
  description?: string;
  action?: ReactNode;
}

/** O estado vazio e o de erro têm a MESMA forma; só o conteúdo muda. */
export function Notice({ action, description, title }: NoticeProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-control border border-line bg-surface p-4">
      <p className="font-medium text-content">{title}</p>
      {description !== undefined ? (
        <p className="text-sm text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/**
 * AS DUAS LARGURAS QUE EXISTEM — e eram três até a Tarefa 42.
 *
 * `reading` é a **edição crítica** do canvas: coluna de leitura de 680px com
 * margem de 320px ao lado acima de 1120px, e uma coluna com 20px de recuo
 * abaixo. É o `ReadingColumn` de `@clube/ui` (Tarefa 41b), que é quem tem as
 * medidas e o corte.
 *
 * `entry` é a coluna estreita da tela de entrada, que tem um formulário curto
 * e nenhuma lista — o canvas a desenha estreita (`Main.dc.html`).
 *
 * ⚠️ **UM CHAMADOR, NÃO DOIS: o `accept-invite.tsx` NÃO usa o `Screen`.** Esta
 * frase dizia "login e aceite de convite" desde a Tarefa 25 e foi repetida na
 * 42; medido (`grep -n "<Screen" pages/*.tsx`), quem passa `width="entry"` é
 * só o `login.tsx`. O aceite tem `<section>` própria e está no
 * `H1_EXCEPTIONS` — o `h1` dele vive num `div gap-2` junto com a descrição, o
 * que este cromo não sabe expressar. O canvas o desenha estreito
 * (`Convite.dc.html`) e ele É estreito, por conta própria (`max-w-md` na
 * `<section>` dele).
 *
 * ⚠️ **`narrow` (672px de conteúdo) E `wide` (896px) MORRERAM NA TAREFA 42**,
 * pela decisão B: as duas dão lugar ao modelo do canvas. O `book-form.tsx`
 * era o único chamador de `wide` (quatro `Screen`) e passou a usar o padrão;
 * ninguém nunca escreveu `width="narrow"`, que era o padrão.
 *
 * ⚠️ **E O QUE ISSO CUSTA AO `book-form.tsx` ESTÁ MEDIDO E REGISTRADO:** o
 * canvas **não tem artboard de desktop para o cadastro de livro** (são cinco,
 * e são `Inicio`, `Dia`, `Livro`, `NovaAnotacao` e `NovoGrifo`), então 680px
 * ali é a decisão B aplicada, não uma medição. A linha do plano
 * (`plan-editor.tsx:302`) vira LINHA a partir de `sm` (640px) com
 * `sm:w-44` + `sm:flex-1` + `sm:w-44`, então ela continua cabendo numa linha —
 * o campo do meio fica ~270px em vez de ~490px. Quem revisita é a Tarefa 47,
 * que é a dona dos formulários.
 */
export type ScreenWidth = 'reading' | 'entry';

/**
 * O ar entre as seções: `tight` nas telas de conteúdo, `airy` onde há seções
 * com `h2` próprio (a home) ou um formulário curto respirando (as de entrada).
 */
export type ScreenSpacing = 'tight' | 'airy';

/**
 * ⚠️ As classes existem **literalmente** aqui, e é o que faz o Tailwind
 * emiti-las: ele compila o que está escrito no código-fonte, então montar
 * `max-w-${x}` em runtime não geraria CSS nenhum (o mesmo mecanismo do
 * `SCROLL_LOCK_CLASS` do `Sheet`).
 */
const SCREEN_SPACING_CLASS: Readonly<Record<ScreenSpacing, string>> = {
  tight: 'gap-4',
  airy: 'gap-6',
};

/**
 * ============================================================================
 * O TÍTULO DA TELA — medido h1 a h1, e a primeira entrega media UM só
 * ============================================================================
 *
 * ⚠️ **A PRIMEIRA ENTREGA DESTA FATIA COPIOU O `Dia.dc.html` E APLICOU A OITO
 * TELAS**, escrevendo que `Inicio` e `Livro` eram *"conteúdo de tela, não o
 * degrau da escala"*. **As duas afirmações eram falsas**: os dois SÃO o
 * `Screen.title` (`home.tsx` passa `pages.home.title`, e `book.tsx:617-620`
 * passa o título do livro), e o `Dia` é o único dos dez que a classe
 * reproduzia.
 *
 * **Medido agora** (`grep -n '<h1' *.html` nos 21 artboards → **15**
 * ocorrências; destas, **10** são o `Screen.title` de uma tela que usa este
 * cromo — as outras cinco são os três artboards de desktop, mais `Convite` e
 * `NaoEncontrada`, que são as duas exceções do `H1_EXCEPTIONS`):
 *
 * | artboard | tela | px | `line-height` | `letter-spacing` |
 * | --- | --- | --- | --- | --- |
 * | `Acervo.dc.html:44` | `acervo` | 28 | 1.14 | −0.02em |
 * | `Busca.dc.html:44` | `busca` | 28 | 1.14 | −0.02em |
 * | `Dia.dc.html:45` | `day-note` | 25 | 1.18 | −0.015em |
 * | `DiaEscuro.dc.html:45` | `day-note` (escuro) | 25 | 1.18 | −0.015em |
 * | `EditarLivro.dc.html:47` | `book-form` | 26 | 1.15 | −0.02em |
 * | `Inicio.dc.html:51` | `home` | 27 | 1.18 | −0.015em |
 * | `Livro.dc.html:48` | `book` | 23 | 1.15 | −0.015em |
 * | `Main.dc.html:34` | `login` | 30 | 1.14 | −0.02em |
 * | `NovoLivro.dc.html:47` | `book-form` | 26 | 1.15 | −0.02em |
 * | `Preferencias.dc.html:44` | `preferencias` | 28 | 1.14 | −0.02em |
 *
 * **Entregue a MAIORIA de cada propriedade, e não um artboard:**
 * `line-height` **1.14** (4 contra 3 e 3) e `letter-spacing` **−0.02em** (6
 * contra 4). Os dois entram como **valor arbitrário** e não como degrau de
 * escala, então nada obrigava arredondamento nenhum — é justamente
 * por isso que copiar um artboard aqui era gratuito.
 *
 * ⚠️ **O TAMANHO É A DIVERGÊNCIA DECLARADA:** o canvas usa **sete** valores
 * (23 · 25 · 26 · 26 · 27 · 28 · 28 · 28 · 30 · 30 px) e sai **25px**
 * (`text-title`, o `--size-title` da Tarefa 39) em todas. Acrescentar os seis
 * degraus que faltam à escala fechada de sete é decisão de desenho, e cada
 * degrau novo entra também na lista fechada de isenções ao `light-dark()` —
 * é a mesma conta, e o mesmo registro, dos quatro arredondamentos de corpo que
 * a Tarefa 41a deixou em aberto para o dono.
 *
 * ⚠️ **`text-balance` FICA, e ele é minoria de propósito** (4 dos 10). Ele é
 * **inócuo** num título de uma linha — a quebra equilibrada só reparte o texto
 * quando há mais de uma linha —, e as quatro telas em que o canvas o usa são
 * exatamente as de título longo e vindo do conteúdo (o tema do dia, o nome do
 * livro). Aplicá-lo às dez não muda nada em "Acervo" e melhora o que quebra.
 */
export const SCREEN_TITLE_CLASS =
  'font-reading text-title font-medium leading-[1.14] tracking-[-0.02em] text-balance';

export interface ScreenProps {
  /** Já traduzido, ou o título do conteúdo quando ele é a informação principal. */
  title: string;
  children: ReactNode;
  /** O padrão é `reading`: a edição crítica do canvas. */
  width?: ScreenWidth;
  /** O padrão é `tight`: é o que as quatro telas de conteúdo usam. */
  spacing?: ScreenSpacing;
  /**
   * ⚠️ **O APARATO DE MARGEM — a capacidade da decisão C, e NENHUMA TELA A
   * PASSA na Tarefa 42.**
   *
   * Quem a preenche são as Tarefas 43 (os grifos desta leitura), 44 (as marcas
   * e "Neste livro"), 45 (correntes e feed) e 46 (o painel de refinar). A
   * capacidade nasce testada — inclusive o caso VAZIO, que é o que quebra
   * calado: um `<aside>` que nascesse sempre desenharia um filete vertical
   * solto e um terço de tela em branco em todas as telas, com o elemento
   * existindo e o teste de render verde.
   *
   * Ausente ≠ vazio, como no `description` do `Notice`.
   */
  rail?: ReactNode;
  /**
   * O FILETE DUPLO: de que lado fica o traço grosso — ou se ele existe.
   *
   * ⚠️ **O PADRÃO É `top`, E A PRIMEIRA ENTREGA DESTA FATIA PÔS `bottom`**
   * escrevendo "São TRÊS artboards na primeira linha e UM na segunda —
   * contados, não generalizados". **Os dois números estavam errados.** Contado
   * agora pelo par de `<div>` de `gap:3px` dos 21 artboards: o canvas tem
   * **15** filetes duplos, e **10** deles ficam logo abaixo de um `<h1>`, que
   * é onde este cromo põe o dele:
   *
   * | ordem | quantos | onde |
   * | --- | --- | --- |
   * | `top` (2px `--accent`, depois hairline) | **7** | `Acervo:45`, `Busca:45`, `Convite:37`, `EditarLivro:48`, `Main:35`, `NovoLivro:48`, `Preferencias:45` |
   * | `bottom` (hairline, depois 2px) | **3** | `Dia:49`, `DiaEscuro:49`, `DiaDesktop:58` |
   *
   * `bottom` é a forma das telas de ESCRITA — o filete que fecha o título e
   * *entrega a página* a quem vai escrever. `top` ABRE a seção, e é o que a
   * maioria usa.
   *
   * ⚠️ **`'none'` NASCEU AQUI, e ele não é "desligar a decoração":** o canvas
   * desenha **três** telas sem filete nenhum — `Livro.dc.html` (a tela do
   * livro, que tem `h1` na linha 48 e nenhum par de `gap:3px`) e os dois
   * artboards de grifo (`NovoGrifo`, `CorrigirGrifo`, que não têm nem `h1`).
   * Sem esta forma o `Screen` inventa um traço nas três, e **nada acusaria**:
   * um filete a mais não muda texto, nem papel, nem foco.
   */
  rule?: RuleDoubleAccent | 'none';
}

/**
 * Sempre existe um `h1`: é ele que faz de "carregando", "não foi possível
 * abrir" e "isto não está aqui" **estados de uma tela**, e não telas brancas
 * com um `h1` diferente em cada ramo.
 *
 * ⚠️ E o `h1` é DAQUI, não da tela. É essa a propriedade que a guarda
 * `no page declares an h1 of its own` fecha — e ela não depende do nome de
 * nenhuma função, ao contrário da varredura de `function Screen(`, pela qual a
 * `<section>` + `h1` da home passava trivialmente.
 */
export function Screen({
  children,
  rail,
  rule = 'top',
  spacing = 'tight',
  title,
  width = 'reading',
}: ScreenProps) {
  /*
    ⚠️ Um lugar só decide se há filete, e é o que impede os dois `return`
    abaixo de divergirem. A primeira entrega desta fatia tinha o filete SÓ no
    ramo de leitura, com um comentário afirmando que a tela de entrada "não tem
    filete de abertura" — e `Main.dc.html:35` e `Convite.dc.html:37` **têm**,
    na forma `top`, que é a mesma das outras sete.
  */
  const fillet = rule === 'none' ? null : <RuleDouble accent={rule} />;

  if (width === 'entry') {
    /*
      A tela de entrada NÃO é a edição crítica: não há o que ler ao lado de um
      formulário de dois campos, e por isso ela não tem coluna nem margem. É a
      única forma que sobreviveu à decisão B.
    */
    return (
      <section
        className={cx(
          'mx-auto flex w-full max-w-md flex-col p-6',
          SCREEN_SPACING_CLASS[spacing],
        )}
      >
        <h1 className={SCREEN_TITLE_CLASS}>{title}</h1>
        {fillet}
        {children}
      </section>
    );
  }

  return (
    /*
      ⚠️ **O `ReadingColumn` ENTRA DENTRO DO `Screen`, NÃO NO LUGAR DELE**
      (decisão A). É o que faz o `h1` continuar saindo daqui — e a guarda
      `no page declares an h1 of its own` de `__tests__/chrome.test.tsx`
      continuar sendo a mais forte do cromo, sem depender do nome de função
      nenhuma.

      `pt-5` = os 20px de topo do `<main>` do celular, que são a MAIORIA
      medida: **11 dos 16** artboards de celular usam `padding-top:20px`
      (`Livro.dc.html:41`, `Acervo`, `Busca`, `Preferencias`, `NovaAnotacao`,
      `NovoGrifo`, `CorrigirGrifo`, `NovoLivro`, `EditarLivro`, `Avulsa`), dois
      usam 18px (`Dia`, `DiaEscuro`) e os três restantes são telas de entrada e
      404 (48 · 56 · 120px).

      `min-[1120px]:pt-0` devolve o comando ao `min-[1120px]:pt-10` do
      `ReadingColumn` acima do corte — os dois são do mesmo elemento, e é a
      ordem de emissão do Tailwind (variante de mídia depois do utilitário cru)
      que decide. O acusador da EXISTÊNCIA dele é
      `chrome.test.tsx › the top gutter of the reading screen`; sem ele os dois
      recuos se somam e o desktop fica com 60px.

      ⚠️ **`pb-7` NÃO VEM DO CANVAS, e a primeira entrega desta fatia o citou
      como se viesse** (`Inicio.dc.html:36`, `padding:… 28px …`). Medido:
      **15 dos 16** artboards de celular têm `padding-bottom:0`, e o `Inicio` é
      o único com 28px. Mas o zero dos 15 é **artefato do mock**, não decisão de
      desenho: naqueles artboards o `<main>` é `flex-grow:1` com
      `overflow:hidden` dentro de uma moldura de altura fixa, então o conteúdo
      nunca chega à borda de baixo e o recuo inferior não pinta nada. O
      `Inicio` é o único em que o conteúdo termina de verdade — e é o único
      número que o canvas chegou a exercitar. Num app que ROLA, todas as telas
      terminam. Fica 28px, **declarado como decisão do app** e não como medida
      do canvas.
    */
    <ReadingColumn rail={rail}>
      <section
        className={cx(
          'flex w-full flex-col pb-7 pt-5 min-[1120px]:pt-0',
          SCREEN_SPACING_CLASS[spacing],
        )}
      >
        <h1 className={SCREEN_TITLE_CLASS}>{title}</h1>
        {fillet}
        {children}
      </section>
    </ReadingColumn>
  );
}

/**
 * ⚠️ **A BARRA DE CONTEXTO, COM O `Link` DO ROTEADOR — a decisão D.**
 *
 * A `ContextBar` de `@clube/ui` recebe a âncora por `renderLink`, e o padrão
 * dela é um `<a href>` cru — porque `packages/ui` **não pode** conhecer o
 * roteador (um design system que importa `react-router-dom` o arrasta para
 * todo bundle que importa um `Button`).
 *
 * ⚠️ **E âncora crua num PWA é navegação de DOCUMENTO: ela recarrega o shell
 * inteiro e perde o estado em memória** — a sessão, o clube ativo, o rascunho
 * do editor. É o mesmo defeito que o `listItemRouterLink` fecha para as listas
 * desde a Tarefa 17, e é **invisível em teste de render**: o `<a href>` existe,
 * tem o endereço certo, e o teste de "o link aponta para o lugar certo" fica
 * verde enquanto o app recarrega a cada volta.
 *
 * Por isso a fiação mora AQUI, e não em cada tela: uma tela que esquecesse o
 * `renderLink` reabriria o defeito em silêncio, e as Tarefas 43 a 46 têm
 * quatro telas para lembrar. O acusador é
 * `__tests__/chrome.test.tsx › goes back WITHOUT reloading the PWA`.
 *
 * O `listItemRouterLink` é reusado de propósito: `ContextBarLinkProps` é um
 * **alias** de `ListItemLinkProps` (declarado como tal em `context-bar.tsx`),
 * e um segundo `renderLink` com o mesmo corpo seria o segundo nome para uma
 * coisa só que este repositório já pagou três vezes.
 *
 * ⚠️ Nenhuma tela a usa NESTA fatia — quem a põe na tela são as 43 a 46.
 */
/**
 * ⚠️ **`Omit` DISTRIBUTIVO, e o `T extends unknown` não é enfeite.**
 *
 * `ContextBarProps` é `ContextBarBase & (sem ação | com ação)` — uma união
 * discriminada. Um `Omit<ContextBarProps, 'renderLink'>` direto **colapsa a
 * união num objeto só**: o compilador perde a discriminação, e a barra com
 * `actionLabel` mas sem `onAction` — a combinação que a decisão H da 41b
 * existe para tornar impossível — volta a compilar. Medido: o `tsc` acusou
 * (`TS2322`) no primeiro conserto desta auditoria.
 *
 * O `T extends unknown ? … : …` faz o `Omit` rodar **em cada membro** da
 * união, preservando as duas formas.
 */
type WithoutRenderLink<T> = T extends unknown ? Omit<T, 'renderLink'> : never;

export function ScreenContextBar(
  /*
    ⚠️ **Sem `renderLink`, e não `ContextBarProps` cru.** Com o tipo inteiro,
    uma tela podia passar `renderLink` e ele era **descartado em silêncio** — o
    `{...props}` vem ANTES, então o daqui sempre ganha. Uma prop aceita e
    ignorada é pior que uma prop inexistente: ela parece funcionar. É o mesmo
    defeito que a nota nº 1 da Tarefa 41a mediu no `className` do `Field`
    ("seria uma prop nova com zero efeito"). Agora o compilador recusa.
  */
  props: WithoutRenderLink<ContextBarProps>,
) {
  return <ContextBar {...props} renderLink={listItemRouterLink} />;
}
