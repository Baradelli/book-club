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

  // ⚠️ Tarefa 43 — veja abaixo. Texto já traduzido pela tela; posição, nunca ref.
  penBar?: 'fixed' | 'footer' | 'none';                 // o padrão é 'none'
  slashHintLabel?: string;
  uploadingLabel?: string;
  uploadFailedLabel?: string;
}
```

⚠️ **AS QUATRO PROPS ACIMA DA LINHA EM BRANCO SÃO A SUPERFÍCIE DE 2026-09-22, e a
`penBar` é a que esta seção existe para justificar.**

A Tarefa 43 tirou a formatação de dentro da caixa e pôs as cinco canetas + `Aa` + `/` fixas na
tela (§4.1). A barra precisa **comandar** o editor de fora da área de texto — e este §3 diz,
por escrito, que **nenhuma ref imperativa é exposta**. Três saídas foram pesadas:

| saída | veredito |
| --- | --- |
| a tela recebe a instância por `onReady(editor)` e desenha a barra | ❌ quebra este §3 **e** põe botão de editor em `packages/app`, onde a varredura de grafo de `editor-touch-handlers.test.ts` (a guarda da §4.4) não chega |
| a barra vira `children` com render-prop que recebe o `editor` | ❌ mesmo problema: o botão nasce fora daquele grafo |
| ✅ **o editor continua dono da barra e ganha uma prop de POSIÇÃO** | a barra é filha dele, dentro do grafo que as guardas varrem; a tela só diz **onde** |

`slashHintLabel`, `uploadingLabel` e `uploadFailedLabel` são as **três folhas de `editor.*`**
que a tela traduz e injeta — `packages/ui` não chama `t()` e não pode (§10).

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

### 4.1 ~~Barra fixa (a "barra que auxilia")~~ → **A BARRA DE CANETAS**

~~Uma faixa horizontal grudada no topo do editor, com scroll lateral quando não cabe:~~

```tsx
// ⚠️ MORTO desde a Tarefa 43 — fica aqui porque a decisão é o registro.
className="no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto px-3 py-1.5"
style={{
  backgroundColor: 'color-mix(in srgb, var(--clube-bg) 80%, transparent)',
  borderBottom: '1px solid var(--clube-border)',
  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  position: 'sticky', top: 0, zIndex: 10,
}}
```

~~Botões, nesta ordem, com separadores: **negrito · itálico · código inline** ｜ **H1 · H2** ｜
**citação · lista · lista numerada · bloco de código · divisória** ｜ **5 amostras de grifo +
remover grifo**.~~

~~Ícones `lucide-react` a `size={17} strokeWidth={1.85}`; cada botão **2.25rem × 2.25rem**
(36 px — alvo de toque confortável).~~

⚠️ **A BARRA FIXA DO TOPO MORREU NA TAREFA 43 (2026-09-22), decisão A do MVP 3.5.** Ela fica
riscada em vez de apagada porque esta seção é o registro de *por que* ela existiu, e apagá-la
faria a próxima pessoa reinventá-la — é a lição do `dayRange` que o `CLAUDE.md` guarda.

O canvas (`Dia.dc.html:59`) põe o texto **direto no papel da página**: sem caixa, sem barra
por cima. O que formata passa a ser o **menu de bolha na seleção** (§4.2, que cresceu) mais o
**menu `/`** (§5, intocado). O que fica fixo na tela é outra coisa — a **barra de canetas**:

```ts
penBar?: 'fixed' | 'footer' | 'none'   // o padrão é 'none'
```

| forma | onde | quem usa |
| --- | --- | --- |
| `'fixed'` | ancorada acima do teclado no celular (`Dia.dc.html:103`, **62px**, `--surface`, `border-top`) e devolvida ao rodapé da coluna acima de 1120px (`DiaDesktop.dc.html:72`, **56px**) | a anotação do dia |
| `'footer'` | a mesma barra, sem a âncora | um editor dentro de formulário que rola |
| `'none'` | não há barra | o comentário do grifo e o modo leitura |

Conteúdo, na ordem: **as 5 canetas** (`aria-label="Caneta amarela"`…, bolinha de **22px**, e
**20px** acima de 1120px) ｜ filete vertical ｜ **`Aa`** ｜ **`/`**. À direita, no desktop, a
dica escrita (`DiaDesktop.dc.html:92`), que chega por prop (§10).

⚠️ **A DECISÃO DE ARQUITETURA, e ela mantém a §3 intacta:** a barra está FORA da área de
texto mas precisa comandar o editor. Passar a instância para a tela (`onReady(editor)`) ou
entregá-la por render-prop foram **recusadas**: as duas quebram "nenhuma ref imperativa é
exposta" **e** põem o botão novo fora do grafo que `editor-touch-handlers.test.ts` percorre —
ou seja, a §4.4 deixaria de ser varrida sem um vermelho. O editor continua dono da barra; a
tela diz só **onde**.

⚠️ **E OS 36px VIRARAM 44px, o que APAGA uma exceção em vez de criar outra.** A exceção ao
piso da Tarefa 13 estava escrita assim: *"numa barra que precisa mostrar treze controles na
largura de um celular, 44px cortaria quatro deles"*. A barra de treze controles não existe
mais — o canvas desenha **seis** no menu de bolha e **sete** na barra de canetas, todos
**44×44**. Sem a barra apertada não há o que justificar a exceção.

⚠️ **NÃO HÁ MAIS BORRACHA, e não é capacidade perdida.** O `toggleHighlight({ color })` do
TipTap desliga quando aquela cor exata já está ligada: tirar o grifo é apertar de novo a
caneta que está com o anel de ouro. O canvas não desenha borracha em barra nenhuma, e o
acusador do gesto está em `rich-editor.test.tsx`.

### 4.2 Bubble menu (na seleção)

`<BubbleMenu editor={editor} tippyOptions={{ duration: 120 }}>` com ~~o **subconjunto**:
negrito · itálico · as 5 cores de grifo · remover grifo. Nada mais — na seleção, o que se
quer é marcar, não estruturar.~~

⚠️ **ELE CRESCEU NA TAREFA 43 (2026-09-22), e o argumento antigo se inverteu.** Enquanto
havia barra fixa, o bubble menu podia ser subconjunto dela — quem quisesse estruturar subia
para a barra. **A barra morreu**, então é aqui que a estrutura vive. O canvas desenha
(`Dia.dc.html:65-70`) uma fileira de **44×44 com separadores**:

**B · I · `<>` ｜ H1 · H2 · citação**

⚠️ **O canvas tem um SÉTIMO botão na fileira (`Dia.dc.html:71`, "Mais opções",
o reticências) e ele NÃO foi implementado.** Divergência declarada: o artboard é
estático e não diz para onde ele leva, e o que um "mais opções" conteria —
lista, lista numerada, tarefas, bloco de código, divisória, tabela, aviso,
alternável — é **exatamente** o menu `/`, que já existe e ganhou botão próprio
na barra de canetas. Um segundo caminho para a mesma lista é decisão do dono.

Os glifos são **texto**, não ícone — `B`/`I`/`H1`/`H2` em Fraunces, `<>` em Geist Mono e a
aspa em Instrument Serif —, e é por isso que o `RichEditor.tsx` deixou de importar
`lucide-react`. As cinco cores saíram daqui: elas são a **barra de canetas** (§4.1).

Papel, borda, raio e sombra do canvas (`Dia.dc.html:64`: `--surface`, `1px` de `--border`,
raio **5px** → entregue em `--r-3` (4px), divergência de 1px declarada, e a
`--shadow-popover`), mais a **seta de 12×7** apontando para a palavra (`:73`).

⚠️ **A LISTA É UMA SÓ, E TEM DUAS ÂNCORAS (decisão E).** O botão `Aa` da barra de canetas
abre **estes mesmos** controles, e é o que faz a formatação existir quando não há seleção. Ela
é um array (`FORMAT_CONTROLS`) renderizado por um componente (`FormatControls`) que as duas
âncoras usam — nunca dois blocos de JSX, que divergiriam na primeira correção. Acusadores em
`pen-bar.test.tsx`: um renderizado (o `Aa` contra a lista importada da produção) e um
estrutural (nenhuma das duas âncoras declara `<ToolButton>` próprio).

⚠️ **Mostrar o conteúdo do bubble menu num teste de jsdom NÃO É POSSÍVEL, medido:** o
`BubbleMenuView` chama `element.remove()` no construtor e o tippy só reanexa o elemento ao
`body` quando MOSTRA, o que depende de layout — zero `[data-tippy-root]` depois de selecionar
e disparar `mouseup`. É por isso que a metade estrutural existe.

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

⚠️ **A REGRA CONTINUA INTEIRA NA TAREFA 43, e ela passou a valer para a BARRA DE CANETAS.**
As cinco canetas, o `Aa` e o `/` são botões dentro de um editor como quaisquer outros: sem o
`preventDefault` o toque tira o foco do ProseMirror e o teclado fecha. A varredura que a
protege (`editor-touch-handlers.test.ts`) percorre o **grafo de módulos** do editor, e a barra
cai nela **por construção** — ela é declarada no próprio `RichEditor.tsx`. Há uma asserção
nomeando isso: se um dia a barra sair para um módulo próprio, o certo é a varredura crescer
(o `RichEditor` importar o módulo), nunca a barra escapar.

Acessibilidade: `aria-pressed={active}` + `title`/`aria-label` em todos. Estado ativo com
`--clube-accent-soft` / `--clube-accent` — ⚠️ nomes **mortos**, veja o §13; hoje são
`--accent-soft` e `--accent`. Na caneta o estado ativo **não** acende o fundo: quem diz "esta
é a cor de agora" é o anel de ouro em volta da bolinha (`Dia.dc.html:106`).

Espaço para o teclado, em `editor.css`:

```css
.ProseMirror { min-height: 60vh; padding: 1.5rem 1.5rem 7rem; }
```

As `7rem` de baixo garantem que a última linha não fique embaixo do teclado.

> **Não há nenhuma ramificação por dispositivo** — nem `userAgent`, nem `isMobile`, nem
> JavaScript medindo janela. ~~A adequação ao celular é estrutural: alvos de 36 px, barra
> com scroll lateral, `sticky top: 0` e o truque do `preventDefault`.~~ É o que permite um
> componente só servir os dois tamanhos.
>
> ⚠️ **Riscado na Tarefa 43 (2026-09-22), e só a LISTA mudou — a regra não.** Não há mais
> scroll lateral nem `sticky top: 0` (a barra do topo morreu), e o alvo subiu para 44 px. O
> que passou a servir os dois tamanhos é **media query**: as duas alturas da barra de canetas
> (62 px e 56 px), os dois tamanhos de bolinha (22 px e 20 px), o botão `/` que só existe
> abaixo de 1120 px e a dica escrita que só existe acima. ⚠️ **"Nenhuma media query escondendo
> botões" deixou de valer ao pé da letra** — o que continua proibido é a ramificação em
> JavaScript, que mente no primeiro frame e quebra no redimensionamento.

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

~~A paleta é uma constante do módulo~~ **A paleta é EXPORTADA** (`HIGHLIGHT_COLORS`, Tarefa
43), deliberadamente em **rgba com alpha** para o texto continuar legível no tema claro e no
escuro:

```ts
// ⚠️ A FORMA DE HOJE tem rótulo junto — veja o riscado abaixo.
export const HIGHLIGHT_COLORS: readonly HighlightPen[] = [
  { color: 'rgba(250, 204, 21, 0.40)', label: 'Caneta amarela' },
  { color: 'rgba(34, 197, 94, 0.35)', label: 'Caneta verde' },
  { color: 'rgba(249, 115, 22, 0.40)', label: 'Caneta laranja' },
  { color: 'rgba(59, 130, 246, 0.35)', label: 'Caneta azul' },
  { color: 'rgba(236, 72, 153, 0.35)', label: 'Caneta rosa' },
];
```

Aplica com `toggleHighlight({ color })`, ~~limpa com `unsetHighlight()`~~, estado ativo por
`editor.isActive('highlight', { color })`. ~~A amostra é um círculo de 20 px cujo contorno
vira `--clube-fg` quando ativo.~~

⚠️⚠️ **AS TRÊS FRASES RISCADAS ACIMA MORRERAM NA TAREFA 43 (2026-09-22), e a do meio era a
PERIGOSA:** `unsetHighlight` era a **única ocorrência do nome em todo o repositório**, e ela
estava AQUI, no contrato — o §4.1, duzentas linhas acima, já dizia *"NÃO HÁ MAIS BORRACHA"*.
O próximo agente leria esta linha e chamaria um comando que nenhum botão expõe. É a lição do
`dayRange` que o `CLAUDE.md` registra, acontecendo **dentro** do documento que ela existe
para proteger.

O que vale hoje, medido:

| era | é |
| --- | --- |
| "constante do módulo" | **exportada** — a barra e o teste de identidade precisam ser a MESMA lista (regra 4 da Tarefa 43), e `packages/shared` lê este arquivo pelo nome (espelho do ADR 0004) |
| "limpa com `unsetHighlight()`" | **apertar de novo a caneta que está com o anel** — o `toggleHighlight({ color })` do TipTap desliga quando aquela cor exata já está ativa. O canvas não desenha borracha em barra nenhuma |
| "círculo de 20 px" | **22 px**, e 20 px acima de 1120px (`Dia.dc.html:106`, `DiaDesktop.dc.html:75`) |
| "contorno vira `--clube-fg`" | **anel de ouro** do canvas: `box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--gold)`. (E `--clube-fg` é um dos sete nomes que **nunca existiram** — veja o §13) |

⚠️ **E O LIMITE DO GESTO NOVO, declarado:** com o **cursor colapsado** (sem seleção), o
`toggleMark` do TipTap não estende a marca sozinho — `extendEmptyMarkRange` é `false` por
padrão —, então apertar a caneta ligada não tira nada e o `aria-pressed` continua dizendo
"ligada". **Não é regressão:** a borracha antiga (`unsetHighlight`) tinha exatamente o mesmo
limite. A diferença é que agora este é o **único** caminho, e por isso ele fica escrito.

`Color`/`TextStyle` ficam registrados mas **sem UI** — não expor cor de texto; grifo já
resolve o caso de uso e duas paletas confundem.

> **Não confundir com a entidade `Highlight`** (MVP 2). Essa paleta é do editor — marcar
> texto dentro de uma anotação. A entidade `Highlight` é o registro de um grifo feito no
> livro físico. São coisas diferentes que usam as mesmas cores; mantenha os hex espelhados
> para não parecer bug.
>
> ⚠️ **E É POR ISSO QUE A AMOSTRA CONTINUA PINTADA COM `--swatch` E NÃO COM `--pen-a`**
> (Tarefa 43): dentro do editor o grifo é um `mark` que carrega o `rgba` no próprio
> documento, então a bolinha tem de mostrar a cor que a caneta **aplica**. Os tokens
> `--pen-*` do canvas pintam a ENTIDADE (o `GrifoText`), que é a outra coisa deste mesmo
> parágrafo.

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
- **O que a tela injeta passa por `t()`**: ~~`placeholder={t('editor.placeholder')}`~~
  `placeholder={t('pages.dayNote.placeholder')}` na anotação do dia e
  `placeholder={t('pages.freeNote.placeholder')}` na avulsa.
- ~~As únicas strings traduzidas dentro do `RichEditor` são as do upload:
  `t('editor.image.uploading')` e `t('editor.image.uploadFailed')`.~~
  **Nenhuma string é traduzida DENTRO do `RichEditor`** — as duas do upload chegam por prop
  (`uploadingLabel` / `uploadFailedLabel`), e quem chama o `t()` é a tela
  (`day-note.tsx:617-618`, o único chamador).

Se um dia o `en` virar prioridade, a migração é mecânica e localizada nesses dois arquivos.

⚠️ **Os dois bullets acima ficaram riscados na auditoria da Tarefa 40 (2026-09-21), e os dois
estavam errados por medição:**

1. **`editor.placeholder` nunca existiu.** As folhas de `editor.*` são `slashHint`,
   `image.uploading` e `image.uploadFailed`; as telas usam `pages.dayNote.placeholder` e
   `pages.freeNote.placeholder`. O nome fantasma também estava gravado num arquivo de
   **produção** (`packages/ui/src/components/RichEditor.tsx`, no docblock da prop), e foi
   corrigido lá — é a lição do `dayRange`: um nome que não existe faz o próximo leitor
   procurar, não achar e inventar um terceiro para a mesma coisa;
2. **`packages/ui` não chama `t()` nenhuma vez, e não pode.** Medido: zero ocorrências, e
   `no-i18n.test.ts` as proíbe — o design system não conhece idioma. Dizer que as strings do
   upload são "traduzidas dentro do `RichEditor`" invertia a direção da dependência.

⚠️ **E a consequência é maior que as duas correções:** se `packages/ui` não traduz nada, então
**o namespace `editor.*` é inteiro lido pela TELA** — `image.uploading` e `image.uploadFailed`
entram por prop, e `slashHint` também vai entrar assim. Ou seja, `editor.slashHint` **não é
exceção nenhuma: é a regra deste namespace.** O nome `editor.*` diz de que ASSUNTO a frase é,
nunca quem a renderiza.

⚠️ **`editor.slashHint` (Tarefa 40, 2026-09-21) — e ela NÃO é exceção a esta seção.**

O catálogo ganhou `editor.slashHint` = `Digite / para inserir um bloco`. À primeira leitura ela
parece contrariar o primeiro bullet — o menu `/` é peça do editor, e os títulos dele
(`Título 1`, `Aviso`) ficam cravados em `packages/ui`. **Ela não contraria, e o motivo é o que
a auditoria mediu acima:** `packages/ui` não chama `t()`, então **toda** folha de `editor.*` é
lida pela tela e entra por prop. `slashHint` é a terceira, ao lado das duas do upload.

Some a isso o QUEM renderiza: esta frase é desenhada pela tela, no rodapé da coluna de leitura
(artboards `DiaDesktop` e `NovaAnotacaoDesktop`), ao lado das cinco canetas e do `Aa`. Ela não
é rótulo de nada dentro do editor — é a dica que a tela dá sobre um gesto que existe dentro
dele. E tela nenhuma deste projeto tem texto solto (`CLAUDE.md`).

⚠️ Ela vive em `editor.*`, e não em `pages.*`, porque as duas telas que a mostram são donas
iguais do assunto: eleger uma dona e fazer a outra ler de lá seria inventar um dono. O
namespace nomeia o ASSUNTO — o editor —, nunca o renderizador.

✅ **`editor.slashHint` GANHOU CONSUMIDOR NA TAREFA 43 (2026-09-22), e ele confirma a leitura
acima.** Quem a lê é a tela (`day-note.tsx`, `t('editor.slashHint')`) e ela entra no editor
por **prop** (`slashHintLabel`), exatamente como `image.uploading` e `image.uploadFailed`. As
**três** folhas de `editor.*` têm agora o mesmo caminho, e `packages/ui` continua com **zero**
chamadas de `t()`.

Onde ela aparece: no rodapé da **barra de canetas**, à direita, acima de 1120px
(`DiaDesktop.dc.html:92`) — que é o lugar onde o canvas a desenha, e o mesmo lugar em que o
botão `/` deixa de existir. Ausente ≠ vazio: sem a frase não nasce elemento nenhum.


---

## 11. A pegadinha de montagem (não descubra isso de novo)

O tippy **reparenteia** os elementos do `BubbleMenu` e do `DragHandle` para fora do container
do editor. Consequência: se um irmão condicional aparecer/desaparecer **antes** deles, o
React tenta um `insertBefore` num nó que já não é filho e explode com `NotFoundError`.

Regra: **o wrapper da pílula de status de upload fica sempre montado e é o último filho** do
container. Renderize `null` dentro dele quando não há nada a mostrar — nunca desmonte o
wrapper.

⚠️ **E A BARRA DE CANETAS DA TAREFA 43 ENTRA NESSA CONTA (decisão J).** Ela é irmã do
container, e é a mais tentadora de montar condicionalmente — `penBar='none'` *parece* "não
renderizar nada". Não é: o nó fica montado sempre, e o que é condicional é o CONTEÚDO. O
acusador é `rich-editor-image.test.tsx › never mounts or unmounts a sibling, in any state`,
que compara a lista de filhos-host elemento por elemento e agora percorre as **três** formas
de `penBar` nas **duas** direções de `editable` — mais uma asserção que exige a barra DENTRO
da linha de base, sem a qual as duas listas continuariam iguais sem ela (§7.4).

Os irmãos do container, hoje, na ordem: o bubble menu (que o TipTap destaca), o
`EditorContent`, a barra de canetas e o wrapper da pílula.

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

~~`--clube-bg` · `--clube-fg` · `--clube-card` · `--clube-raised` · `--clube-border` ·
`--clube-border-strong` · `--clube-muted` · `--clube-faint` · `--clube-accent` ·
`--clube-accent-soft` · `--clube-error` · `--clube-success` · `--clube-shadow-lg` ·
`--radius-card`~~

⚠️ **A lista acima estava ERRADA desde a Tarefa 14, e a Tarefa 39 (2026-09-19) mediu o
tamanho do erro: SETE dos catorze nomes nunca existiram.** `--clube-card`,
`--clube-raised`, `--clube-muted`, `--clube-faint`, `--clube-error`, `--clube-shadow-lg` e
`--radius-card` não estavam no `theme.css` no dia em que esta seção foi escrita, e nunca
estiveram: os tokens reais se chamavam `--clube-surface`, `--clube-surface-raised`,
`--clube-fg-muted`, `--clube-fg-subtle`, `--clube-danger`, `--clube-shadow-popover` e
`--clube-radius`. É a lição do `dayRange` que o `CLAUDE.md` registra: **um nome que não
existe faz o próximo leitor procurar, não achar, e inventar um terceiro nome para a mesma
coisa.** A lista fica riscada em vez de apagada porque o erro é a lição.

~~**A lista de hoje, medida do arquivo** (`grep "var(--" packages/ui/src/editor.css`, 40
referências, todas conferidas uma a uma contra o `:root` do `theme.css`):~~

~~`--bg` · `--surface` · `--surface-2` · `--border` · `--border-strong` · `--text` ·
`--text-muted` · `--text-subtle` · `--accent` · `--accent-soft` · `--danger` · `--r-2` ·
`--shadow-popover`~~

⚠️ **A LISTA ACIMA ERA DE 2026-09-19 (Tarefa 39) E FICOU ERRADA NOS DOIS SENTIDOS APÓS A
TAREFA 43** — a primeira emenda desta fatia acrescentou tokens em PROSA e esqueceu de mexer na
LISTA, que é o que alguém lê. É a mesma classe da "correção incompleta" que a auditoria da 41b
nomeou.

**A lista de hoje, remedida** (`grep -o "var(--[a-z0-9-]*)" packages/ui/src/editor.css`, **53
ocorrências em 51 linhas**; descartadas as que aparecem **só em comentário** — `var(--token)`
no docblock do topo e `var(--pen-a-dot)` na nota da amostra —, e as **17** restantes
conferidas uma a uma contra o `:root` do `theme.css`, todas presentes):

`--accent` · `--accent-soft` · `--border` · `--border-soft` · `--border-strong` ·
`--danger` · `--family-reading` · `--gold` · `--r-2` · `--r-3` · `--shadow-popover` ·
`--size-reading` · `--surface` · `--surface-2` · `--text` · `--text-muted` · `--text-subtle`

**O que mudou em relação à lista riscada:**

| | token | por quê |
| --- | --- | --- |
| **saiu** | `--bg` | ele só existia no fundo `color-mix` da barra fixa do topo, que morreu (§4.1). **Zero** ocorrências hoje |
| entrou | `--border-soft` | os separadores entre os botões do menu de bolha (`Dia.dc.html:65-70`) |
| entrou | `--r-3` | o raio do papel dos três popups (era `--r-2`, e o `--r-2` **fica**: ele ainda dá o raio de `code`, `pre`, `img` e da tabela) |
| entrou | `--gold` | o anel da caneta ligada — **como traço**, nunca como tinta de letra |
| entrou | `--family-reading` · `--size-reading` | o corpo da anotação virou a serifa de leitura (decisão C) |

Mais `--swatch`, que **não** é token de tema: ele é injetado em tempo de execução pelo
componente (`style={{ "--swatch": cor }}`) e é a única exceção autorizada ao "sem CSS
inline" — a cor do grifo vem de uma constante de TypeScript e não pode virar classe
estática.

⚠️ **A TAREFA 43 (2026-09-22) MEXEU NESTA LISTA, e mexeu nos dois sentidos.**

**Entrou `--gold`**, e só como TRAÇO: a caneta ligada ganha o anel do canvas
(`Dia.dc.html:106`: `box-shadow: 0 0 0 2px var(--surface), 0 0 0 3.5px var(--gold)`), no lugar
do `border-color: var(--text)` de antes. ⚠️ Isso **não** contraria a guarda de primeiro uso
que a Tarefa 41b apontou para o dourado: ela proíbe `--gold` como **tinta de letra** (4,16:1
no claro, contra um piso de 4,5:1); como filete o piso é 3:1, e ele passa. Quem precisar de
dourado em TEXTO usa `--gold-strong`.

**Entraram também `--family-reading` e `--size-reading`**: o corpo da anotação passou a ser a
serifa de leitura (§4.1, decisão C da Tarefa 43) — Fraunces 17,5px/1,72, e 19px/1,75 acima de
1120px, com medida máxima de 620px. ⚠️ **17,5px É o degrau `--size-reading`** da escala de
sete da Tarefa 39 (a spec da 43 dizia que não era, e isso foi medido e corrigido); **19px não
é degrau nenhum** e fica escrito como literal no `editor.css`, divergência declarada — cada
degrau novo entra também na lista fechada de isenções ao `light-dark()`.

**`--swatch` FICA, e a decisão é medida.** O canvas pinta as bolinhas com `--pen-a`…`--pen-r`;
dentro do editor isso seria MENTIRA, porque o grifo do editor é um `mark` que carrega o
`rgba` no próprio documento — a amostra tem de mostrar a cor que a caneta de fato aplica. Os
tokens `--pen-*` pintam a entidade `Highlight` (o `GrifoText`), que é outra coisa.

⚠️ **Trocar apagaria UM acusador — não dois, como a primeira entrega desta fatia escreveu.**
Medido com o mutante que troca a amostra por `bg-pen-a` e tira o `style` inline:
`@clube/ui` dá **7** vermelhos, **todos** em `highlight-palette.test.tsx`, e `@clube/shared`
fica **601/601 verde** — o espelho do ADR 0004 lê os literais `rgba` do **fonte** do
`RichEditor.tsx`, nunca o `--swatch` do DOM. A decisão continua certa; o argumento estava
pela metade.

**Saíram do arquivo** `.clube-editor-bar` (o fundo `color-mix` sobre `--bg`, o
`backdrop-filter` e a borda de baixo) e `.no-scrollbar`, junto com a barra do topo.

Todos definidos em `packages/ui/src/theme.css`, num `:root` só, com `light-dark()` — não
existe `html.dark`, e não existe segunda cópia da paleta desde a Tarefa 13. ⚠️ **Os nomes
perderam o prefixo `--clube-` na Tarefa 39** (decisão A do MVP 3.5): eles são hoje os
nomes do canvas de design, e o vocabulário de UTILITÁRIO (`bg-canvas`, `text-content`,
`rounded-control`) continua o mesmo.

Detalhe do Tailwind v4: o **preflight remove `list-style`**, então o `editor.css` tem de
readicionar marcador de lista, recuo de citação, estilo de `code`/`pre`, tabela com borda,
`task-item` com checkbox alinhado, e o `details`/`summary` do bloco alternável.

---

## 14. Checklist de aceitação do editor (Tarefa 14)

- [ ] Escrevo no celular e **o teclado não fecha** ao usar qualquer botão da barra de canetas,
      do bubble menu ou do `Aa`.
- [ ] ~~A barra fica visível no topo enquanto eu rolo o texto, e rola de lado quando não cabe.~~
      **A barra de CANETAS fica ancorada acima do teclado enquanto eu rolo o texto, e no
      rodapé da coluna no desktop** (Tarefa 43: a barra do topo morreu — §4.1).
- [ ] Digitar `/` abre o menu; filtro por texto, ↑/↓ com volta no fim, Enter insere, Esc fecha.
- [ ] Selecionar texto abre o bubble menu; ~~as 5 cores marcam e a borracha limpa.~~
      **ele traz B · I · `<>` · H1 · H2 · citação** (Tarefa 43: as cores viraram a barra de
      canetas, e a borracha morreu — tirar o grifo é apertar de novo a caneta com o anel).
- [ ] O `Aa` da barra de canetas abre **os mesmos** controles do bubble menu, sem seleção.
- [ ] As 5 canetas marcam; apertar a caneta que está com o anel **tira** o grifo.
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
(`{editable ? <BubbleMenu…/> : null}` com `editable` indo para `false`). ~~A barra~~ **A barra
de canetas** (Tarefa 43; a do topo morreu), o bubble menu e o wrapper da pílula ficam **sempre
montados**; o que é condicional é o **conteúdo**. O `shouldShow` default do
`BubbleMenuPlugin` já devolve `false` quando `!editor.isEditable`, então em leitura nada
aparece sem lógica nova.

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
