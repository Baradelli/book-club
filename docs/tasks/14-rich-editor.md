# Tarefa 14 — `RichEditor` em `packages/ui`

> A peça central do produto. O `docs/EDITOR.md` **já é a spec do editor** — ele descreve um
> editor que existe, foi usado e é o motivo deste projeto nascer. **Esta spec não redesenha
> nada:** ela reconcilia o `EDITOR.md` com o que as Tarefas 12 e 13 realmente construíram,
> resolve os conflitos, e diz o que se testa.
>
> Leia, nesta ordem: **`docs/EDITOR.md` inteiro** (é o contrato de implementação),
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` (§7), `docs/adr/0001-doc-prosemirror-json.md`,
> `docs/tasks/13-design-system-ui.md` e o `packages/ui/src/theme.css` de verdade.

## Objetivo

Escrever no celular, à noite, com uma mão, e o teclado não fechar. É essa a fatia.

## O que manda em quê

O `EDITOR.md` foi escrito antes das Tarefas 12 e 13 e descreve o ambiente de **outro
projeto**. Onde ele descreve o **editor** (extensões, o menu `/`, o truque do
`preventDefault`, a pegadinha do tippy, a paleta de grifo, as regras de imagem), ele **vence
e você segue à letra**. Onde ele descreve o **ambiente** (nomes de token, `html.dark`, estilo
inline), o **código real das Tarefas 12/13 vence** — e a tabela abaixo é a tradução.

## ⚠️ Os quatro conflitos, resolvidos

### 1. Os nomes de token do `EDITOR.md` §13 **não existem**

Dos 14 que ele lista, **6** existem. Os outros têm nome diferente ou não existem. Medido
contra `packages/ui/src/theme.css`:

| `EDITOR.md` §13 pede | o real (Tarefa 13) |
|---|---|
| `--clube-card` | `--clube-surface` |
| `--clube-raised` | `--clube-surface-raised` |
| `--clube-muted` | `--clube-fg-muted` |
| `--clube-faint` | `--clube-fg-subtle` |
| `--clube-error` | `--clube-danger` |
| `--radius-card` | `--clube-radius` |
| `--clube-shadow-lg` | **não serve** — ver conflito 3 |
| `--clube-accent-soft` | **NÃO EXISTE** — ver abaixo |
| `--clube-bg` · `--clube-fg` · `--clube-border` · `--clube-border-strong` · `--clube-accent` · `--clube-success` | existem com esse nome |

**`--clube-accent-soft` precisa nascer.** É o fundo do botão ativo da barra (§4.4), e não há
substituto: `--clube-accent-hover` é a cor *cheia* de hover, não um véu translúcido. Declare-o
em `theme.css` com `light-dark()`, como todos os outros, e **acrescente o utilitário
correspondente no `@theme inline`** — o teste da regra 2 da Tarefa 13 amarra os dois arquivos
nas duas direções e fica vermelho se você esquecer um lado.

### 2. `html.dark` **não existe** — e um CSS escrito para ele não aplica nada

O `EDITOR.md` §13 diz que os tokens vivem "em `:root` e em `html.dark`". A Tarefa 13 não usa
classe: usa **`light-dark()`** resolvido por `color-scheme`, com `[data-theme]` só trocando o
`color-scheme`. Consequência prática para você: **o `editor.css` nunca escreve valor de cor por
tema.** Ele usa `var(--clube-*)` e o token já sabe o tema sozinho.

E a armadilha da Tarefa 13 vale aqui em cheio: **`color-scheme` só se declara nos três
seletores do `theme.css`.** Um `.ProseMirror { color-scheme: light }` para forçar um controle
nativo claro inverteria **todos** os tokens dentro do editor.

### 3. A sombra que o `EDITOR.md` pede não existe, e a que existe aponta para o lado errado

Ele pede `--clube-shadow-lg` para o bubble menu. O único token de sombra é
`--clube-shadow-sheet`, que é `0 -10px 30px` — **para cima**, correto para o bottom sheet do
celular e errado para um popup que flutua sobre a seleção.

**Declare `--clube-shadow-popover`** (sombra para baixo, difusa), com utilitário no
`@theme inline`. Não reaproveite a do sheet e **não** mexa nela — a direção dela é decisão
registrada do dono.

### 4. Estilo inline: o `EDITOR.md` prescreve, o `CLAUDE.md` proíbe

O `EDITOR.md` §4.1/§4.2 traz `style={{ backgroundColor: 'color-mix(...)', backdropFilter: …,
position: 'sticky' }}`. O `CLAUDE.md` diz **"sem CSS inline em telas reais"**, e a Tarefa 13
já seguiu isso até no detalhe (escolheu classe em vez de `style.overflow` para travar o
scroll).

**Resolução:** tudo isso vira classe — utilitário do Tailwind quando existe
(`sticky top-0 z-10`), regra no `editor.css` quando não (`color-mix`, `backdrop-filter`). O
comportamento visual é idêntico; o que muda é onde mora.

**A única exceção autorizada** é a cor **dinâmica** das 5 amostras de grifo, que vem de uma
constante de módulo e não pode virar classe estática. Use a variável CSS como escape:
`style={{ '--swatch': color }}` + uma regra no `editor.css` que a consome. É o padrão para
valor que só o runtime conhece.

## Duas coisas que a Tarefa 13 deixou e que esta fatia herda

- **O `@source not '**/__tests__'`** existe no `styles.css`: o Tailwind extrai nome de classe
  de **comentário e de arquivo de teste**, e isso já embarcou 3,5 kB de CSS morto uma vez. O
  `editor.css` vai ser cheio de prosa explicando seletor de ProseMirror — **não cite nome de
  classe utilitária em comentário** sem necessidade.
- **`<svg` inline é proibido em `ui/src`** (a guarda do ADR 0002). Todo ícone do editor vem do
  `lucide-react`, o que o `EDITOR.md` §4.1 já manda.

## O app precisa importar o `editor.css` — hoje ele não importa

`packages/app/src/styles.css` importa só o `theme.css`. Acrescente
`@import '@clube/ui/editor.css';` **depois** do `@import 'tailwindcss'` (o preflight do
Tailwind remove `list-style`, e o `editor.css` existe justamente para readicionar — se vier
antes, o preflight ganha).

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **O editor não é lazy-loaded nesta fatia** | TipTap + ProseMirror são ~300 kB — **medido, é mais que o dobro: +454.527 B raw / +143.254 B gzip** (ver a Definição de pronto). A tela de login não deveria baixá-los. Mas o `lazy()` mora no **app**, e o app não tem tela de nota até a Tarefa 18. Registrado como exigência da 18, com o número medido nesta fatia. |
| B | `@tiptap/*` só em `packages/ui` | É o §1 do `EDITOR.md`, e é o que permite o app testar telas mockando `@clube/ui` sem carregar ProseMirror no jsdom. **O `app/package.json` não ganha nenhum `@tiptap/*`.** |
| C | `min-height: 60vh` do §4.4 vira **`60dvh`** | `vh` é quebrado no mobile com teclado e barra do navegador — foi por isso que a Tarefa 13 usou `min-h-dvh` e `max-h-[90dvh]`. Manter `vh` reintroduz o bug que o resto do app já evita. |
| D | Rótulos internos em **português no código** | É o §10 do `EDITOR.md`, e é decisão dele. Contradiz o "nada de texto solto" do `CLAUDE.md`, mas o `EDITOR.md` vence no editor e o motivo está escrito: transformar 20 tooltips em chave custa mais do que resolve. As duas exceções traduzidas (`editor.image.uploading`, `editor.image.uploadFailed`) **precisam entrar nos catálogos `pt` e `en`** — e o `t()` tipado da Tarefa 12 reprova no `tsc` se faltar. |
| E | `noteSearch` e `onUploadImage` continuam **capability-gated** | §3 do `EDITOR.md`. É o que deixa a Tarefa 15 (login) e a 20 (cadastro de livro) usarem o editor sem carregar menção nem upload. |
| F | **Sem `@tiptap/extension-drag-handle-react` se ele não existir na linha 2.10** | O §2 fixa "todas as versões `^2.10.0`". Se esse pacote não existir nessa linha (ou for Pro/pago), **pare e reporte** — não troque de versão nem invente substituto. |

## Regras (o que os testes provam)

O `EDITOR.md` §14 é a checklist de aceitação **manual** — ela é do dono, no celular. As regras
abaixo são o que a **suíte** prova, e seguem a política do `CLAUDE.md`: só o que quebra em
silêncio.

### O que quebra em silêncio (e por isso tem teste)

1. **`extractImageFiles(data)` desiste quando o clipboard também tem texto** (§8.3): colar
   célula de planilha continua texto, colar print vira imagem. Helper puro — **TDD estrito**,
   é o mais testável da fatia.
2. **Nenhum `blob:` nem `data:` entra no `doc`** (§8.1, ADR 0001): o nó só é inserido **depois**
   do upload resolver. Teste com upload que demora, assertando o `doc` antes e depois.
3. **Uploads múltiplos são sequenciais e o primeiro erro aborta o resto** (§8.2). Prove a
   ordem por contagem de chamadas, não por cronômetro (§7.3).
4. **O teste de regressão do paste de imagem** (§11): monta o editor de verdade, cola imagem,
   e **falha se o React estourar** `NotFoundError`. O fake do tippy **precisa reparentear**,
   senão o teste não reproduz o bug. Prove que o teste morde: com o wrapper da pílula
   desmontado condicionalmente, ele tem de ficar vermelho.
5. **As duas `PluginKey` de menção não colidem** (§9): `@` e `[[` funcionam **na mesma
   instância**. Sem `pluginKey` própria uma engole a outra — teste que dispara as duas.
6. **Sincronização sem loop de eco** (§7): `doc` novo por prop chama `setContent(doc, false)`;
   `doc` igual **não** chama nada. Mutar a comparação tem de acusar.
7. **`onChange` recebe ProseMirror JSON**, nunca HTML.
8. **Nenhum botão do editor usa `onClick`** (§4.4). Esta é a regra que separa "gostei do
   editor" de "inutilizável no celular", e ela é **estática e verificável**: um teste que varre
   `RichEditor.tsx`, `SlashMenu.tsx` e `MentionList.tsx` por `onClick=` e falha. Mais um teste
   de comportamento: `onMouseDown` chama `preventDefault`.
9. **`aria-pressed` reflete o estado ativo** em todos os botões de marca.
10. **O menu `/`**: filtra por texto, ↑/↓ com **wrap-around**, Enter confirma, e a seleção
    **volta para 0** quando a lista muda.
11. **O item "Imagem" aparece só quando há upload** (§5): o flag é
    `editor.storage['imageUpload']`, não uma prop. Teste nas duas direções.
12. **Extensões condicionais** (§3): sem `noteSearch`, `@` e `[[` não fazem nada; sem
    `onUploadImage`, o nó `image` **continua registrado** (documento antigo com imagem
    renderiza).
13. **Só H1 e H2** — H3 não existe.
14. **Os tokens que o editor usa existem** — o teste da regra 2 da Tarefa 13 já amarra
    `theme.css` ↔ `@theme inline`; os dois tokens novos (`accent-soft`, `shadow-popover`) entram
    nele de graça.
15. **Toda classe usada pelo editor sai no CSS compilado** — o `ui-source-scan` da Tarefa 13
    já faz isso; confirme que ele continua verde com o `editor.css` no jogo, e que as classes
    escritas à mão no `editor.css` (`no-scrollbar`, os seletores de `.ProseMirror`) chegam ao
    `dist/`.

### O que **não** se testa nesta fatia

Layout, posicionamento do tippy, aparência do bubble menu, se a barra "fica bonita", drag &
drop de bloco. Nada disso quebra em silêncio e tudo isso trava refactor. **A checklist §14 do
`EDITOR.md`, no celular, é o teste dessas coisas** — e é do dono.

## Arquivos a tocar

```
packages/ui/src/components/  RichEditor.tsx · slash-command.ts · SlashMenu.tsx ·
                             note-mention.ts · MentionList.tsx · callout.ts ·
                             image-upload.ts · suggestion-render.ts (a fábrica do §5)
packages/ui/src/components/__tests__/  rich-editor-image.test.tsx · image-upload.test.ts ·
                             + os testes das regras 5–13
                             (o `tippy-fake.ts` NÃO existe: foi medido que nem ele nem o
                              alias sustentavam nada — ver §15 do `docs/EDITOR.md`)
packages/ui/src/editor.css   todo o CSS do ProseMirror (hoje tem 1 linha)
packages/ui/src/index.ts     exportar o RichEditor e os tipos
packages/ui/src/theme.css    +--clube-accent-soft, +--clube-shadow-popover
packages/ui/package.json     +os @tiptap/*, tippy.js (deps de `ui`, não do app)
packages/ui/vitest.config.ts +o server.deps.inline (§12; o alias do tippy foi medido e apagado)
packages/app/src/styles.css  +@import editor.css · +os 2 utilitários novos no @theme inline
packages/shared/src/locales/{pt,en}.ts   +editor.image.uploading · +editor.image.uploadFailed
```

**Não tocar:**

- `packages/backend/**` e `prisma/` — a suíte fica **exatamente** em 948 unit / 261 integração.
- `packages/app/package.json` — **nenhum `@tiptap/*` aqui** (decisão B).
- Os 6 componentes da Tarefa 13 (`button`, `field`, `sheet`, `list`, `filter-chip`,
  `person-avatar`) e os testes deles. O editor é o sétimo, não uma reforma dos outros.
- `--clube-shadow-sheet` — a direção dela é decisão do dono.
- As telas de `packages/app/src/pages/` — são placeholders; a tela de nota é a Tarefa 18.

## Fora de escopo

- **Autosave e o indicador de status** (§7) — é da **tela**, Tarefa 18. O editor só emite
  `onChange`.
- **Offline / rascunho local** (§7) — Tarefa 21.
- **A entidade `Highlight`** — MVP 2. A paleta desta fatia é do editor; mantenha os hex
  espelhados, mas são coisas diferentes (§6).
- **`NoteLink`** (o grafo das menções) — não existe tabela; o editor só emite o nó.
- **`lazy()` do editor** — decisão A, exigência registrada para a Tarefa 18.
- Cor de texto com UI (§6: `Color`/`TextStyle` ficam registrados **sem** UI).

## Definição de pronto

- [x] Os 4 conflitos resolvidos: tokens traduzidos, nenhum `html.dark`, nenhum estilo inline
      além do `--swatch`, e os 2 tokens novos com utilitário mapeado.
- [x] `extractImageFiles` com TDD estrito, incluindo **o caso do clipboard com texto** (1).
- [x] **Nenhum `blob:`/`data:` no `doc`** (2), provado com upload lento.
- [x] O **teste de regressão do §11** existe e **morde** — provado desmontando o wrapper.
- [x] `@` e `[[` convivem na mesma instância (5).
- [x] **Nenhum `onClick`** nos três arquivos de UI do editor, por teste estático (8).
- [x] Menu `/` com wrap-around e reset de seleção (10); item "Imagem" condicional (11).
- [x] `app/package.json` **sem** `@tiptap/*` — verificado.
- [x] As 2 chaves de i18n nos dois catálogos (o `t()` tipado reprova se faltar).
- [x] `ui-source-scan` verde com o `editor.css` no jogo (15).
- [x] **O CUSTO do editor medido e colado no relatório** — é o número que justifica o `lazy()`
      da Tarefa 18: **+454.527 B raw / +143.254 B gzip** (~2,5× o app inteiro de hoje), medido
      construindo o `app` com e sem um `import` do `RichEditor` numa tela.
      ⚠️ **O tamanho do bundle de hoje não é esse número, e não serve de justificativa:** o
      bundle atual tem **zero TipTap** — nenhuma tela importa o editor, o tree-shaking o
      elimina inteiro —, então ele está em **302.374 B raw / 92.675 B gzip**, o mesmo de antes
      desta fatia. Quem citar o bundle no lugar do custo vai concluir que o `lazy()` não é
      necessário.
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` — todos limpos, contagens coladas.
- [x] Backend em 948 / 261 — verificado.
- [ ] Checklist marcada e linha 14 do `BACKLOG.md` fechada. **A checklist §14 do `EDITOR.md`
      fica para o dono testar no celular** — não a marque por ele.
