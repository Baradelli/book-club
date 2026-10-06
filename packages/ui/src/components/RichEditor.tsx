import type { Extensions } from '@tiptap/core';
import { Color } from '@tiptap/extension-color';
import { Details } from '@tiptap/extension-details';
import { DetailsContent } from '@tiptap/extension-details-content';
import { DetailsSummary } from '@tiptap/extension-details-summary';
import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  BubbleMenu,
  type Editor,
  EditorContent,
  useEditor,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Redo2, Undo2 } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { cx } from '../cx';
import { Callout } from './callout';
import { ImageUpload, uploadImageFiles } from './image-upload';
import {
  createNoteMention,
  createNoteWikilink,
  type NoteSearch,
  type NoteSuggestion,
} from './note-mention';
import { SlashCommand } from './slash-command';
import { FOCUS_RING } from './styles';

export type { NoteSearch, NoteSuggestion };

/**
 * O EDITOR (`docs/EDITOR.md`) — a peça central do produto.
 *
 * ⚠️ AS PROPS SÃO A ÚNICA SUPERFÍCIE DE INJEÇÃO. Ele não importa cliente HTTP,
 * não conhece rota, não sabe o que é uma "nota" e não sabe o que é um clube.
 * Quem sabe é a tela. É isso que permite a tela de anotação (Tarefa 18) e a de
 * cadastro de livro (Tarefa 20) usarem o MESMO editor com capacidades
 * diferentes.
 *
 * ⚠️ E ELE NÃO SALVA. O autosave, o indicador de estado e a fila offline são
 * da TELA (Tarefas 18 e 21). Daqui só sai `onChange` com o documento.
 *
 * ⚠️ NENHUMA RAMIFICAÇÃO POR DISPOSITIVO. Não há `userAgent`, não há
 * `isMobile`, não há JavaScript medindo janela. ~~A adequação ao celular é
 * ESTRUTURAL: alvos de toque de 36px, barra que rola de lado e GRUDA no topo
 * e o `preventDefault` da §4.4.~~
 *
 * ⚠️ **A FRASE ACIMA FICOU RISCADA NA TAREFA 43 (2026-09-22), e só a primeira
 * metade dela mudou.** A barra fixa do topo MORREU (decisão A): o que formata é
 * o menu de bolha na seleção e o menu `/` que já existe, e o que fica fixo na
 * tela é a barra de CANETAS (`penBar`). Com ela, três coisas daquela lista
 * deixaram de existir — não há mais scroll lateral, nada mais GRUDA no topo,
 * e o alvo de toque subiu de 36px para os **44px** do canvas, o que APAGA a
 * exceção consciente que a §4.1 registrava.
 *
 * O que **não** mudou é o essencial: `preventDefault` em todo botão (§4.4), e
 * as duas larguras servidas por **media query e só** — as duas alturas da barra
 * (62px e 56px) e os dois tamanhos de caneta (22px e 20px) são variante de
 * mídia na mesma classe. `CLAUDE.md`: "UM shell, não dois".
 *
 * ⚠️ O DRAG HANDLE DA §4.3 NÃO ESTÁ AQUI, e não foi esquecido — é a decisão F
 * da `docs/tasks/14-rich-editor.md` aplicada ao que foi MEDIDO:
 *
 * - `@tiptap/extension-drag-handle-react` NÃO EXISTE na linha `2.10` (a
 *   primeira versão no escopo gratuito `@tiptap/*` é a 2.22.0). Na época do
 *   `^2.10.0` ele era `@tiptap-pro/*`, pago — exatamente o caso em que a
 *   decisão F manda PARAR E REPORTAR em vez de trocar de versão;
 * - e o `@tiptap/extension-drag-handle` de que ele depende importa
 *   `y-prosemirror` e `@tiptap/extension-collaboration` no topo do módulo:
 *   arrastar um parágrafo custaria a stack de COLABORAÇÃO (yjs) dentro de um
 *   PWA que não tem colaboração no escopo.
 *
 * Fica para o dono decidir. Arrastar bloco é conforto; nada nesta fatia
 * depende dele, e a §14 (a checklist do celular) não o pede.
 */

/**
 * A paleta de grifo do editor (§6) — deliberadamente em `rgba` com alpha, para
 * o texto continuar legível no tema claro E no escuro. Cor sólida esconderia a
 * palavra grifada num dos dois.
 *
 * ⚠️ NÃO CONFUNDIR com a entidade `Highlight` (MVP 2, Tarefa 22): esta paleta
 * é do editor — marcar texto DENTRO de uma anotação. A entidade é o registro
 * de um grifo feito no livro de papel. São coisas diferentes que usam as mesmas
 * cores, e os valores ficam espelhados de propósito, para não parecer bug.
 *
 * ⚠️ **OS RÓTULOS VIRARAM "CANETA" NA TAREFA 43, e não é sinônimo escolhido a
 * esmo:** é o nome que o canvas dá aos cinco botões (`Dia.dc.html:105,108,111,
 * 114,117`: `aria-label="Caneta amarela"` …) e é o vocabulário que o MVP 3.5 já
 * tinha adotado nos tokens (`--pen-a`…`--pen-r`) e no `GrifoText` da Tarefa 41b.
 * Eles saíram da barra do topo, que morreu, e passaram a ser a barra de baixo.
 *
 * ⚠️ **O `HIGHLIGHT_COLORS` PASSOU A SER EXPORTADO**, e só por isso: a lista da
 * barra e a lista esperada pelo teste têm de ser **a mesma** (regra 4 da Tarefa
 * 43). O nome NÃO muda — `packages/shared` lê este arquivo do disco pelo nome
 * (`shared/src/__tests__/highlight-color.test.ts`, o espelho do ADR 0004).
 */
export interface HighlightPen {
  /** O que vai para o `doc` — e é ele que o espelho do ADR 0004 compara. */
  color: string;
  label: string;
}

export const HIGHLIGHT_COLORS: readonly HighlightPen[] = [
  { color: 'rgba(250, 204, 21, 0.40)', label: 'Caneta amarela' },
  { color: 'rgba(34, 197, 94, 0.35)', label: 'Caneta verde' },
  { color: 'rgba(249, 115, 22, 0.40)', label: 'Caneta laranja' },
  { color: 'rgba(59, 130, 246, 0.35)', label: 'Caneta azul' },
  { color: 'rgba(236, 72, 153, 0.35)', label: 'Caneta rosa' },
];

/**
 * ============================================================================
 * O CONJUNTO DE FORMATAÇÃO — UMA LISTA, DUAS ÂNCORAS (decisões A e E)
 * ============================================================================
 *
 * O que o canvas desenha na fileira do menu de bolha (`Dia.dc.html:65-70`):
 * **B · I · `<>` · H1 · H2 · citação**, em botões de 44×44 com separador entre
 * eles. E o `Aa` da barra de canetas (`Dia.dc.html:123`) abre **estes mesmos**
 * controles, ancorados na barra — é o que faz a formatação existir quando não
 * há seleção.
 *
 * ⚠️⚠️ **O CANVAS DESENHA UM SÉTIMO BOTÃO NA FILEIRA, E ELE NÃO FOI
 * IMPLEMENTADO — divergência declarada, não esquecimento.**
 * `Dia.dc.html:71` é `<button aria-label="Mais opções">…</button>`, o
 * reticências. **O artboard é estático e não diz para onde ele leva**, e tudo o
 * que um "mais opções" de editor conteria — lista, lista numerada, tarefas,
 * bloco de código, divisória, tabela, aviso, alternável — é **exatamente** o
 * menu `/`, que a decisão F mantém intacto e que ganhou botão próprio na barra
 * de canetas. Implementar um segundo caminho para a mesma lista seria inventar
 * produto, e o `CLAUDE.md` manda perguntar antes de assumir.
 *
 * ⚠️ **A spec da Tarefa 43 escreve o conjunto como "B · I · `<>` · H1 · H2 ·
 * citação · …" e cita `Dia.dc.html:60-67`.** As duas coisas foram medidas: a
 * fileira está nas linhas **64-73** (a `:60` é linha em branco, a `:61` é um
 * `<p>` do texto e a `:67` é o `<>`), e o "…" final da spec é o sétimo BOTÃO,
 * não uma reticência de prosa. Fica para o dono.
 *
 * ⚠️ **UM CONJUNTO, DUAS ÂNCORAS — e é por isso que ele é uma LISTA e não dois
 * blocos de JSX.** Duas cópias divergem na primeira correção: este repositório
 * pagou isso com o `GUILT_TERMS` em duas listas até a Tarefa 19, com o
 * `dayRange` que o `CLAUDE.md` registra, e com o "Alguém do clube" em três
 * chaves que a Tarefa 40 achou. Os acusadores estão em `pen-bar.test.tsx`
 * (*renders, under the Aa, exactly the shared list* e *keeps ONE list for the
 * two anchors*).
 *
 * ⚠️ **OS GLIFOS SÃO TEXTO, NÃO ÍCONE**, como o canvas os desenha — e é por
 * isso que este arquivo deixou de importar `lucide-react`. Um `<Bold/>` no
 * lugar do `B` em Fraunces trocaria a voz tipográfica do editor pela de uma
 * barra de ferramentas genérica, que é justamente o que a fatia existe para
 * desfazer.
 *
 * ⚠️ **DIVERGÊNCIA DE ESCALA, DECLARADA:** os seis botões da fileira do canvas
 * usam **quatro** corpos distintos — 16px (B e I), 13px (`<>`), 14px (H1 e H2)
 * e 24px (a aspa) —, e a escala fechada de sete degraus da Tarefa 39 tem 14
 * (`text-ui`), 16 (`text-base`) e 25 (`text-title`). Entregue nesses três: os
 * 13px do `<>` sobem para 14 e os 24px da aspa sobem para 25. Acrescentar dois
 * degraus à escala é decisão de desenho — é a mesma conta, e o mesmo registro,
 * dos quatro arredondamentos que a Tarefa 41a deixou abertos.
 */
export interface FormatControl {
  label: string;
  /** O glifo do canvas, em TEXTO. */
  glyph: string;
  /** Classe literal — nunca montada em runtime (decisão C da Tarefa 41b). */
  glyphClassName: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

export const FORMAT_CONTROLS: readonly FormatControl[] = [
  {
    label: 'Negrito',
    glyph: 'B',
    glyphClassName: 'font-reading text-base font-semibold',
    isActive: (editor) => editor.isActive('bold'),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: 'Itálico',
    glyph: 'I',
    glyphClassName: 'font-reading text-base italic',
    isActive: (editor) => editor.isActive('italic'),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Código',
    glyph: '<>',
    glyphClassName: 'font-mono text-ui',
    isActive: (editor) => editor.isActive('code'),
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    label: 'Título 1',
    glyph: 'H1',
    glyphClassName: 'font-reading text-ui font-medium',
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Título 2',
    glyph: 'H2',
    glyphClassName: 'font-reading text-ui font-medium',
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Citação',
    glyph: '“',
    glyphClassName: 'font-quote text-title leading-none',
    isActive: (editor) => editor.isActive('blockquote'),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

/**
 * ONDE A BARRA DE CANETAS FICA — e é a tela que decide, não o dispositivo.
 *
 * - `floating`: uma pílula compacta presa no RODAPÉ do texto (`sticky`), que
 *   flutua no fundo da janela enquanto há texto abaixo e pousa no fim da
 *   anotação quando a pessoa chega lá. Com o teclado do celular aberto, ela
 *   sobe e fica logo acima dele (`useKeyboardInset`). É a forma das duas telas
 *   de escrita — a anotação do dia e a avulsa;
 * - `none` (o padrão): sem barra. É o comentário do grifo e o modo leitura.
 *
 * ⚠️ **HISTÓRICO, 2026-10-06 (pedido do dono):** havia ~~`fixed`~~ (faixa
 * opaca no rodapé), ~~`footer`~~ (a mesma, sem âncora), ~~`sticky`~~ (pílula
 * no TOPO que acompanhava a rolagem) e ~~`top`~~ (a mesma, parada, escolhida
 * nas Preferências). Morreram juntas: a pílula desceu para o rodapé, perto do
 * polegar, e a preferência que alternava as duas do topo perdeu o objeto.
 */
export type PenBarPlacement = 'floating' | 'none';

export interface RichEditorProps {
  /** ProseMirror JSON (ADR 0001), nunca HTML. */
  doc?: Record<string, unknown>;
  /**
   * Já traduzido pela TELA, que é quem tem `t()`:
   * `t('pages.dayNote.placeholder')` na anotação do dia,
   * `t('pages.freeNote.placeholder')` na avulsa.
   *
   * ⚠️ **Esta linha dizia `t('editor.placeholder')`, e essa chave nunca
   * existiu** (achado na auditoria da Tarefa 40). Um nome que não existe faz o
   * próximo leitor procurar, não achar e inventar um terceiro para a mesma
   * coisa — é a lição do `dayRange` que o `CLAUDE.md` registra, e ela pesa mais
   * num arquivo de produção do que num documento.
   */
  placeholder?: string;
  onChange: (doc: Record<string, unknown>) => void;
  editable?: boolean;
  className?: string;

  /**
   * CAPABILITY-GATED (§3): a extensão só é registrada se a prop existir.
   *
   * Sem `noteSearch`, `@` e `[[` não fazem nada — nem carregam o popup. Sem
   * `onUploadImage`, não há upload, mas o nó `image` CONTINUA registrado: uma
   * anotação antiga com imagem tem de renderizar em qualquer tela.
   */
  noteSearch?: NoteSearch;
  onOpenNoteLink?: (id: string) => void;
  /** Sobe o arquivo e devolve a URL FINAL. Nunca `blob:` nem `data:`. */
  onUploadImage?: (file: File) => Promise<string>;

  /**
   * Os dois únicos textos de usuário que o editor mostra (§8.4).
   *
   * Eles entram por PROP, e não por `t()`, porque o `@clube/ui` não traduz
   * (decisão B da Tarefa 13 — se ele traduzisse, passaria a ser dono de chave
   * de catálogo e o `CustomTypeOptions` tipado, que vive em `packages/app`,
   * deixaria de valer para ele). As chaves existem no catálogo:
   * `editor.image.uploading` e `editor.image.uploadFailed`.
   *
   * O default é português, como todo rótulo interno do editor (§10): assim uma
   * tela que esqueça de passar mostra a frase certa em vez de vazio.
   */
  uploadingLabel?: string;
  uploadFailedLabel?: string;

  /**
   * ⚠️ **A DECISÃO DE ARQUITETURA DA TAREFA 43, e ela é uma prop de POSIÇÃO —
   * nunca uma ref, nunca a instância do editor.**
   *
   * O canvas põe as cinco canetas + `Aa` + `/` FORA da área de texto, fixas na
   * tela. Mas quem tem a instância do TipTap é este componente, e a §3 diz por
   * escrito que **nenhuma ref imperativa é exposta**. Três saídas foram
   * pesadas, e duas foram recusadas pelo MESMO motivo:
   *
   * - `onReady(editor)` para a tela desenhar a barra → quebra o contrato **e**
   *   põe botão de editor em `packages/app`, onde a varredura de grafo de
   *   `editor-touch-handlers.test.ts` (a guarda da §4.4) não chega;
   * - a barra como `children` com render-prop → o botão nasce igualmente fora
   *   daquele grafo;
   * - ✅ **o editor continua dono da barra e a tela diz só ONDE ela fica.**
   *
   * O padrão é `'none'`: o comentário do grifo e o modo leitura não ganham
   * faixa nenhuma.
   */
  penBar?: PenBarPlacement;
  /**
   * A dica do `/`, JÁ TRADUZIDA pela tela — `t('editor.slashHint')`.
   *
   * ⚠️ Terceira folha de `editor.*` a entrar por prop, ao lado das duas do
   * upload, e **não é exceção ao §10 do `docs/EDITOR.md`: é a regra deste
   * namespace.** `packages/ui` não chama `t()` nenhuma vez, e não pode
   * (`no-i18n.test.ts`), então toda folha de `editor.*` é lida pela TELA. O
   * namespace nomeia o ASSUNTO — o editor —, nunca quem renderiza.
   *
   * Ausente ≠ vazio: sem a frase não nasce elemento nenhum.
   */
  slashHintLabel?: string;
  /**
   * As duas setas do começo da barra — ↶ desfaz, ↷ refaz —, com os rótulos JÁ
   * TRADUZIDOS pela tela (`t('editor.undo')`, `t('editor.redo')`).
   *
   * Entram por prop pela mesma razão da dica do `/`: `packages/ui` não chama
   * `t()`, e o teto de texto cravado (`no-hardcoded-ui-text.test.ts`) só pode
   * cair. E pela mesma regra: **ausente ≠ vazio** — sem o rótulo, o botão não
   * nasce (um botão sem nome é um botão que o leitor de tela não anuncia).
   */
  undoLabel?: string;
  redoLabel?: string;
}

export interface EditorExtensionOptions {
  placeholder?: string;
  /** Presente ⇒ `@` e `[[` registrados. Ausente ⇒ nem um nem outro. */
  noteSearch?: NoteSearch;
  /** Presente ⇒ upload registrado (e o menu `/` passa a oferecer "Imagem"). */
  onFiles?: (files: File[], position?: number) => void;
}

/**
 * A montagem das extensões, exportada para o teste poder LER a lista.
 *
 * As duas propriedades que quebram em silêncio e que por isso se testam daqui:
 * as extensões condicionais (regra 12) e "só H1 e H2" (regra 13). Num app de
 * leitura, três níveis de título viram indecisão — e H3 não é uma opção
 * escondida na interface, é um nível que o editor não tem.
 */
export function buildExtensions({
  noteSearch,
  onFiles,
  placeholder,
}: EditorExtensionOptions): Extensions {
  return [
    StarterKit.configure({ heading: { levels: [1, 2] } }),
    Placeholder.configure({ placeholder: placeholder ?? '' }),
    // `openOnClick: false`: dentro do editor o clique é para EDITAR o link, não
    // para sair da anotação pela metade.
    Link.configure({ openOnClick: false }),
    // `TextStyle`/`Color` ficam registrados e SEM UI (§6): o grifo já resolve o
    // caso de uso, e duas paletas na mesma barra confundem. Eles existem para
    // um documento que já tenha cor sobreviver ao round-trip.
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Details.configure({ persist: true }),
    DetailsSummary,
    DetailsContent,
    ...(noteSearch === undefined
      ? []
      : [createNoteMention(noteSearch), createNoteWikilink(noteSearch)]),
    // `allowBase64: false` é metade da regra do ADR 0001: nem base64 no parse,
    // nem `blob:` na inserção. A outra metade é o upload só inserir DEPOIS de
    // resolver.
    Image.configure({ allowBase64: false }),
    ...(onFiles === undefined ? [] : [ImageUpload.configure({ onFiles })]),
    // `resizable: false`: puxar borda de coluna com o dedo, no celular, é
    // impossível — e a tabela do editor é de 3 colunas.
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Callout,
    SlashCommand,
  ];
}

/** O alvo do sincronismo controlado — o editor visto por quem só precisa disto. */
export interface ContentSyncTarget {
  currentDoc: () => Record<string, unknown>;
  replaceContent: (doc: Record<string, unknown>) => void;
}

/**
 * O SINCRONISMO CONTROLADO, sem loop de eco (§7).
 *
 * ⚠️ O bug que ele evita, em ordem: a tela guarda o `doc` em estado, o editor
 * emite `onChange` a cada tecla, a tela re-renderiza com um objeto NOVO de
 * conteúdo igual, e o efeito manda o conteúdo de volta para o editor. Sem a
 * comparação isso é, no melhor caso, o cursor pulando para o começo da frase a
 * cada letra digitada; com `emitUpdate` ligado, é um laço infinito.
 *
 * A comparação é por VALOR (`JSON.stringify`) e não por identidade, porque
 * identidade é justamente o que muda a cada render da tela.
 *
 * Está fora do componente, com um port de duas funções, porque é a única forma
 * de PROVAR a propriedade: um fake com contador de chamadas
 * (`docs/CONVENCOES-CODIGO.md` §7.3) distingue "não chamou" de "chamou e não
 * mudou nada" — e é essa distinção, e só ela, que o mutante que apaga a
 * comparação rompe.
 */
export function syncEditorContent(
  target: ContentSyncTarget,
  incoming: Record<string, unknown> | undefined,
): void {
  if (incoming === undefined) return;
  if (JSON.stringify(target.currentDoc()) === JSON.stringify(incoming)) return;

  target.replaceContent(incoming);
}

type UploadState = 'idle' | 'uploading' | 'error';

/** A cor dinâmica da amostra de grifo: a ÚNICA exceção ao "sem CSS inline". */
type SwatchStyle = CSSProperties & Record<'--swatch', string>;

function swatchStyle(color: string): SwatchStyle {
  return { '--swatch': color };
}

interface ToolButtonProps {
  /** Vira `title` e `aria-label`: o mesmo texto, para o olho e para o leitor. */
  label: string;
  active?: boolean;
  onPress: () => void;
  children: ReactNode;
  /**
   * A caneta não acende o fundo quando está ligada — quem diz "esta é a cor de
   * agora" é o ANEL de ouro em volta da bolinha (`Dia.dc.html:106`). Pintar os
   * dois seria dizer a mesma coisa duas vezes, com duas cores diferentes.
   */
  plain?: boolean;
  /**
   * `aria-disabled`, nunca `disabled`: o botão `disabled` não recebe o
   * `mousedown`, o `preventDefault` abaixo não roda, o foco sai do ProseMirror
   * e o teclado do celular fecha. O handler continua lá; quem desiste é o
   * `onPress` da tela de cima, que sabe que não há o que fazer.
   */
  disabled?: boolean;
  /**
   * - `square` (o padrão): 44×44, o botão das fileiras de formatação;
   * - `bar`: 44 de altura e 36 de largura, o botão da pílula de rodapé;
   * - `pen`: 44 de altura e 32 de largura, a caneta da pílula.
   *
   * A largura menor da pílula é o que faz nove controles caberem num celular
   * de 360px sem rolar de lado; a ALTURA continua nos 44px do toque. Abaixo de
   * 360px (o iPhone SE de 320px) os dois estreitam mais um degrau — media
   * query, nunca um ramo.
   */
  shape?: 'square' | 'bar' | 'pen';
}

const TOOL_SHAPE = {
  square: 'size-11 rounded-control',
  bar: 'h-11 w-9 rounded-full max-[359px]:w-8',
  pen: 'h-11 w-8 rounded-full max-[359px]:w-7',
} as const;

/**
 * ⚠️ A REGRA QUE FAZ O EDITOR FUNCIONAR NO CELULAR (§4.4), e ela é a diferença
 * entre "gostei muito do editor" e "inutilizável".
 *
 * NENHUM botão do editor usa `onClick`. O `click` só nasce depois do
 * `mouseup`, e o `mousedown` que veio antes já tirou o foco do ProseMirror: a
 * seleção se perde e o TECLADO DO CELULAR FECHA a cada botão apertado. O
 * `preventDefault` no `mousedown` (e no `touchend`, para o toque não virar um
 * segundo evento) é o que impede o navegador de mover o foco.
 *
 * Isso vale para os botões do menu de bolha, para os do `Aa` e para as cinco
 * canetas — e há um teste ESTÁTICO que percorre o GRAFO DE MÓDULOS do editor,
 * porque essa é a regra que um refactor distraído desfaz.
 *
 * ⚠️ **44px DE ALVO, E ISSO APAGA UMA EXCEÇÃO EM VEZ DE CRIAR OUTRA.** Até a
 * Tarefa 43 eram ~~36px (2.25rem)~~, registrados como exceção consciente ao
 * piso de 44px da Tarefa 13: *"numa barra que precisa mostrar treze controles
 * na largura de um celular, 44px cortaria quatro deles"*. A barra de treze
 * controles morreu (decisão A) — o canvas desenha **sete** botões na fileira do
 * menu de bolha (`Dia.dc.html:65-71`, e o sétimo é o "Mais opções" que esta
 * fatia NÃO implementou) e **sete** na barra de canetas (`:105-124`), todos de
 * **44×44**. Sem a barra apertada não há o que justificar a exceção, e ela sai.
 *
 * ⚠️ A primeira redação dizia "**seis** no menu de bolha" citando `:65-71` —
 * que são **sete** linhas. O número dos controles IMPLEMENTADOS é seis; o do
 * canvas é sete. A citação e o número têm de falar da mesma coisa.
 */
function ToolButton({
  active = false,
  children,
  disabled,
  label,
  onPress,
  plain = false,
  shape = 'square',
}: ToolButtonProps) {
  return (
    <button
      aria-disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'flex shrink-0 items-center justify-center transition-colors',
        TOOL_SHAPE[shape],
        plain
          ? 'text-content'
          : active
            ? 'bg-accent-soft text-accent'
            : 'text-content hover:bg-surface-raised',
        'aria-disabled:cursor-default aria-disabled:text-subtle aria-disabled:hover:bg-transparent',
        FOCUS_RING,
      )}
      onMouseDown={(event) => {
        event.preventDefault();
        onPress();
      }}
      onTouchEnd={(event) => {
        event.preventDefault();
        onPress();
      }}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

/**
 * O filete vertical que separa os três grupos da pílula: ↶ ↷ · canetas · `Aa /`.
 *
 * ⚠️ **ERA UM SÓ, COM `ml-auto`, até 2026-10-06**: a faixa opaca ocupava a
 * largura toda e o `ml-auto` empurrava o `Aa` para a borda direita. A pílula
 * tem a largura do conteúdo (`w-fit`), então não há borda para onde empurrar —
 * o filete só separa.
 */
function ToolSeparator() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-5 w-px shrink-0 bg-line max-[359px]:mx-0.5"
      data-editor-separator=""
    />
  );
}

/**
 * QUANTO DO FUNDO DA JANELA O TECLADO COBRE — escrito como `--keyboard-inset`
 * no próprio nó da barra, que o `.clube-editor-dock` soma ao `bottom`.
 *
 * ⚠️ **É O ÚNICO JAVASCRIPT QUE MEDE JANELA NO EDITOR, e não é ramificação por
 * dispositivo:** o mesmo código roda em todo lugar, e no desktop (sem teclado
 * na tela) a conta dá zero. Ele existe porque CSS nenhum sabe a altura do
 * teclado no Safari: o teclado do celular encolhe só a janela VISUAL — a de
 * layout, onde `bottom` se mede, continua do tamanho da tela (iOS sempre;
 * Chrome do Android desde a 108, `interactive-widget=resizes-visual`). O
 * `env(keyboard-inset-height)` só existe no Chromium, e só com a VirtualKeyboard
 * API ligada.
 *
 * A conta: o que fica ABAIXO da janela visual — a altura da de layout menos a
 * altura da visual menos o quanto ela está rolada para baixo (`offsetTop`: o
 * iOS rola a visual dentro da de layout para mostrar o cursor).
 *
 * ⚠️ **ZOOM NÃO É TECLADO.** Com o dedo em pinça a janela visual também
 * encolhe, e a barra subiria até o meio da tela. `scale > 1` é zoom; o teclado
 * nunca muda a escala.
 *
 * ⚠️ `style.setProperty` no nó, e não `style={…}` no JSX: não é estilo que o
 * React desenha — é uma medição que muda a cada quadro da rolagem do iOS, e
 * passar por estado re-renderizaria o editor inteiro a cada evento.
 */
function useKeyboardInset(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  useEffect(() => {
    const node = target.current;
    // `in` antes de ler: navegador antigo (e o jsdom) nem tem a propriedade, e
    // aí a barra só fica no rodapé — que é o que ela fazia antes.
    if (!enabled || node === null || !('visualViewport' in window)) return;
    const viewport = window.visualViewport;
    if (viewport === null) return;

    const update = (): void => {
      const covered =
        viewport.scale > 1
          ? 0
          : window.innerHeight - viewport.height - viewport.offsetTop;
      node.style.setProperty(
        '--keyboard-inset',
        `${Math.max(0, Math.round(covered))}px`,
      );
    };

    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      node.style.removeProperty('--keyboard-inset');
    };
  }, [enabled, target]);
}

/**
 * O CONJUNTO COMPARTILHADO — renderizado pelo menu de bolha E pelo `Aa`.
 *
 * ⚠️ Ele é um componente, e não dois blocos de JSX, porque é isso que torna a
 * decisão E uma propriedade do CÓDIGO e não uma promessa: as duas âncoras
 * renderizam esta função e nada mais, e o acusador estrutural
 * (`pen-bar.test.tsx › keeps ONE list for the two anchors`) recusa um
 * `<ToolButton>` escrito dentro de qualquer uma delas.
 */
function FormatControls({ editor }: { editor: Editor }) {
  return (
    <>
      {FORMAT_CONTROLS.map((control) => (
        <ToolButton
          active={control.isActive(editor)}
          key={control.label}
          label={control.label}
          onPress={() => control.run(editor)}
        >
          <span aria-hidden="true" className={control.glyphClassName}>
            {control.glyph}
          </span>
        </ToolButton>
      ))}
    </>
  );
}

/**
 * AS CINCO CANETAS.
 *
 * ⚠️ **NÃO HÁ MAIS BORRACHA, e isso não é capacidade perdida — é a mesma
 * capacidade num gesto só.** O `toggleHighlight({ color })` do TipTap DESLIGA
 * quando aquela cor exata já está ligada, então apertar a caneta que está com o
 * anel tira o grifo. O canvas não desenha borracha em barra nenhuma
 * (`Dia.dc.html:103-126`, `DiaDesktop.dc.html:72-93`), e um sexto botão "sem
 * cor" ao lado de cinco cores é justamente o tipo de controle que ninguém
 * encontra. O acusador do gesto está em `rich-editor.test.tsx`.
 *
 * ⚠️ **O LIMITE DO GESTO, declarado:** com o **cursor colapsado** (sem seleção)
 * o `toggleMark` do TipTap não estende a marca sozinho — `extendEmptyMarkRange`
 * é `false` por padrão —, então apertar a caneta ligada não tira nada e o
 * `aria-pressed` continua dizendo "ligada". **Não é regressão:** a borracha
 * antiga (`unsetHighlight`) tinha exatamente o mesmo limite. A diferença é que
 * agora este é o ÚNICO caminho, e por isso ele fica escrito.
 *
 * ⚠️ **E A AMOSTRA CONTINUA PINTADA COM O `--swatch`, NÃO COM `--pen-a`.** O
 * canvas pinta as bolinhas com os tokens de caneta, e aqui isso seria MENTIRA:
 * dentro do editor o grifo é um `mark` que carrega o `rgba` no próprio
 * documento, então a amostra tem de mostrar a cor que a caneta de fato aplica.
 * Os tokens `--pen-*` pintam a entidade `Highlight` (o `GrifoText` da Tarefa
 * 41b), que é outra coisa. Divergência declarada, e ela protege **um**
 * acusador: o `highlight-palette.test.tsx`, cujos sete `it()` leem a cor REAL
 * pelo `--swatch` do DOM.
 *
 * ⚠️ **A PRIMEIRA ENTREGA DESTA FATIA DIZIA "DOIS", contando o espelho do ADR
 * 0004 de `packages/shared` — e ele NÃO acusa.** Medido com o mutante que
 * troca a amostra por `bg-pen-a` e tira o `style`: `@clube/ui` dá **7**
 * vermelhos (todos em `highlight-palette.test.tsx`) e `@clube/shared` fica
 * **601/601 verde**, porque aquele espelho lê os literais `rgba` do **FONTE**
 * deste arquivo, nunca o `--swatch` do DOM. A decisão de manter o `--swatch`
 * continua certa; o argumento é que estava pela metade.
 */
function PenControls({ editor }: { editor: Editor }) {
  return (
    <>
      {HIGHLIGHT_COLORS.map(({ color, label }) => (
        <ToolButton
          active={editor.isActive('highlight', { color })}
          key={color}
          label={label}
          onPress={() =>
            editor.chain().focus().toggleHighlight({ color }).run()
          }
          plain
          shape="pen"
        >
          <span
            aria-hidden="true"
            className="clube-editor-swatch size-[18px] rounded-full"
            data-editor-pen=""
            style={swatchStyle(color)}
          />
        </ToolButton>
      ))}
    </>
  );
}

/**
 * ============================================================================
 * A BARRA DE CANETAS — a pílula do rodapé (pedido do dono, 2026-10-06)
 * ============================================================================
 *
 * Três grupos numa pílula só, da esquerda para a direita:
 *
 *   ↶ ↷  ·  cinco canetas  ·  Aa  /
 *
 * ⚠️ **ELA NASCEU NA TAREFA 43 COMO FAIXA OPACA** (`Dia.dc.html:103`: 62px,
 * `border-top`, a largura toda) e passou por uma pílula NO TOPO que
 * acompanhava a rolagem. O dono pediu o rodapé — perto do polegar, logo acima
 * do teclado —, mais compacta, e as duas setas de desfazer e refazer. O que os
 * artboards desenhavam da faixa (a altura de 62/56px, o `ml-auto` que jogava o
 * `Aa` para a borda) morreu com ela.
 *
 * ⚠️ **`sticky` E NÃO `fixed`, e é isso que a faz servir às duas larguras sem
 * ramo:** presa ao fundo da janela enquanto há texto abaixo, pousada no fim da
 * anotação quando a pessoa chega lá, e sempre centrada na COLUNA do texto — no
 * desktop, com a margem de 320px à direita, um `fixed` centraria na janela e
 * ficaria torto em relação ao texto.
 *
 * ⚠️ **O NÓ FICA SEMPRE MONTADO — é a invariante da §11**, e a barra entra
 * nessa conta desde o dia em que nasceu. O que é condicional é o CONTEÚDO (e as
 * classes). Explicação inteira no `return` do `RichEditor`.
 *
 * ⚠️ **E O `/` NÃO REIMPLEMENTA O MENU `/`** (decisão F): ele insere o
 * caractere, e a extensão `Suggestion` de `slash-command.ts` faz o resto. O
 * botão existe para quem está com o teclado do celular aberto e não quer
 * procurar a tecla.
 */
function PenBar({
  editable,
  editor,
  placement,
  redoLabel,
  slashHintLabel,
  undoLabel,
}: {
  editable: boolean;
  editor: Editor;
  placement: PenBarPlacement;
  redoLabel?: string;
  slashHintLabel?: string;
  undoLabel?: string;
}) {
  const [formatOpen, setFormatOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const active = editable && placement !== 'none';
  useKeyboardInset(barRef, active);

  const canUndo = active && editor.can().undo();
  const canRedo = active && editor.can().redo();

  return (
    <div
      className={cx(
        active &&
          'clube-editor-dock sticky z-20 mt-3 flex h-12 w-fit max-w-[calc(100vw-1rem)] shrink-0 items-center self-center rounded-full border border-line-soft bg-surface/90 px-1 shadow-popover backdrop-blur-xl backdrop-saturate-150',
      )}
      data-editor-pen-bar=""
      ref={barRef}
    >
      {active ? (
        <>
          {undoLabel === undefined && redoLabel === undefined ? null : (
            <>
              {undoLabel === undefined ? null : (
                <ToolButton
                  disabled={!canUndo}
                  label={undoLabel}
                  onPress={() => {
                    if (canUndo) editor.chain().focus().undo().run();
                  }}
                  shape="bar"
                >
                  <Undo2 aria-hidden="true" className="size-[18px]" />
                </ToolButton>
              )}
              {redoLabel === undefined ? null : (
                <ToolButton
                  disabled={!canRedo}
                  label={redoLabel}
                  onPress={() => {
                    if (canRedo) editor.chain().focus().redo().run();
                  }}
                  shape="bar"
                >
                  <Redo2 aria-hidden="true" className="size-[18px]" />
                </ToolButton>
              )}
              <ToolSeparator />
            </>
          )}
          <PenControls editor={editor} />
          <ToolSeparator />
          <ToolButton
            active={formatOpen}
            label="Formatar o texto"
            onPress={() => setFormatOpen((open) => !open)}
            shape="bar"
          >
            <span aria-hidden="true" className="font-reading text-base">
              Aa
            </span>
          </ToolButton>
          {/*
            No desktop a dica escrita ocupa o lugar deste botão
            (`DiaDesktop.dc.html:92`): lá há teclado físico. Media query, nunca
            um ramo.
          */}
          <span className="flex min-[1120px]:hidden">
            <ToolButton
              label="Abrir o menu de blocos"
              onPress={() => editor.chain().focus().insertContent('/').run()}
              shape="bar"
            >
              <span aria-hidden="true" className="font-mono text-base">
                /
              </span>
            </ToolButton>
          </span>
          {slashHintLabel === undefined ? null : (
            <span
              className="hidden whitespace-nowrap pl-1 pr-3 font-mono text-eyebrow tracking-[0.08em] text-subtle min-[1120px]:block"
              data-editor-slash-hint=""
            >
              {slashHintLabel}
            </span>
          )}
          {formatOpen ? (
            <div
              className="clube-editor-popover clube-editor-row absolute bottom-full right-0 mb-2 flex items-center overflow-hidden"
              data-editor-format=""
            >
              <FormatControls editor={editor} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function RichEditor({
  className,
  doc,
  editable = true,
  noteSearch,
  onChange,
  onOpenNoteLink,
  onUploadImage,
  penBar = 'none',
  placeholder,
  redoLabel,
  slashHintLabel,
  undoLabel,
  uploadFailedLabel = 'Falha ao enviar',
  uploadingLabel = 'Enviando imagem…',
}: RichEditorProps) {
  const [uploadState, setUploadState] = useState<UploadState>('idle');

  /**
   * Os callbacks da tela num ref, e o editor criado UMA vez.
   *
   * Numa tela real toda prop de função é uma arrow nova a cada render. Se elas
   * entrassem na criação do editor, cada render recriaria o ProseMirror — o
   * conteúdo digitado voltaria ao valor inicial e o cursor sumiria.
   */
  const editorRef = useRef<Editor | null>(null);
  const handlers = useRef({
    noteSearch,
    onChange,
    onOpenNoteLink,
    onUploadImage,
  });
  handlers.current = { noteSearch, onChange, onOpenNoteLink, onUploadImage };

  /**
   * O que fazer com os arquivos que o paste/drop/seletor entregou.
   *
   * A ordem é a do ADR 0001, e ela não pode mudar: sobe UM arquivo, espera a
   * URL FINAL, e só então insere o nó. Nada de `blob:`/`data:` no documento em
   * momento nenhum — o `doc` vai para o banco, e URL temporária gravada lá
   * quebra em qualquer outro aparelho.
   */
  const handleFiles = useCallback((files: File[], position?: number): void => {
    const upload = handlers.current.onUploadImage;
    const editor = editorRef.current;
    if (upload === undefined || editor === null) return;

    // A primeira imagem entra ONDE foi solta; as seguintes, onde o cursor
    // parou depois da anterior.
    let at = position;

    setUploadState('uploading');
    void uploadImageFiles(files, {
      upload,
      insert: (src) => {
        const node = { type: 'image', attrs: { src } };
        if (at === undefined) {
          editor.chain().focus().insertContent(node).run();
        } else {
          editor.chain().focus().insertContentAt(at, node).run();
          at = undefined;
        }
      },
    })
      .then(() => setUploadState('idle'))
      .catch(() => setUploadState('error'));
  }, []);

  const hasNoteSearch = noteSearch !== undefined;
  const hasUpload = onUploadImage !== undefined;

  /**
   * As extensões dependem só das CAPACIDADES (existe busca? existe upload?),
   * nunca da identidade das funções — senão o editor seria recriado a cada
   * render da tela.
   */
  const extensions = useMemo(
    () =>
      buildExtensions({
        placeholder,
        noteSearch: hasNoteSearch
          ? (query) =>
              handlers.current.noteSearch?.(query) ?? Promise.resolve([])
          : undefined,
        onFiles: hasUpload ? handleFiles : undefined,
      }),
    [handleFiles, hasNoteSearch, hasUpload, placeholder],
  );

  const editor = useEditor(
    {
      extensions,
      content: doc,
      editable,
      editorProps: {
        /**
         * O clique numa menção/wikilink NAVEGA (§3) — e quem sabe para onde é a
         * tela. `handleClickOn` e não um `onClick` no nó: o nó é renderizado
         * pelo ProseMirror, não pelo React.
         */
        handleClickOn: (_view, _pos, node) => {
          const open = handlers.current.onOpenNoteLink;
          if (open === undefined) return false;
          if (node.type.name !== 'mention' && node.type.name !== 'wikilink') {
            return false;
          }

          const id: unknown = node.attrs['id'];
          if (typeof id !== 'string' || id === '') return false;

          open(id);
          return true;
        },
      },
      onUpdate: ({ editor: current }) => {
        // ProseMirror JSON, nunca HTML (ADR 0001): `getHTML()` é lossy na volta
        // e um bug de `parseHTML` corromperia calado uma anotação antiga.
        handlers.current.onChange(current.getJSON());
      },
    },
    [extensions],
  );

  editorRef.current = editor;

  /*
    `editable` muda sem recriar o editor: recriar perderia o conteúdo digitado.

    ⚠️ MEDIDO NESTA FATIA, e é uma armadilha do TipTap que o `EDITOR.md` não
    prevê: `setEditable(x)` EMITE um `update` mesmo quando nada mudou (o
    segundo parâmetro é `emitUpdate` e vale `true` por padrão). Um
    `editor.setEditable(editable)` solto no efeito de montagem fazia o editor
    chamar `onChange` com o documento INTACTO no primeiro render — o que, na
    tela da Tarefa 18, é um autosave disparado só por abrir a anotação.

    Daí as duas metades, e cada uma tem seu acusador em
    `__tests__/rich-editor.test.tsx`: só chama quando o valor realmente muda
    (`emits nothing just for being mounted`), e chama com `emitUpdate`
    DESLIGADO (`emits nothing when the screen only flips editable`), porque
    mudar a permissão de escrita não é mudar o conteúdo. Quem mostra ou esconde
    a barra é a prop `editable`, no render, e não este evento.
  */
  useEffect(() => {
    if (editor === null || editor.isEditable === editable) return;
    editor.setEditable(editable, false);
  }, [editable, editor]);

  useEffect(() => {
    if (editor === null) return;

    syncEditorContent(
      {
        currentDoc: () => editor.getJSON(),
        // O `false` é `emitUpdate`: sem ele, mandar conteúdo para o editor
        // dispara `onUpdate` → `onChange` → a tela re-renderiza → e o laço
        // fecha (acusador: `emits nothing when the screen loads a doc by
        // prop`). ~~Ele também evita uma entrada no histórico~~ — não evitava.
        //
        // ⚠️ POR ISSO O `addToHistory: false` (2026-10-06): o `emitUpdate` NÃO tira o
        // carregamento do histórico — medido, ele entrava. Com o ↶ à vista na
        // barra, um toque logo depois de abrir a anotação apagava a nota
        // carregada, e o autosave gravava o vazio. Acusador: `pen-bar.test.tsx
        // › never undoes the LOADING of the note`.
        replaceContent: (incoming) =>
          editor
            .chain()
            .setMeta('addToHistory', false)
            .setContent(incoming, false)
            .run(),
      },
      doc,
    );
  }, [doc, editor]);

  if (editor === null) return null;

  return (
    <div className={cx('relative flex flex-col', className)}>
      {/*
        ⚠️ A INVARIANTE DE MONTAGEM DA §11, E ELA VALE PARA AS TRÊS SUPERFÍCIES:
        NENHUM NÓ IRMÃO DESTE CONTAINER MONTA OU DESMONTA. O que é condicional é
        sempre o CONTEÚDO, nunca o nó.

        Por quê: o TipTap DESTACA o elemento do bubble menu deste container
        (`element.remove()` no construtor do `BubbleMenuView`, medido na 2.27.3
        — é o TipTap, não o tippy) e o entrega ao tippy, que o reparenteia para
        o `body`. O React continua acreditando que ele é filho daqui. A partir
        disso, DUAS DIREÇÕES quebram, e as duas são `NotFoundError`:

        - desmontar o próprio nó reparenteado → `removeChild` num nó que já não
          é filho. Foi o que acontecia ao trocar `editable` para `false`: o
          `{editable ? <BubbleMenu/> : null}` matava a tela ao virar
          somente-leitura;
        - montar um irmão ANTES dele → `insertBefore` usando o nó reparenteado
          como referência. Era o que a barra faria ao voltar para `editable`,
          se ela continuasse condicional.

        Daí o bubble menu (sempre montado, conteúdo condicional), a BARRA DE
        CANETAS (sempre montada, conteúdo e classes condicionais) e o wrapper da
        pílula de upload (sempre montado, pílula condicional).

        ⚠️ **A BARRA DE CANETAS DA TAREFA 43 ENTRA NESTA CONTA POR CONSTRUÇÃO**
        (decisão J), e ela entra no lugar da barra fixa do topo, que morreu. A
        forma `penBar='none'` — que é o PADRÃO — não desmonta o nó: ela esvazia
        o conteúdo. O acusador é `rich-editor-image.test.tsx › never mounts or
        unmounts a sibling, in any state`, que agora percorre também as três
        formas de `penBar`.

        E o bubble menu não precisa de lógica nenhuma para ficar invisível em
        leitura: o `shouldShow` default do `BubbleMenuPlugin` devolve `false`
        quando `!editor.isEditable` (medido).

        Os acusadores: `rich-editor.test.tsx` (o `rerender` de `editable` nas
        duas direções) e `rich-editor-image.test.tsx` (o paste de imagem com o
        bubble menu montado + a invariante do wrapper).
      */}
      {/*
        ⚠️ **A BARRA FIXA DO TOPO MORREU AQUI (decisão A da Tarefa 43).** Ela
        era `<div data-editor-bar>` com treze controles, GRUDADA no topo, scroll
        lateral e fundo desfocado. O canvas põe o texto direto no papel
        (`Dia.dc.html:59`) e deixa a formatação onde ela é pedida: no menu de
        bolha, sobre a seleção. O que fica fixo na tela são as CANETAS, que
        marcam — e marcar é o gesto que a leitura pede, não estruturar.
      */}
      <BubbleMenu
        className="flex flex-col items-center"
        editor={editor}
        tippyOptions={{ duration: 120 }}
      >
        {editable ? (
          <>
            {/*
              O papel, a borda, o raio e a sombra do canvas
              (`Dia.dc.html:64`), com os separadores entre os botões
              (`border-right: 1px solid var(--border-soft)` em cada um menos o
              último, `:65-71`) no `.clube-editor-row`.
            */}
            <div className="clube-editor-popover clube-editor-row flex items-center overflow-hidden">
              <FormatControls editor={editor} />
            </div>
            {/*
              A seta de 12×7 que aponta para a palavra selecionada
              (`Dia.dc.html:73`): um quadrado girado 45°, com duas bordas, subido
              4px para encostar no papel. É decoração — `aria-hidden`.
            */}
            <span aria-hidden="true" className="clube-editor-arrow" />
          </>
        ) : null}
      </BubbleMenu>

      <EditorContent editor={editor} />

      <PenBar
        editable={editable}
        editor={editor}
        placement={penBar}
        {...(slashHintLabel === undefined ? {} : { slashHintLabel })}
        {...(undoLabel === undefined ? {} : { undoLabel })}
        {...(redoLabel === undefined ? {} : { redoLabel })}
      />

      <div
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center"
        data-editor-status=""
      >
        {uploadState === 'idle' ? null : (
          <span
            className="clube-editor-pill px-3 py-1 text-sm"
            data-state={uploadState === 'error' ? 'error' : 'uploading'}
          >
            {uploadState === 'error' ? uploadFailedLabel : uploadingLabel}
          </span>
        )}
      </div>
    </div>
  );
}
