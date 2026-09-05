# EDITOR.md — Spec do editor de texto (a peça central)

> Este documento existe porque o editor **já está aprovado**: ele foi construído e usado em
> outro projeto do dono, e a experiência dele — a barra auxiliar, o menu `/`, os grifos
> coloridos, e o fato de funcionar bem no celular — é justamente o motivo deste projeto
> nascer. Reimplementar "um editor TipTap" do zero produziria algo pior. **Siga esta spec.**
>
> Aqui mora o **como**. A ordem em que o editor entra está em `docs/BACKLOG.md` (Tarefa 14).
> As regras gerais do projeto estão em `CLAUDE.md`.

---

## 1. Onde o editor vive

**Um único componente, em `packages/ui`.** É o único pacote que depende de TipTap — o
`packages/app` não deve ter nenhum `@tiptap/*` no `package.json` dele.

```
packages/ui/src/
  components/
    RichEditor.tsx        # o editor: useEditor, extensões, barra, bubble menu, drag handle
    slash-command.ts      # extensão do menu "/" (Suggestion com char '/')
    SlashMenu.tsx         # popup React do menu "/"
    note-mention.ts       # extensões de menção @ e wikilink [[
    MentionList.tsx       # popup React das menções
    callout.ts            # Node customizado "Aviso"
    image-upload.ts       # Extension de upload por paste/drop/picker
    __tests__/
      rich-editor-image.test.tsx
      image-upload.test.ts
      tippy-fake.ts
  editor.css              # todo o CSS do ProseMirror (exportado como @clube/ui/editor.css)
```

`packages/ui/package.json` exporta o CSS como subpath:

```json
"exports": {
  ".": "./src/index.ts",
  "./theme.css": "./src/theme.css",
  "./editor.css": "./src/editor.css"
}
```

e o app importa no seu `index.css`:

```css
@import 'tailwindcss';
@import '@clube/ui/theme.css';
@import '@clube/ui/editor.css';
@source "../../ui/src";   /* para o Tailwind v4 varrer as classes dos componentes */
```

`react`, `react-dom` e `react-router-dom` são **peerDependencies** em `packages/ui`.

---

## 2. Dependências

Todas as versões `^2.10.0` (a mesma linha, para não misturar core e extensões):

`@tiptap/core` · `@tiptap/pm` · `@tiptap/react` · `@tiptap/starter-kit` ·
`@tiptap/suggestion`

Extensões: `extension-color` · `extension-text-style` · `extension-highlight` ·
`extension-link` · `extension-placeholder` · `extension-image` · `extension-mention` ·
`extension-task-list` · `extension-task-item` · `extension-details` ·
`extension-details-content` · `extension-details-summary` · `extension-table` ·
`extension-table-row` · `extension-table-header` · `extension-table-cell` ·
`extension-drag-handle-react`

Mais: `tippy.js ^6.3.7` (posicionamento dos popups) · `lucide-react` (ícones) ·
`react-i18next`.

---

## 3. A interface pública (`RichEditorProps`)

**Props são a única superfície de injeção.** O editor não importa cliente HTTP, não conhece
rota e não sabe o que é uma "nota" — quem sabe é a tela.

```ts
export interface RichEditorProps {
  doc?: Record<string, unknown>;                       // ProseMirror JSON
  placeholder?: string;
  onChange: (doc: Record<string, unknown>) => void;
  editable?: boolean;
  className?: string;

  // capability-gated: a extensão só é registrada se a prop existir
  noteSearch?: (query: string) => Promise<NoteSuggestion[]>;
  onOpenNoteLink?: (id: string) => void;
  onUploadImage?: (file: File) => Promise<string>;      // devolve a URL final
}
```

**Extensões condicionais** — o padrão que mantém o editor leve onde não precisa:

- `noteSearch` ausente → nada de menção `@` nem wikilink `[[`.
- `onUploadImage` ausente → nada de upload (mas o nó `image` continua registrado, para que
  documentos antigos com imagem **renderizem** normalmente).

Montagem das extensões:

```ts
extensions: [
  StarterKit.configure({ heading: { levels: [1, 2] } }),   // só H1/H2, de propósito
  Placeholder.configure({ placeholder }),
  Link.configure({ openOnClick: false }),
  TextStyle, Color,
  Highlight.configure({ multicolor: true }),
  TaskList, TaskItem.configure({ nested: true }),
  Details.configure({ persist: true }), DetailsSummary, DetailsContent,
  ...(noteSearch ? [createNoteMention(noteSearch), createNoteWikilink(noteSearch)] : []),
  Image.configure({ allowBase64: false }),
  ...(onUploadImage ? [ImageUpload.configure({ upload: wrappedUpload })] : []),
  Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
  Callout,
  SlashCommand,
]
```

Só H1 e H2: num app de leitura, três níveis de título viram indecisão.

Clique em menção/wikilink é tratado por `editorProps.handleClickOn` — se o nó for `mention`
ou `wikilink`, chama `onOpenNoteLink(node.attrs.id)` e devolve `true`.

---

## 4. As três superfícies de UI

Todas renderizadas **apenas quando `editable`**.

### 4.1 Barra fixa (a "barra que auxilia")

Uma faixa horizontal grudada no topo do editor, com scroll lateral quando não cabe:

```tsx
className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 py-1.5"
style={{
  backgroundColor: 'color-mix(in srgb, var(--clube-bg) 80%, transparent)',
  borderBottom: '1px solid var(--clube-border)',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  position: 'sticky', top: 0, zIndex: 10,
}}
```

Botões, nesta ordem, com separadores: **negrito · itálico · código inline** ｜ **H1 · H2** ｜
**citação · lista · lista numerada · bloco de código · divisória** ｜ **5 amostras de grifo +
remover grifo**.

Ícones `lucide-react` a `size={17} strokeWidth={1.85}`; cada botão **2.25rem × 2.25rem**
(36 px — alvo de toque confortável).

### 4.2 Bubble menu (na seleção)

`<BubbleMenu editor={editor} tippyOptions={{ duration: 120 }}>` com o **subconjunto**:
negrito · itálico · as 5 cores de grifo · remover grifo. Nada mais — na seleção, o que se
quer é marcar, não estruturar.

Estilo pelos tokens: `--clube-card`, `--clube-border`, `--clube-shadow-lg`.

### 4.3 Drag handle

`@tiptap/extension-drag-handle-react` com um ícone `GripVertical` e
`aria-label="Arrastar bloco"`.

### 4.4 A regra que faz tudo funcionar no celular

**Nenhum botão do editor usa `onClick`.** Todos usam:

```tsx
onMouseDown={(e) => { e.preventDefault(); onPress(); }}
onTouchEnd={(e) => { e.preventDefault(); onPress(); }}
```

Sem o `preventDefault()`, o toque tira o foco do ProseMirror: a seleção se perde e **o
teclado do celular fecha** a cada botão apertado. Esse detalhe é a diferença entre "gostei
muito do editor" e "inutilizável no celular". Vale para os botões da barra, do bubble menu e
para as amostras de cor.

Acessibilidade: `aria-pressed={active}` + `title`/`aria-label` em todos. Estado ativo com
`--clube-accent-soft` / `--clube-accent`.

Espaço para o teclado, em `editor.css`:

```css
.ProseMirror { min-height: 60vh; padding: 1.5rem 1.5rem 7rem; }
```

As `7rem` de baixo garantem que a última linha não fique embaixo do teclado.

> **Não há nenhuma ramificação por dispositivo** — nem `userAgent`, nem `isMobile`, nem
> media query escondendo botões. A adequação ao celular é estrutural: alvos de 36 px, barra
> com scroll lateral, `sticky top: 0` e o truque do `preventDefault`. É o que permite um
> componente só servir os dois tamanhos.

---

## 5. O menu `/`

Uma `Extension` cujo `addProseMirrorPlugins()` devolve **um** `Suggestion`:

```ts
export const SlashCommand = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        command: ({ editor, range, props }) => props.run(editor, range),
        items: ({ query, editor }) =>
          itemsFor(editor)
            .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 8),
        render: () => { /* ReactRenderer(SlashMenu) + tippy('body', { placement: 'bottom-start' }) */ },
      }),
    ];
  },
});
```

O item é o contrato mais simples possível:

```ts
interface SlashItem {
  title: string;
  run: (editor: Editor, range: Range) => void;   // sempre começa com deleteRange(range)
}
```

**Itens** (rótulos em pt, mesma convenção dos tooltips da barra):
Texto · Título 1 · Título 2 · Lista · Lista numerada · Citação · Tarefas · Código ·
Alternável · Divisória · Tabela (3×3 com cabeçalho) · Aviso — e **Imagem**, acrescentado
**condicionalmente**:

```ts
function itemsFor(editor: Editor) {
  const storage = editor.storage as Record<string, unknown>;
  return storage['imageUpload'] ? [...ITEMS, IMAGE_ITEM] : ITEMS;
}
```

`ImageUpload.addStorage()` devolve `{ enabled: true }`, e é isso que serve de feature flag —
o menu não precisa receber prop nenhuma para saber se pode oferecer imagem.

`SlashMenu.tsx` é um `forwardRef` que expõe `onKeyDown`: ↑/↓ **com wrap-around**, Enter
confirma. `Escape` é tratado na extensão, escondendo o popup do tippy. `useEffect` reseta a
seleção para 0 quando a lista de itens muda. Os botões usam `onMouseDown` +
`preventDefault()` (mesma razão da §4.4).

O mesmo padrão de `render()` é reaproveitado pelos popups de menção — extraia uma fábrica
`suggestionRender()` compartilhada.

---

## 6. Grifos dentro do editor

`Highlight.configure({ multicolor: true })` + `TextStyle` + `Color`.

A paleta é uma constante do módulo, deliberadamente em **rgba com alpha** para o texto
continuar legível no tema claro e no escuro:

```ts
const HIGHLIGHT_COLORS = [
  'rgba(250, 204, 21, 0.40)', // amarelo
  'rgba(34, 197, 94, 0.35)',  // verde
  'rgba(249, 115, 22, 0.40)', // laranja
  'rgba(59, 130, 246, 0.35)', // azul
  'rgba(236, 72, 153, 0.35)', // rosa
] as const;
```

Aplica com `toggleHighlight({ color })`, limpa com `unsetHighlight()`, estado ativo por
`editor.isActive('highlight', { color })`. A amostra é um círculo de 20 px cujo contorno
vira `--clube-fg` quando ativo.

`Color`/`TextStyle` ficam registrados mas **sem UI** — não expor cor de texto; grifo já
resolve o caso de uso e duas paletas confundem.

> **Não confundir com a entidade `Highlight`** (MVP 2). Essa paleta é do editor — marcar
> texto dentro de uma anotação. A entidade `Highlight` é o registro de um grifo feito no
> livro físico. São coisas diferentes que usam as mesmas cores; mantenha os hex espelhados
> para não parecer bug.

---

## 7. Persistência

**Formato: ProseMirror JSON, nunca HTML.** → `docs/adr/0001-*.md`.

- `onUpdate({ editor }) { onChange(editor.getJSON() as Record<string, unknown>) }`
- Sincronização controlada, para não entrar em loop de eco: um efeito compara
  `JSON.stringify(editor.getJSON())` com o `doc` que chegou por prop e só então chama
  `editor.commands.setContent(doc, false)` — o `false` evita criar entrada no histórico.
- **Autosave na tela** (não no editor): debounce de **1500 ms**, com
  `SaveStatus = 'idle' | 'saving' | 'saved' | 'queued' | 'error'` e um indicador discreto.
  `saved` volta para `idle` depois de 2000 ms. `queued` é o estado offline ("Salvo no
  aparelho").
- **Offline (Tarefa 21):** grava o rascunho local **antes** de tentar a rede, e só limpa o
  rascunho quando a escrita chega ao servidor. No carregamento, **o rascunho local tem
  precedência** sobre o `doc` do servidor.
- `plainText` é derivado **no backend** por `docToText()` (Tarefa 09) e nunca entra no input
  da API.
- Aplicar um template/estrutura inicial: o `RichEditor` lê `doc` na montagem, então trocar o
  conteúdo por fora exige **remontar** (`<RichEditor key={editorKey} …>`) e chamar o
  `onChange` na mão — a remontagem não dispara `onUpdate`.

---

## 8. Imagem (colar, soltar, escolher)

`Extension` própria (`image-upload.ts`) com:

- `addStorage() { return { enabled: true } }` — o flag que o menu `/` lê.
- Comando `openImagePicker()` (usado pelo item "Imagem").
- Um `Plugin` do ProseMirror com `handlePaste` e `handleDrop`. No drop, a posição vem de
  `view.posAtCoords`; `moved === true` é ignorado (é arrastar dentro do próprio doc).

Regras que não podem ser perdidas:

1. **`Image.configure({ allowBase64: false })`** e o nó só é inserido **depois** do upload
   resolver. Nunca colocar `blob:` ou `data:` no `doc` — isso vaza para o banco e quebra em
   outro aparelho.
2. Uploads múltiplos são **sequenciais**, e o primeiro erro aborta o resto.
3. O helper puro `extractImageFiles(data)` **desiste quando o clipboard também tem texto** —
   assim colar uma célula de planilha continua sendo texto, e só um print de tela vira
   imagem. Esse helper é o que se testa unitariamente.
4. Estado visível: uma pílula "Enviando imagem…" / "Falha ao enviar" (via `t()`, ver §10).

---

## 9. Menções `@` e wikilinks `[[`

Ambas derivam de `@tiptap/extension-mention`:

- `createNoteMention(search)` — configura o `Mention` para `@`.
- `createNoteWikilink(search)` — `Mention.extend({ name: 'wikilink' })` com
  `renderText`/`renderHTML` emitindo `[[rótulo]]`.

**A pegadinha:** duas extensões derivadas de `Mention` compartilham a `PluginKey` default e
colidem (uma engole a outra). O wikilink **precisa** da sua própria:

```ts
suggestion: { char: '[[', pluginKey: new PluginKey('wikilinkSuggestion'), /* … */ }
```

Ambas marcam o HTML com `class: 'note-link'`. `MentionList.tsx` é o popup, no mesmo molde do
`SlashMenu`.

No Clube do Livro isso serve para **citar outra anotação do acervo** (a sua ou a de outra
pessoa do clube) — a busca (`noteSearch`) é escopada ao clube ativo pela tela, nunca pelo
editor. O grafo resultante vira `NoteLink`, recalculado a cada salvamento a partir do `doc`.

---

## 10. i18n dentro do editor

Convenção deliberada, para não transformar cada tooltip em uma chave:

- **Rótulos internos do editor ficam em português no código** — tooltips da barra
  (`title="Negrito"`), títulos do menu `/` (`'Título 1'`, `'Aviso'`), textos vazios dos
  popups (`'Nenhuma anotação'`).
- **O que a tela injeta passa por `t()`**: `placeholder={t('editor.placeholder')}`.
- As únicas strings traduzidas dentro do `RichEditor` são as do upload:
  `t('editor.image.uploading')` e `t('editor.image.uploadFailed')`.

Se um dia o `en` virar prioridade, a migração é mecânica e localizada nesses dois arquivos.

---

## 11. A pegadinha de montagem (não descubra isso de novo)

O tippy **reparenteia** os elementos do `BubbleMenu` e do `DragHandle` para fora do container
do editor. Consequência: se um irmão condicional aparecer/desaparecer **antes** deles, o
React tenta um `insertBefore` num nó que já não é filho e explode com `NotFoundError`.

Regra: **o wrapper da pílula de status de upload fica sempre montado e é o último filho** do
container. Renderize `null` dentro dele quando não há nada a mostrar — nunca desmonte o
wrapper.

Isso vai com **teste de regressão**: monta o editor de verdade, cola uma imagem, e falha se
o React estourar.

---

## 12. Setup de teste (o que dói se faltar)

`packages/ui/vitest.config.ts`:

```ts
export default defineConfig({
  resolve: { alias: { 'tippy.js': resolve(__dirname, 'src/components/__tests__/tippy-fake.ts') } },
  test: {
    environment: 'jsdom',
    server: { deps: { inline: [/@tiptap\//] } },   // sem isto o alias NÃO se aplica ao dist do TipTap
  },
});
```

- O **fake do tippy** precisa reparentear o conteúdo como o real, senão o teste não reproduz
  o bug da §11.
- `server.deps.inline: [/@tiptap\//]` não é opcional: sem inline, o TipTap é carregado
  pré-empacotado e ignora o alias.
- O app (`packages/app`) roda seus testes **mockando `@clube/ui`**, para não carregar o
  ProseMirror no jsdom em todo teste de tela.

---

## 13. Tokens de CSS que o editor assume

O `editor.css` e os estilos inline usam:

`--clube-bg` · `--clube-fg` · `--clube-card` · `--clube-raised` · `--clube-border` ·
`--clube-border-strong` · `--clube-muted` · `--clube-faint` · `--clube-accent` ·
`--clube-accent-soft` · `--clube-error` · `--clube-success` · `--clube-shadow-lg` ·
`--radius-card`

Todos definidos em `packages/ui/src/theme.css`, em `:root` e em `html.dark` (Tarefa 13).

Detalhe do Tailwind v4: o **preflight remove `list-style`**, então o `editor.css` tem de
readicionar marcador de lista, recuo de citação, estilo de `code`/`pre`, tabela com borda,
`task-item` com checkbox alinhado, e o `details`/`summary` do bloco alternável.

---

## 14. Checklist de aceitação do editor (Tarefa 14)

- [ ] Escrevo no celular e **o teclado não fecha** ao usar qualquer botão da barra, do bubble
      menu ou das cores.
- [ ] A barra fica visível no topo enquanto eu rolo o texto, e rola de lado quando não cabe.
- [ ] Digitar `/` abre o menu; filtro por texto, ↑/↓ com volta no fim, Enter insere, Esc fecha.
- [ ] Selecionar texto abre o bubble menu; as 5 cores marcam e a borracha limpa.
- [ ] Todos os blocos funcionam: H1, H2, listas, tarefas, citação, código, divisória,
      tabela 3×3, Aviso, alternável.
- [ ] Colar um print insere a imagem **depois** do upload (nenhum `blob:`/`data:` no `doc`);
      colar uma célula de planilha continua texto.
- [ ] `@` e `[[` abrem a busca de anotações do clube; clicar na menção navega.
- [ ] O conteúdo salvo é ProseMirror JSON; recarregar a tela restaura exatamente o que eu vi.
- [ ] Sem rede, o rascunho sobrevive a fechar e reabrir o app.
- [ ] O teste de regressão do paste de imagem passa (e falha se a §11 for violada).

---

## 15. Notas de reconciliação (Tarefa 14, medidas)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao implementar,
> nos pontos em que a spec descrevia outro ambiente ou outra versão de dependência. Onde
> houver conflito, **o que está aqui é a medição** — a prosa acima continua sendo o contrato
> de intenção.

**§13 (tokens).** Dos 14 nomes listados, **6 existem**. Os outros mudaram de nome ou não
existem, e a tabela de tradução está em `docs/tasks/14-rich-editor.md` ("Os quatro conflitos,
resolvidos"). Dois tiveram de nascer: `--clube-accent-soft` e `--clube-shadow-popover`.
E **`html.dark` não existe** — desde a Tarefa 13 o tema é `light-dark()` resolvido por
`color-scheme`, com `[data-theme]` só trocando o `color-scheme`. Consequência para o
`editor.css`: ele **nunca escreve valor de cor por tema**, e **`color-scheme` só se declara
nos três seletores do `theme.css`** (um `.ProseMirror { color-scheme: light }` inverteria
todos os tokens dentro do editor).

**§2 (versões).** As versões **não são mais `^2.10.0`** — são **exatas**, como manda a
convenção do repositório (`react 18.3.1`, `lucide-react 0.469.0`). O caret resolvia 2.27.3 e
deixava um `install` futuro derivar dentro do 2.x e mudar o editor sem ninguém pedir. Hoje:
**2.27.3** em tudo, e **2.26.2** nas duas `details-*` (`extension-details-content` e
`extension-details-summary`), que não publicaram 2.27. `tippy.js 6.3.7`.

**§9 (a pegadinha da `PluginKey`).** **Não acontece mais** na 2.27.3: o `getSuggestionOptions`
do `@tiptap/extension-mention` faz `new PluginKey()` por gatilho, por instância — medido
removendo as duas chaves explícitas, e a suíte fica verde. As chaves explícitas **ficam** como
proteção contra downgrade. **Se alguém pinar em 2.10 de verdade, a colisão volta**, e o
`EditorState.create` recusa a segunda instância — o teste de `@` + `[[` na mesma instância
falha na montagem.

**§11 (a pegadinha de montagem).** Quem destaca o elemento do container é o **próprio TipTap**:
`this.element.remove()` no **construtor** do `BubbleMenuView`, não o tippy. E a regra vale para
**toda** superfície reparenteada que seja condicional, nas duas direções:

- **desmontar o nó reparenteado** → `removeChild` num nó que já não é filho;
- **montar um irmão antes dele** → `insertBefore` contra o nó reparenteado.

Foi por esquecer isso no bubble menu que a tela **quebrava ao virar somente-leitura**
(`{editable ? <BubbleMenu…/> : null}` com `editable` indo para `false`). A barra, o bubble
menu e o wrapper da pílula ficam **sempre montados**; o que é condicional é o **conteúdo**. O
`shouldShow` default do `BubbleMenuPlugin` já devolve `false` quando `!editor.isEditable`, então
em leitura nada aparece sem lógica nova.

**§12 (setup de teste).** O **fake do tippy e o alias foram apagados**. As duas justificativas
escritas eram falsas como medida: o fake parar de reparentear deixava a suíte **igual**, e o
alias removido (tippy de verdade no jsdom) também. O que **é** load-bearing é o
`server.deps.inline: [/@tiptap\//]`, mas por outro motivo — sem ele **5 testes** morrem com
`TypeError: tippy is not a function` (interop ESM/CJS: o `import tippy from 'tippy.js'` dentro
do `dist` externalizado do TipTap recebe o namespace, não a função). Não é geometria e não era
o alias.

**§4.3 (drag handle).** **Não implementado**, e é decisão do dono registrada.
`@tiptap/extension-drag-handle-react` **não existe** na linha 2.10 (a primeira no escopo
gratuito `@tiptap/*` é a 2.22), e o `@tiptap/extension-drag-handle` declara `y-prosemirror` e
`@tiptap/extension-collaboration` como peers **obrigatórios** — arrastar um parágrafo
embarcaria a stack yjs num PWA sem colaboração no escopo.

**§4.1 (alvo de toque).** As **36 px** dos botões são **exceção consciente** ao piso de 44 px da
Tarefa 13, registrada: na largura de um celular, 44 px não caberiam nos 13 controles da barra.

**§7 (custo).** O editor custa **+454.527 B raw / +143.254 B gzip** (~2,5× o app inteiro de
hoje), não os ~300 kB estimados. Medido construindo o `app` com e sem um `import` do
`RichEditor` numa tela (bytes em disco; gzip via `gzip -9`). É esse número que sustenta a
exigência de `lazy()` na Tarefa 18.
