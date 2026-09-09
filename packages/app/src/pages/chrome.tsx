import { cx, FOCUS_RING } from '@clube/ui';
import type { ReactNode } from 'react';

/**
 * O CROMO DAS TELAS — o `Notice` e o `Screen`, num módulo só (Tarefa 25,
 * decisão H).
 *
 * ⚠️ **ELE NASCEU DE UMA MEDIÇÃO, não de gosto por abstração.** Antes desta
 * fatia o `Notice` tinha **cinco** cópias em `pages/` — três byte-idênticas
 * (`book-form`, `day-note`, `free-note`) e **duas com um `description` a mais**
 * (`home`, `book`) — e o mesmo `<section>` + `h1` do `Screen` aparecia em
 * quatro telas, três com `max-w-2xl` e uma com `max-w-4xl`. A tela de grifos
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
 * As três larguras que existem — e são as que as cópias tinham.
 *
 * `narrow` é a coluna de leitura e escrita; `wide` é o cadastro do livro
 * (decisão F da Tarefa 20: a linha do plano tem três campos, empilha no celular
 * e cabe inteira numa linha no desktop); `entry` é a coluna estreita das telas
 * de entrada (login e aceite de convite), que têm um formulário curto e nenhuma
 * lista.
 */
export type ScreenWidth = 'narrow' | 'wide' | 'entry';

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
const SCREEN_WIDTH_CLASS: Readonly<Record<ScreenWidth, string>> = {
  narrow: 'max-w-2xl',
  wide: 'max-w-4xl',
  entry: 'max-w-md',
};

const SCREEN_SPACING_CLASS: Readonly<Record<ScreenSpacing, string>> = {
  tight: 'gap-4',
  airy: 'gap-6',
};

export interface ScreenProps {
  /** Já traduzido, ou o título do conteúdo quando ele é a informação principal. */
  title: string;
  children: ReactNode;
  /** O padrão é `narrow`: é o que quatro das sete telas usam. */
  width?: ScreenWidth;
  /** O padrão é `tight`: é o que as quatro telas de conteúdo usam. */
  spacing?: ScreenSpacing;
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
  spacing = 'tight',
  title,
  width = 'narrow',
}: ScreenProps) {
  return (
    <section
      className={cx(
        'mx-auto flex w-full flex-col p-6',
        SCREEN_WIDTH_CLASS[width],
        SCREEN_SPACING_CLASS[spacing],
      )}
    >
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </section>
  );
}
