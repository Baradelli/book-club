# Tarefa 13 — Design system em `packages/ui`: tokens e componentes base

> Continua o **Bloco D**. A Tarefa 12 entregou o mecanismo de tema; esta entrega a **paleta** e
> os **seis componentes** que as telas 15–21 vão usar. Nenhuma tela de produto aqui.
>
> Leia antes: `CLAUDE.md` (a seção de estilização é taxativa), `docs/CONVENCOES-CODIGO.md`
> (**§7** para teste, **§6.8** para o contrato de resposta), `docs/tasks/12-scaffold-app-pwa.md`
> e a **seção 1 do `docs/plano-clube-do-livro.md`** — os princípios de produto são o briefing
> de design desta fatia, não enfeite.

## Objetivo

Existe um vocabulário visual: tokens nomeados, e botão, campo, sheet, lista, chip de filtro e
avatar prontos para montar tela. Quem escrever a Tarefa 15 não decide cor, espaçamento nem
altura de toque.

## O briefing de design vem dos princípios, não do meu gosto

Do `docs/plano-clube-do-livro.md` §1, e cada um tem consequência concreta:

- **"O caso crítico é escrever no celular, à noite, na cama, com uma mão."** Alvo de toque
  generoso, ações principais ao alcance do polegar (parte de baixo da tela), e **`sheet` que
  sobe de baixo** em vez de modal centralizado.
- **"À noite"** — o tema escuro não é enfeite, é o modo de uso provável. A paleta escura
  precisa ser boa **primeiro**, não uma inversão apressada da clara.
- **Princípio anti-culpa: "não pune ausência de registro".** Nada de vermelho para "você não
  escreveu", nada de badge de pendência, nada de contador de dívida. Vermelho é para **erro de
  formulário**, e ponto.
- **"Incentivo por presença, não por comparação."** O avatar existe para dizer *quem*
  escreveu. **Nunca** para ranquear: sem contador ao lado, sem ordenação por volume, sem
  medalha.
- **"Tudo compartilhado, e isso é decisão"** (ADR 0002). O chip de filtro é **navegação**. Ele
  não pode ter cadeado, olho fechado, "privado" nem qualquer ícone que sugira visibilidade
  restrita.

## Decisões já tomadas (do `CLAUDE.md` — não reabrir)

- **Tailwind v4 via `@tailwindcss/vite`, e NÃO existe `tailwind.config.js`.** Tokens em CSS.
- **Sem CSS inline em telas reais.**
- **Nenhum texto solto**: tudo via `t('chave')`, chaves semânticas em inglês. Um componente de
  `ui/` **não** chama `t()` — ele recebe texto por prop, senão a biblioteca vira dona do
  catálogo.
- Ícones: `lucide-react`.
- Teste de UI **só nos fluxos que quebram em silêncio**.

## ⚠️ Duas coisas que a leitura do código revelou, e que decidem a fatia

### 1. O Tailwind **não vai ver** `packages/ui` — e o sintoma é componente sem estilo

A detecção automática de fontes do Tailwind v4 **ignora `node_modules`**, e num workspace pnpm
o `@clube/ui` chega ao app **como symlink dentro de `node_modules`**. Consequência: um
componente que use `class="px-4 py-2"` em `packages/ui` **não gera CSS nenhum**. O componente
renderiza cru, e parece bug de CSS — não de configuração.

O conserto é declarar a fonte no `packages/app/src/styles.css`:

```css
@source '../../ui/src';
```

**E prove por build, não por leitura** — foi exatamente assim que a Tarefa 12 descobriu que o
`dark:` não obedecia o `data-theme`: compilando e lendo o CSS emitido. O teste desta regra é
`build` + `grep` da classe no `dist/assets/*.css`.

### 2. A cascata do tema está escrita **três vezes**, e a paleta completa multiplica isso

Hoje o mesmo "o que é escuro" aparece em três lugares:

1. `ui/theme.css`, bloco `@media (prefers-color-scheme: dark)`;
2. `ui/theme.css`, bloco `:root[data-theme='dark']`;
3. `app/styles.css`, o `@custom-variant dark` (que espelha a cascata dos dois).

Com 3 tokens isso é chato. **Com a paleta completa — 20, 30 tokens — é a receita da
dessincronia**, e a sincronia hoje é afirmada em comentário ("mudou um, mude o outro"), que é
literalmente o que o §7.1 condena. A Tarefa 12 pôs um teste que confere se os dois blocos de
`theme.css` têm os mesmos pares; esse teste vai crescer junto com a paleta e continuar sendo
uma rede, não uma solução.

**Proposta: colapsar 1 e 2 com `light-dark()`.** Um valor por token, uma vez:

```css
:root {
  color-scheme: light dark;              /* aceita os dois */
  --clube-bg: light-dark(#fbfaf8, #171614);
  --clube-fg: light-dark(#1c1a17, #f2efe9);
}
:root[data-theme='light'] { color-scheme: light; }
:root[data-theme='dark']  { color-scheme: dark; }
```

O `light-dark()` resolve pelo `color-scheme` computado, então a **escolha explícita passa a ser
uma linha só** (trocar o `color-scheme`), em vez de repetir a paleta. Some a duplicação 1↔2, e
o `@custom-variant` (3) continua necessário só para os utilitários `dark:` do Tailwind.

**O que precisa da sua decisão:** `light-dark()` é Baseline 2024 (Chrome 123+, Safari 17.5+,
Firefox 120+). Para um PWA que você e sua esposa abrem em celular atual, é seguro; num Android
com WebView antigo, o token vira inválido e a cor **não** cai para um fallback bonito — cai para
o valor herdado. Se preferir compatibilidade, mantemos os dois blocos e o teste de sincronia
cresce com a paleta (é o custo, e é honesto).

**Duas armadilhas do `light-dark()` que a spec exige tratar:** ele resolve no ponto de **uso**,
não de declaração — então um componente que declare `color-scheme` próprio inverte os tokens
dentro de si; e o `@theme inline` da Tarefa 12 precisa continuar `inline`, senão o valor
congela.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **Nenhuma dependência nova** — variantes com um `cx` local de ~10 linhas | `class-variance-authority` + `clsx` resolvem melhor em projeto grande, mas o `CLAUDE.md` fixa a stack e seis componentes não justificam duas deps. |
| B | Componentes **não chamam `t()`** — recebem texto por prop | Se `ui/` traduzir, ele passa a ser dono de chave de catálogo, e o `CustomTypeOptions` da Tarefa 12 (que vive no app) deixa de valer para ele. |
| C | **Sem Storybook** | Ferramenta a mais para manter; a Tarefa 15 já é a primeira tela real e serve de vitrine. Registrado como possível dívida se o design system crescer. |
| D | `sheet` é **bottom sheet** no mobile e diálogo centrado no desktop | O princípio "uma mão, na cama" manda no mobile; no desktop largo um sheet colado embaixo fica esquisito. Mesmo componente, dois layouts por media query. |
| E | Avatar deriva **cor e iniciais do `id`**, não do nome | `User.name` é **nullable** no banco (o convite cria a pessoa sem nome), então derivar do nome quebraria; e cor por `id` é estável quando a pessoa se renomeia. |
| F | Alvo de toque mínimo **44px** | É o mínimo da Apple HIG e o que o princípio "uma mão, à noite" exige. Botão pequeno vira botão de precisão. |
| G | Foco visível **sempre**, inclusive no mobile | Remover outline é a primeira coisa que se faz por estética e a primeira que quebra teclado. `:focus-visible` fica. |
| H | `react` e `react-dom` entram como **devDependency** do `ui` | Achado registrado na Tarefa 12: o pacote só tem `peerDependencies` e o primeiro componente não compilaria. |

## Os tokens

Nomes `--clube-*`, em `packages/ui/src/theme.css`. O conjunto mínimo que as telas 15–21
precisam, e nada além:

- **Superfície:** `bg`, `surface` (cartão/sheet), `surface-raised`, `border`, `border-strong`.
- **Texto:** `fg`, `fg-muted` (metadado, "há 2 dias"), `fg-subtle` (placeholder).
- **Ação:** `accent`, `accent-fg`, `accent-hover`. Uma cor de ação só — o app não tem
  hierarquia de botão colorido.
- **Estado:** `danger`, `danger-fg` (**erro de formulário e ação destrutiva, nada mais** — ver
  o princípio anti-culpa), `success` (o "salvo" do autosave da Tarefa 18).
- **Foco:** `ring`.
- **Raio e sombra:** `radius`, `radius-lg`, `shadow-sheet`.

Cada token entra no `@theme inline` do app com nome de utilitário (`bg-surface`, `text-muted`,
`border-line`, …). **Token que não tem utilitário mapeado não serve para nada** — é regra
testável.

## Os componentes

Todos em `packages/ui/src/components/`, exportados pelo `index.ts`.

1. **`Button`** — variantes `primary` · `ghost` · `danger`; tamanhos `md` (44px) e `lg`;
   `loading` (desabilita e mostra spinner sem mudar a largura, senão o layout salta);
   `asChild` **não** (mantém simples). Renderiza `<button type="button">` por padrão.
2. **`Field`** — rótulo + input + mensagem de erro + dica, com `id`/`htmlFor` amarrados e
   `aria-describedby`/`aria-invalid` corretos. **É o componente que o §6.2 e o §6.8 cobram**:
   ele recebe a mensagem **já traduzida** (a tela usa `apiErrorKey` + `t()`), nunca uma string
   da API.
3. **`Sheet`** — sobe de baixo no mobile, centrado no desktop (decisão D). Fecha com `Esc`,
   clique no backdrop e botão explícito; **prende o foco** enquanto aberto e **devolve o foco**
   ao elemento que o abriu; trava o scroll do fundo.
4. **`List`** / **`ListItem`** — a lista de livros (16), de anotações (19) e o plano de leitura
   (17). Item clicável inteiro (alvo grande), com slot de início (avatar/ícone), título,
   subtítulo e slot de fim.
5. **`FilterChip`** — o `Tudo · Minhas · de <pessoa>` do ADR 0002. `pressed` como estado
   (`aria-pressed`), não `checked`. **Sem** ícone de cadeado/privacidade.
6. **`PersonAvatar`** — iniciais + cor derivada do `id` (decisão E); tamanhos `sm`/`md`; aceita
   `name: string | null` e cai para um glifo neutro quando é `null`.

## Regras (o que os testes provam)

### Tokens e build

1. **Toda classe usada por um componente de `ui/` existe no CSS compilado.** Teste: `build` do
   app + `grep` no `dist/assets/*.css` de um punhado de classes que só existem em `ui/`. É a
   prova do `@source` (⚠️ 1) — sem ela, todo componente renderiza cru.
2. **Todo token `--clube-*` declarado tem utilitário mapeado** no `@theme inline`, e
   vice-versa: nenhum utilitário aponta para token inexistente. Teste estático lendo os dois
   arquivos.
3. A cascata do tema não tem valor duplicado (se a decisão do `light-dark()` for aprovada) —
   ou os blocos duplicados continuam **em sincronia**, pelo teste que a Tarefa 12 criou.
4. `color-scheme` acompanha o tema, para que controle nativo (scrollbar, `input date`) não
   fique branco no escuro.

### `Button`

5. Renderiza `type="button"` por padrão; `type="submit"` só quando pedido.
6. `disabled` **e** `loading` impedem o `onClick`.
7. `loading` **não muda a largura** do botão (o layout não salta).
8. `loading` anuncia estado para leitor de tela (`aria-busy`).
9. Alvo de toque ≥ 44px nos dois tamanhos.

### `Field`

10. `label` e `input` amarrados por `id`/`htmlFor` — clicar no rótulo foca o campo.
11. Com erro: `aria-invalid="true"` e `aria-describedby` apontando **a mensagem de erro**.
12. Com dica e erro juntos, o `aria-describedby` referencia **os dois**, na ordem certa.
13. Sem erro, **não** existe `aria-invalid`.
14. A mensagem de erro é **prop já traduzida** — o componente não conhece i18n nem a API.

### `Sheet`

15. Fechado, **não** está no DOM (não é só `hidden`) — senão o foco tabula para dentro dele.
16. `Esc` fecha.
17. Clique no backdrop fecha; clique **dentro** não.
18. Enquanto aberto, o foco **não escapa** para o fundo.
19. Ao fechar, o foco **volta** para quem o abriu.
20. Aberto, o scroll do fundo está travado; ao fechar, destravado.
21. `role="dialog"` + `aria-modal` + rótulo acessível.

### `List` / `ListItem`

22. O item inteiro é o alvo (um `button`/`a` só, não um `div` com `onClick`).
23. Navegável por teclado, na ordem visual.
24. Sem `href`, é `button`; com `href`, é `a` — e nunca os dois.

### `FilterChip`

25. `aria-pressed` reflete o estado.
26. Ativável por `Enter` e `Espaço`.
27. **Nenhum ícone ou rótulo de privacidade/visibilidade** — teste que varre o componente por
    `lock`, `eye-off`, `private`. É o ADR 0002 virando guarda automática.

### `PersonAvatar`

28. Iniciais: uma palavra → 1 letra; duas ou mais → 2 letras; ignora partículas (`de`, `da`).
29. `name: null` → glifo neutro, **sem estourar**.
30. A cor é **determinística pelo `id`**: o mesmo `id` dá a mesma cor sempre, e ids diferentes
    se distribuem pela paleta.
31. Nome com acento, emoji ou uma letra só não quebra a extração.
32. **Contraste suficiente** entre a cor de fundo derivada e o texto das iniciais, nos dois
    temas — o gerador não pode sortear amarelo com texto branco.

### A política de teste desta fatia

O `CLAUDE.md` diz **UI só nos fluxos que quebram em silêncio**, e é o que a lista acima faz:
**semântica de acessibilidade e foco**, não snapshot de layout. Um `aria-describedby` que
aponta para o id errado, um foco que escapa do sheet, um `dark:` que não obedece — nada disso
aparece na tela do desenvolvedor, e tudo isso quebra para quem usa teclado ou leitor.

**Não escreva:** snapshot de markup, teste de cor exata, teste de "renderiza sem erro".

## Arquivos a tocar

```
packages/ui/src/theme.css                a paleta completa
packages/ui/src/cx.ts                    o helper de classe (~10 linhas)
packages/ui/src/components/              button · field · sheet · list · filter-chip ·
                                         person-avatar (+ initials.ts, avatar-color.ts)
packages/ui/src/index.ts                 o barrel
packages/ui/src/**/__tests__/            os testes das regras 5–32
packages/ui/package.json                 +react/react-dom/@types/* em devDependencies (H),
                                         +@testing-library/react, +jsdom
packages/ui/vitest.config.ts             NOVO — hoje o pacote roda com o include default,
                                         diferente do `src/**` de shared e app (achado da 12)
packages/app/src/styles.css              +@source '../../ui/src' · +os tokens novos no
                                         @theme inline
packages/app/src/__tests__/              o teste da regra 1 (build + grep) e da regra 2
```

**Não tocar:**

- `packages/backend/**` e `prisma/` — nada de backend nesta fatia. A suíte tem de ficar
  **exatamente** em 948 unit / 261 integração.
- `packages/shared/**` — inclusive os catálogos. Componente de `ui/` **não** traduz (decisão
  B), então não há chave nova. Se você achar que precisa de uma, **pare e reporte**.
- `packages/ui/src/editor.css` — **Tarefa 14**.
- As páginas de `packages/app/src/pages/` — são placeholders da 12; as telas reais são 15+.
  Você pode usá-las para provar a regra 1, mas **restaure** o que plantar.
- `packages/app/src/{auth,i18n,theme,router,env}.*` — a fatia 12 está fechada e auditada.

## Fora de escopo

- **Qualquer tela de produto** (15–21) e o **editor** (14).
- Storybook (decisão C), tema por clube, paleta de grifos (MVP 2).
- Animação além de transição de abrir/fechar do sheet.
- Componente de formulário completo (React Hook Form entra na Tarefa 15, com a primeira tela).
- Ícone customizado — usa `lucide-react`.

## Definição de pronto

- [x] **A regra 1 provada por build**: classe que só existe em `ui/` aparece no
      `dist/assets/*.css`. Sem isso, nada mais desta fatia funciona na tela.
      Medido nas duas direções: SEM o `@source`, a sonda plantada em `ui/src` não gerava CSS;
      COM ele, gera. No `dist/` final: `.rounded-control`, `.bg-avatar-4`, `.shadow-sheet`,
      `.min-h-13`, `.rounded-t-sheet`. Acusador automático:
      `packages/app/src/__tests__/ui-source-scan.test.ts` (compila o app e confere TODAS as
      classes de `ui/`, não uma amostra).
      **Rodada de correção:** o EXTRATOR desse teste errava nas duas direções e foi
      reescrito como UNIÃO de duas varreduras — por CONTEXTO (`className=`, `className={…}`,
      `cx(…)`, onde todo token é classe) e por FORMA (todo literal, exigindo separador ou
      pertencer a `SINGLE_WORD_UTILITIES`, que é o que cobre as tabelas de classe). As três
      sondas da auditoria voltaram medidas: `'sondaunica'` **acusa**,
      `'aria-invalid:sonda-variante'` **acusa** (a exclusão `aria-*`/`data-*` passou a ser
      ancorada, `/^(?:aria|data)-[a-z-]+$/`, senão as variantes que a Tarefa 15 vai querer
      ficariam isentas), e `const FALLBACK_ALT = 'member of the club'` **não** dá falso
      positivo. `'invisible'` (a classe da regra 7) e `'border'` (da tabela do `ghost`) agora
      são conferidos, e há teste para os dois. Achado novo da mesma rodada: `'lucide-react'`
      tem a forma exata de um utilitário — especificador de módulo passou a ser removido
      antes da varredura.
- [x] Tokens completos, cada um com utilitário mapeado (regra 2), e a duplicação da cascata
      **resolvida ou pinada por teste** (regra 3). Resolvida: `light-dark()` (⚠️ 2 aprovada),
      um valor por token. `theme-tokens.test.ts` amarra as duas direções; `theme-css.test.ts`
      foi reescrito e prova que todo token de cor usa `light-dark()`, que a lista de exceções
      é fechada (só os dois raios) e que os dois `[data-theme]` trocam só `color-scheme`.
- [x] Os 6 componentes com as regras 5–32; em especial **o foco que volta ao fechar o sheet**
      (19), **o `aria-describedby` com dica e erro juntos** (12) e **o contraste do avatar nos
      dois temas** (32). Os três têm mutante medido e acusado.
      **Rodada de correção:** os dois testes da regra 14 eram infalsificáveis (`getByText`
      num corpo que é `{error}` — removendo o `id={errorId}` do `<p>` os dois ficavam
      verdes) e foram **apagados**; o conteúdo que eles diziam provar está nos testes 11 e
      12, onde é provado pelo elo. A metade substantiva da regra 14 — "**nunca** uma string
      da API" — **não tem imposição nenhuma** e está registrada como pergunta aberta no
      docblock de `FieldProps.error`, para o dono decidir na Tarefa 15 (tipo nominal
      `TranslatedText` × regra de ESLint).
- [x] O piso de toque de 44px (regra 9) **ancorado no CSS compilado**, não em si mesmo.
      Os dois mutantes de uma linha que sobreviviam — `MIN_TOUCH_TARGET_PX` 44→36 e
      `SPACING_STEP_PX` 4→8 — passaram a ser acusados (3 e 4 testes). O CSS diz
      `--spacing:.25rem` e `.min-h-11{min-height:calc(var(--spacing) * 11)}`, e é contra ele
      que a conta é refeita (`ui-source-scan.test.ts`); a decisão F em si é pinada em
      `packages/ui/src/components/__tests__/styles.test.ts`.
- [x] A guarda do ADR 0002 (27), agora sobre **`ui/src` inteiro** e não só o `FilterChip` —
      `packages/ui/src/__tests__/adr-0002-iconography.test.ts`. Duas cegueiras medidas: a
      varredura de termos cobria um arquivo só (um `<Lock />` no `list.tsx` sobrevivia), e
      **desenho não tem palavra** (um cadeado em `<svg>` inline no `FilterChip` sobrevivia
      aos 89 testes). A guarda durável é **nenhum `<svg` inline em `ui/src`**: com todo ícone
      vindo do `lucide-react`, o glifo tem NOME e cai na varredura de termos.
- [x] `packages/ui/vitest.config.ts` alinhado com os outros pacotes.
      **Rodada de correção:** o `--passWithNoTests` saiu do script `test` dos **três**
      pacotes que o tinham (`shared`, `ui`, `app`; o `backend` nunca teve). Medido: com o
      `include` do `ui/vitest.config.ts` quebrado, `vitest run --passWithNoTests` respondia
      **exit 0 com zero testes** — os 100 testes do `ui` podiam desaparecer com o
      `pnpm -r test` da raiz verde. Sem a flag, o mesmo cenário sai com exit 1. Nenhum
      pacote ficou com a flag: todos os quatro têm teste.
- [x] Nenhuma dependência nova de runtime além de `react`/`react-dom` como devDependency.
      `@clube/ui` continua sem bloco `dependencies` — há teste para isso.
      **Rodada de correção:** `lucide-react@0.469.0` entrou em `peerDependencies` +
      `devDependencies` (o mesmo padrão do `react`, e **não** `dependencies`, senão o
      `no-i18n.test.ts` fica vermelho com razão), porque o `CLAUDE.md` manda "Ícones:
      `lucide-react`" e havia **três** SVGs desenhados à mão: `spinner.tsx` (→ `Loader2`),
      o X de fechar do `sheet.tsx` (→ `X`) e o glifo neutro do `person-avatar.tsx` (→
      `User`). O `spinner.tsx` foi **apagado** e saiu do barrel. O PWA não ganha um byte
      além dos ícones: `pnpm` resolve `packages/ui/node_modules/lucide-react` e
      `packages/app/node_modules/lucide-react` para o **mesmo** caminho real em `.pnpm`.
- [x] Nenhum componente chama `t()` nem importa de `@clube/shared/locales`.
- [x] **A hierarquia de superfície da página** (rodada de correção). O shell do `App.tsx`
      pintava `bg-surface` — a cor de **cartão** — como fundo de página. Contraste MEDIDO
      página × `bg-surface`: **1.0000:1 nos dois temas**, ou seja, o `FilterChip` não
      pressionado, o `hover` do `ListItem` e o `hover` do botão fechar do `Sheet` pintavam
      exatamente a cor da página. E o `body { background-color: var(--clube-bg) }` era tinta
      morta, porque o div ganhava. O shell passou a `bg-canvas` (→ `--clube-bg`): contraste
      **1.0174:1 no claro** e **1.0875:1 no escuro**. `bg-canvas` **não existia** no CSS
      compilado (ninguém o usava); usá-lo é o que o emite. Acusadores: 4 testes novos em
      `packages/app/src/__tests__/theme-tokens.test.ts` (2 acusam o mutante
      `bg-canvas`→`bg-surface`).
- [x] `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .` limpos;
      `pnpm --filter @clube/app build` gera `dist/` com service worker e manifest.
      **Rodada de correção:** o `styles.css` ganhou `@source not '**/__tests__'` e
      `@source not '../../ui/src/**/__tests__'`. Medido: o Tailwind extrai classe de arquivo
      de teste **e de comentário dentro dele**, e a lista `SINGLE_WORD_UTILITIES` do
      `ui-source-scan.test.ts` (dado de teste) mais um `min-h-10` citado em comentário
      emitiam **3,5 kB** de CSS que nenhuma tela usa. `dist/assets/*.css`: **17,77 kB →
      14,27 kB**. Acusador: `ships no class that only a test mentions`.
- [x] Backend em **948 / 261** — verificado, não presumido (e reverificado na rodada de
      correção, onde a única mudança no `backend` autorizada era o script `test`, que já
      não tinha a flag).
- [ ] Checklist marcada e linha 13 do `BACKLOG.md` fechada. — **checklist marcada; o
      `BACKLOG.md` NÃO foi tocado**: o dono pediu explicitamente que a linha 13 fique com ele.

## Registrado na rodada de correção — decisão do dono, não consertado

1. **`--clube-shadow-sheet` é `0 -10px 30px`** — sombra para CIMA. Certo no bottom sheet do
   celular (ele sobe de baixo, e a sombra sobe com ele); torto no diálogo centrado do
   desktop (`sm:items-center`), onde a sombra sai por cima do painel. Um `sm:` na sombra
   resolveria, mas é **gosto do dono** e não defeito. Não mexido.
2. **A regra 14 não tem imposição para "nunca uma string da API"** — `error?: string` aceita
   `apiError.message` sem objeção, e nenhum teste de runtime distingue as duas (são as duas
   `string`). As saídas são tipo nominal (`TranslatedText`, que contamina toda prop de texto
   do design system) ou regra de ESLint (mais barata, mais frouxa). Registrado como pergunta
   aberta no docblock de `FieldProps.error`; a Tarefa 15 é o lugar de decidir.
3. **O `FOCUSABLE_SELECTOR` do `Sheet` escapa do extrator por duas barreiras de força
   diferente** — os seletores com `[` são rejeitados pela estrutura do `CLASS_TOKEN`, mas os
   quatro `*:not([disabled])` só escapam porque `(` e `)` não estão na classe de caracteres
   permitida (acidente feliz). Hoje há uma segunda barreira, deliberada: eles não moram em
   posição de `className`/`cx`, então a varredura por contexto não os vê. Se a primeira
   cair, a saída é uma exclusão explícita de seletor — não alargar o `CLASS_TOKEN`.
4. **O contraste página × cartão no tema CLARO é 1.0174:1** (`#fbfaf8` × `#fdfcfa`, um passo
   de 2–3/255). É a hierarquia mínima que existe, e ela sustenta o `hover` do `ListItem` — o
   único retorno visual de "dá para tocar aqui". No escuro é 1.0875:1, folgado. Se o dono
   achar o hover claro imperceptível no celular, o conserto é escurecer `--clube-surface` no
   lado claro do `light-dark()` (uma linha), e o teste que existe hoje (os três valores da
   hierarquia têm de ser diferentes) continua valendo.
5. **A varredura de termos do ADR 0002 não pega frase inventada fora da lista.** Ela ganhou
   os radicais de visibilidade (`só voc`, `somente voc`, `apenas voc`, `visível para`, …) e o
   casamento é ancorado à esquerda por medição (`blocked` e `SCROLL_LOCK_CLASS` contêm
   `lock` e são legítimos). O que a torna suficiente na prática é a decisão B: componente de
   `ui/` **não carrega texto de usuário**, então qualquer frase literal ali já é sintoma
   duplo. Se um dia carregar, essa guarda precisa de outro desenho.
