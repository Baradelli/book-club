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
import {
  Bold,
  Code,
  Eraser,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
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
 * `isMobile`, não há media query escondendo botão. A adequação ao celular é
 * ESTRUTURAL: alvos de toque de 36px, barra que rola de lado, `sticky` no topo
 * e o `preventDefault` da §4.4. É o que faz um componente só servir os dois
 * tamanhos — `CLAUDE.md`: "UM shell, não dois".
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
 */
const HIGHLIGHT_COLORS = [
  { color: 'rgba(250, 204, 21, 0.40)', label: 'Grifo amarelo' },
  { color: 'rgba(34, 197, 94, 0.35)', label: 'Grifo verde' },
  { color: 'rgba(249, 115, 22, 0.40)', label: 'Grifo laranja' },
  { color: 'rgba(59, 130, 246, 0.35)', label: 'Grifo azul' },
  { color: 'rgba(236, 72, 153, 0.35)', label: 'Grifo rosa' },
] as const;

/** O tamanho do ícone da barra (§4.1). */
const ICON_SIZE = 17;
const ICON_STROKE = 1.85;

export interface RichEditorProps {
  /** ProseMirror JSON (ADR 0001), nunca HTML. */
  doc?: Record<string, unknown>;
  /** Já traduzido pela tela: `t('editor.placeholder')`. */
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
   * deixaria de valer para ele). As chaves existem nos dois catálogos:
   * `editor.image.uploading` e `editor.image.uploadFailed`.
   *
   * O default é português, como todo rótulo interno do editor (§10): assim uma
   * tela que esqueça de passar mostra a frase certa em vez de vazio.
   */
  uploadingLabel?: string;
  uploadFailedLabel?: string;
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
}

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
 * Isso vale para os botões da barra, para os do bubble menu e para as amostras
 * de cor — e há um teste ESTÁTICO varrendo TODO arquivo de `components/` que
 * renderize `<button`, porque essa é a regra que um refactor distraído desfaz.
 *
 * 36px de alvo (2.25rem), como o §4.1 manda. É menos que o piso de 44px da
 * Tarefa 13, e é uma exceção CONSCIENTE: numa barra que precisa mostrar treze
 * controles na largura de um celular, 44px cortaria quatro deles — e o
 * `EDITOR.md` vence dentro do editor.
 */
function ToolButton({
  active = false,
  children,
  label,
  onPress,
}: ToolButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={cx(
        'flex size-9 shrink-0 items-center justify-center rounded-control transition-colors',
        active
          ? 'bg-accent-soft text-accent'
          : 'text-muted hover:bg-surface hover:text-content',
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

function ToolSeparator() {
  return (
    <span
      aria-hidden="true"
      className="mx-1 h-6 w-px shrink-0 bg-line"
      data-editor-separator=""
    />
  );
}

/** As amostras de grifo + a borracha. Iguais na barra e no bubble menu. */
function HighlightControls({ editor }: { editor: Editor }) {
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
        >
          <span
            aria-hidden="true"
            className="clube-editor-swatch size-5 rounded-full"
            style={swatchStyle(color)}
          />
        </ToolButton>
      ))}
      <ToolButton
        label="Remover grifo"
        onPress={() => editor.chain().focus().unsetHighlight().run()}
      >
        <Eraser
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
    </>
  );
}

/**
 * O CONTEÚDO da barra fixa (§4.1): negrito · itálico · código ｜ H1 · H2 ｜
 * citação · lista · lista numerada · bloco de código · divisória ｜ as cinco
 * amostras de grifo + a borracha.
 *
 * Ele está num componente próprio, e não inline no `RichEditor`, porque o nó
 * da barra fica SEMPRE montado (a invariante da §11, explicada no `return` do
 * `RichEditor`) e só o conteúdo é condicional.
 */
function EditorToolbar({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolButton
        active={editor.isActive('bold')}
        label="Negrito"
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('italic')}
        label="Itálico"
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('code')}
        label="Código"
        onPress={() => editor.chain().focus().toggleCode().run()}
      >
        <Code
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>

      <ToolSeparator />

      <ToolButton
        active={editor.isActive('heading', { level: 1 })}
        label="Título 1"
        onPress={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('heading', { level: 2 })}
        label="Título 2"
        onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>

      <ToolSeparator />

      <ToolButton
        active={editor.isActive('blockquote')}
        label="Citação"
        onPress={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('bulletList')}
        label="Lista"
        onPress={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('orderedList')}
        label="Lista numerada"
        onPress={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('codeBlock')}
        label="Bloco de código"
        onPress={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <SquareCode
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        label="Divisória"
        onPress={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>

      <ToolSeparator />

      <HighlightControls editor={editor} />
    </>
  );
}

/**
 * O CONTEÚDO do bubble menu (§4.2): na seleção o que se quer é MARCAR, não
 * estruturar — então aqui só entra o subconjunto (negrito, itálico, as cinco
 * cores e a borracha). Título e lista continuam na barra.
 */
function BubbleControls({ editor }: { editor: Editor }) {
  return (
    <>
      <ToolButton
        active={editor.isActive('bold')}
        label="Negrito"
        onPress={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <ToolButton
        active={editor.isActive('italic')}
        label="Itálico"
        onPress={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic
          aria-hidden="true"
          focusable="false"
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE}
        />
      </ToolButton>
      <HighlightControls editor={editor} />
    </>
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
  placeholder,
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
        // prop`). Ele também evita uma entrada no histórico para algo que a
        // pessoa não digitou — com `true`, o `Ctrl+Z` DESFAZ o carregamento da
        // anotação.
        replaceContent: (incoming) =>
          editor.commands.setContent(incoming, false),
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

        Daí a barra (nó sempre montado, classes e conteúdo condicionais), o
        bubble menu (sempre montado, conteúdo condicional) e o wrapper da
        pílula de upload (sempre montado, pílula condicional).

        E o bubble menu não precisa de lógica nenhuma para ficar invisível em
        leitura: o `shouldShow` default do `BubbleMenuPlugin` devolve `false`
        quando `!editor.isEditable` (medido).

        Os acusadores: `rich-editor.test.tsx` (o `rerender` de `editable` nas
        duas direções) e `rich-editor-image.test.tsx` (o paste de imagem com o
        bubble menu montado + a invariante do wrapper).
      */}
      <div
        className={cx(
          editable &&
            'clube-editor-bar no-scrollbar sticky top-0 z-10 flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 py-1.5',
        )}
        data-editor-bar=""
      >
        {editable ? <EditorToolbar editor={editor} /> : null}
      </div>

      <BubbleMenu
        className="clube-editor-popover flex items-center gap-0.5 p-1"
        editor={editor}
        tippyOptions={{ duration: 120 }}
      >
        {editable ? <BubbleControls editor={editor} /> : null}
      </BubbleMenu>

      <EditorContent editor={editor} />

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
