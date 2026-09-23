# Tarefa 41a — Os sete primitivos sobre os tokens, e a paleta de avatar que morre

> **Terceira fatia do MVP 3.5.** A entrada 41 do `BACKLOG.md` foi **partida em duas**, e a
> medição que decidiu está logo abaixo. Esta é a metade que **reescreve o que existe**; os dez
> componentes que nascem são a **41b**.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> `docs/tasks/39-tokens-e-fontes.md` e `docs/tasks/40-catalogo-e-guardas.md`, as seções
> **"Notas de reconciliação"** — ⚠️ **nas duas fatias, afirmações rotuladas "medido" caíram
> numa auditoria: três na 39, quatro na 40. Duas delas já estavam gravadas em arquivo
> permanente** · `docs/CONVENCOES-CODIGO.md` **§7.1**, **§7.4**, **§7.9** ·
> `docs/adr/0002-visibilidade-total-no-clube.md` — ⚠️ **é ele que proíbe `<svg>` à mão e
> vocabulário de privacidade em `packages/ui`**.

---

## ⚠️ Por que a 41 virou 41a e 41b

Medido antes de escrever:

| | número |
| --- | --- |
| `it()` nos testes dos primitivos que esta fatia mexe | **69** em 9 arquivos (button 10 · field 7 · list 9 · filter-bar 7 · filter-chip 3 · sheet 11 · person-avatar 17 · styles 3 · avatar-contrast 2) |
| componentes que a entrada 41 mandava criar **além** desses | **11** (`ReadingColumn` e `MarginRail` são dois) |
| telas que consomem os primitivos | `Button` 15 · `Field` 8 · `PersonAvatar` 8 · `ListItem` 5 · `Sheet` 4 · `FilterChip` 4 · `FilterBar` 2 |

Uma fatia com 69 `it()` para reescrever **mais** 11 componentes nascendo, cada um com teste e
mutante, não é auditável: o revisor perde o fio e o "zero acusadores" de um mutante qualquer
passa a valer pouco. As duas metades deixam o app funcionando — a 41a porque só reestiliza o
que já tem consumidor, a 41b porque nada consome o que ela cria até a 42.

---

## ⚠️ E a correção que ENCOLHE a fatia: nenhuma variante é renomeada

O plano da Fase A dizia que o `Button` passaria a ter
`variant?: 'primary' | 'secondary' | 'seal'`. **Medido, e está errado:**

- **`variant="ghost"` tem 29 usos em 15 telas.** Renomeá-lo para `secondary` tocaria 29
  lugares e faria desta fatia o redesign inteiro — e o `ghost` de hoje **já é** o secundário
  do canvas: borda `--border`, sem preenchimento. O nome descreve a mesma coisa;
- **`variant="danger"` tem ZERO consumidores.** Varri `packages/{app,ui}/src` por aspas
  duplas, aspas simples e ternário: a única ocorrência é a própria declaração do tipo em
  `button.tsx:7`. ⚠️ **Não confunda com os utilitários `text-danger` / `border-danger`**, que
  são usados de verdade pelo erro de formulário (`form-styles.ts:28`) e de que a guarda
  `DANGER_STYLE` depende — esses ficam.

✅ **Logo: `ghost` mantém o nome, `danger` morre, `seal` nasce.** Zero tela tocada.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **Nenhuma variante e nenhuma prop existente é renomeada.** `ghost` continua `ghost` | 29 usos em 15 telas, e ele já é o secundário do canvas. Renomear é churn sem ganho, e a fatia perde a propriedade "nenhuma tela tocada" — que é o que a torna auditável |
| **B** | **`variant="danger"` morre, tipo e estilo** | Variante sem consumidor, medido. É o mesmo caso do `--success` na Tarefa 39, e a mesma razão: o que não tem consumidor não é contrato, é peso. ⚠️ **`text-danger`/`border-danger` continuam** — o erro de formulário é deles |
| **C** | **`seal` nasce**: fundo `--gold-soft`, borda `--gold-line`, texto `--gold-strong` | É o estado "li hoje" **marcado** (`Livro.dc.html`: "Li hoje — tirar a marca"). Não é uma terceira hierarquia de ação: é um estado, e é por isso que ele é dourado e não verde |
| **D** | ⚠️ **A decisão F do MVP 3.5 é executada aqui: a paleta de 6 cores de avatar morre** | Medido: `avatarBackgroundClass`, `avatarPaletteIndex`, `AVATAR_BACKGROUND_CLASSES` e `AVATAR_PALETTE_SIZE` são usados **só dentro de `packages/ui`** (`person-avatar.tsx:4,68`) e reexportados pelo barril. **Zero telas.** Quem carrega identidade é a **inicial** — que é o que o `filter-bar.test.tsx` já cobra por escrito ("never lets the COLOUR be the only carrier of information") |
| **E** | **`avatar-contrast.test.ts` passa a medir UM par**, com o mesmo rigor WCAG de hoje, nos dois temas | A guarda não afrouxa: ela troca de alvo. ⚠️ **E ela tem de continuar acusando** — o par `--person-fg` sobre `--person-bg` é o que a tela pinta, e é ele que precisa passar 4,5:1 |
| **F** | **`Field` perde a caixa e mantém a semântica inteira** | `htmlFor`↔`id`, `aria-describedby` na ordem hint→error, ausência de `aria-invalid` quando limpo, render-prop igual. ⚠️ **O que muda é pintura:** rótulo em mono maiúsculo, `border-bottom` que reage a preenchido e a foco, dica abaixo |
| **G** | **`ListItem` ganha `variant?: 'row' \| 'sumario'`, com `'row'` como padrão** | Aditivo: as 5 telas que o usam não mudam uma linha. O `sumario` é a linha do plano (pontinhos de condução + data/página em mono), e ele nasce aqui porque é uma variante do que existe, não um componente novo |
| **H** | **`FilterBar` ganha `collapsed?: boolean` e `onRefine?: () => void`, os dois opcionais** | Aditivo pela mesma razão. Quem recolhe de verdade é a Tarefa 46; aqui nasce só a capacidade |
| **I** | ⚠️ **Nasce `--r-4: 10px` no `theme.css`, e `--radius-sheet` passa a apontar para ele** | Medido na Tarefa 39 e registrado lá: o bottom sheet do canvas tem `border-radius: 10px 10px 0 0` e a escala de quatro raios não tinha 10px — `--radius-sheet` ficou em `--r-3` (4px). ⚠️ **A lista fechada de exceções ao `light-dark()` cresce para cinco raios**, e cada uma continua obrigada a existir no `:root` |
| **J** | **Nenhum texto em `packages/ui`.** Todo componente recebe frase por prop | O teto de 33 do `no-hardcoded-ui-text.test.ts` **só pode cair**, e a lista de arquivos isentos é fechada em quatro (todos do editor) |
| **K** | **Nenhuma tela tocada, e nenhum `.tsx` de `packages/app`** | É o que as decisões A, D, G e H compram. ⚠️ **Se você sentir vontade de "já ajustar" uma tela, PARE** — as telas são das Tarefas 42–48, e é a ordem que mantém cada fatia auditável |

---

## As regras

1. **TDD estrito, componente por componente.** Teste primeiro, vermelho colado, implementação
   mínima, verde colado. Sete primitivos = sete ciclos, não um só.

2. ⚠️ **Os 69 `it()` de hoje são o contrato, e quase nenhum deve mudar.** Eles medem
   **semântica**, não pintura: `type="button"` por padrão, rótulo que fica no DOM durante o
   loading (para a largura não pular), `aria-pressed` e nunca `aria-checked`, linha inteira
   como um elemento interativo só, foco preso no `Sheet` nos dois sentidos, foco devolvido a
   quem abriu, ausência do `Sheet` no DOM quando fechado.
   ⚠️ **Todo `it()` que você precisar EDITAR é suspeito.** Para cada um, escreva no relatório
   **por que a propriedade mudou** — e se a resposta for "porque a implementação mudou", o
   errado é a implementação.

3. **A decisão B com os dois sentidos (§7.1).** Some a variante **e** o estilo dela.
   ⚠️ **Mutante:** devolva `'danger'` ao tipo sem estilo e mostre que o `tsc` ou um teste
   acusa; se nada acusar, a variante saiu pela metade.
   ⚠️ **E confirme por varredura que `text-danger`/`border-danger` continuam emitindo CSS** —
   `ui-source-scan.test.ts` acusa se um deles morrer por engano, e o erro de formulário de
   sete telas depende deles.

4. ⚠️⚠️ **A decisão D, e ela é a mais fácil de estragar.**
   Saem quatro exports do barril (`packages/ui/src/index.ts`) e os seis tokens do `theme.css`
   com os utilitários deles no `@theme inline`.
   - a bijeção token↔utilitário tem de continuar fechando nos **dois** sentidos;
   - `ui-source-scan.test.ts` exige CSS emitido para toda classe que `packages/ui` usa —
     `bg-avatar-1`…`-6` e `text-avatar-fg` **deixam de ser usados**, então saem junto;
   - **Mutantes:** (i) deixar um dos seis tokens no `theme.css` sem utilitário → a bijeção
     acusa; (ii) deixar `bg-avatar-3` numa classe do `PersonAvatar` com o token já removido →
     `ui-source-scan` acusa.

5. ⚠️ **A decisão E com contraste MEDIDO, não conferido por olho.**
   `--person-fg` sobre `--person-bg`, nos dois temas, ≥ 4,5:1 (é texto de 9–11 px).
   ⚠️ **Mutante:** ponha `--person-fg` igual ao `--person-bg` e mostre o acusador. Se o teste
   passar, ele virou asserção vazia (§7.4) — que é exatamente o que ele era em risco de virar
   ao trocar seis pares por um.

6. **A decisão F sem perder uma linha de acessibilidade.** Os 7 `it()` do `field.test.tsx`
   continuam verdes **sem edição**. ⚠️ **Se algum precisar mudar, é a decisão F que está
   errada** — a pintura não tem permissão para mexer na associação rótulo↔controle.

7. **O alvo de 44 px e o foco.** `MIN_TOUCH_TARGET_PX` continua 44, o passo continua 4, e
   `FOCUS_RING` **não muda** — ele já ganhou o anel do §A.6 na Tarefa 39 (contorno `--accent`
   + halo de 18%). ⚠️ **Não reescreva o `FOCUS_RING` aqui.**

8. ⚠️ **Nenhum `<svg>` à mão, em nenhum componente novo ou reescrito.**
   `adr-0002-iconography.test.ts` varre `packages/ui/src` inteiro e proíbe `<svg` inline e
   `dangerouslySetInnerHTML` — todo glifo vem do `lucide-react`, para ter NOME varrível. O
   `seal` usa `Check`; o resto do desenho do canvas é `<div>`, `<span>` e borda.

9. ⚠️ **A decisão I mexe no `theme.css`, que é da Tarefa 39.** Isso é legítimo (o raio de
   10 px foi registrado lá como pendência desta fatia), mas:
   - a lista fechada de exceções do `theme-css.test.ts` cresce para **cinco**, e cada uma
     continua obrigada a existir no `:root` **e** a casar a forma
     `/^\d+(\.\d+)?(px|rem)$/` que a Tarefa 40 acrescentou;
   - **Mutante:** `--r-4: #ff0000` → a validação de forma da isenção tem de acusar.

10. **Um catálogo só, e nenhuma chave nova.** Texto é da Tarefa 40; frase nova nesta fatia
    significa que um componente ganhou texto, e a decisão J proíbe.

11. ⚠️ **Os documentos, com riscar-e-explicar e data:**
    - **`docs/BACKLOG.md`** — a entrada 41 partida em 41a e 41b, com a medição que decidiu; e
      ⚠️ **a decisão F deixa de dizer "executada na Tarefa 41" e passa a dizer "41a"**;
    - **`docs/new-ui.md` §A.8** — o `Button` não ganha `secondary`: risque-e-explique com a
      medição dos 29 usos de `ghost` e dos zero de `danger`.

12. **Gates, com os números medidos ao fim da Tarefa 40 (2026-09-21, tudo verde):**

    | | arquivos | testes |
    | --- | --- | --- |
    | `@clube/shared` | 22 | **601** |
    | `@clube/ui` | 24 | **201** |
    | `@clube/backend` (unit) | 85 | **1975** |
    | `@clube/app` | 35 | **865** |

    `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
    `pnpm --filter @clube/app build`.
    Build: entrada **434.525 B** (teto 450.000) · CSS **27.239 B** · `index.html` **1.638 B** ·
    precache **26 / 1176,71 KiB** · editor **453.606 B** (pelo `ls`).
    ⚠️ **O CSS vai mudar** (estilo novo entra, seis classes de avatar saem) e o chunk de
    entrada quase não. Cole os dois, e diga o que explicou cada delta.

13. **Nenhuma migration, nenhum endpoint, nenhum schema, nenhuma tela.** Se parecer preciso,
    **pare**.

---

## Definição de pronto

- [x] `Button`: `seal` nasce com os três tokens de ouro, `danger` sai do tipo **e** do estilo,
      `ghost` mantém o nome. Os 10 `it()` de hoje verdes, com justificativa escrita para cada
      um que mudou. — **nenhum dos 10 foi editado**; nasceram 5 novos (o `it.each` das três
      variantes conta como um).
- [x] `Field` **pela metade, e a outra metade não é dele** — os `it()` de acessibilidade
      verdes **sem edição** (e são **6**, não 7: medido). A caixa do controle vive em
      `pages/form-styles.ts`, que a decisão K proíbe tocar. → nota nº 1.
- [x] `ListItem` com `variant` aditivo; nenhuma tela consumidora no diff (mtime).
- [x] `FilterBar` com `collapsed`/`onRefine` opcionais **+ `refineLabel`**, os três numa
      união discriminada; nenhuma tela no diff. → nota nº 3.
- [x] `PersonAvatar` sobre `--person-*`; os quatro exports, o arquivo `avatar-color.ts` e os
      **sete** tokens (`--avatar-fg` + os seis) removidos; a bijeção fechando; os dois
      mutantes da regra 4 acusaram (1 e 3 acusadores).
- [x] `avatar-contrast.test.ts` mede **um** par, nos dois temas, e o mutante da regra 5
      acusou (2 acusadores).
- [x] `Sheet` com o raio de 10 px via `--r-4`, **a alça de 36×4** e — rodada de auditoria,
      decisão do dono de 2026-09-21 — **o papel `--surface` do canvas** no lugar do
      `--surface-2`, com o filete de topo; a lista fechada de exceções tem **cinco raios**
      (16 entradas no total) e o mutante da regra 9 acusou (1 acusador). → nota nº 7.
- [x] **As duas perguntas em aberto da fatia voltaram DECIDIDAS pelo dono (2026-09-21)** e
      estão gravadas como decisão, não como omissão: o dia futuro do sumário fica em
      `text-subtle` (nota nº 5) e o papel do sheet vira `--surface` (nota nº 7).
- [x] **`FilterChip` REVERTIDO ao repouso do canvas** (`bg-transparent text-muted`) — o
      repinte da primeira entrega media o elemento errado. → nota nº 10.
- [x] `MIN_TOUCH_TARGET_PX` = 44 e `FOCUS_RING` **inalterado** — `styles.ts` tem `mtime` de
      2026-09-20 23:05 (Tarefa 39), antes do início desta fatia, e md5
      `30ed612905ae792adaa04243f669409b`.
- [x] Nenhum `<svg>` à mão; `adr-0002-iconography.test.ts` verde (os três glifos novos são
      `Check`, `ListFilter` e o `User` que já estava).
- [x] Teto do `no-hardcoded-ui-text` **inalterado em 33**, e a contagem real não subiu:
      nenhum componente ganhou texto.
- [x] **Nenhum arquivo de `packages/app/src/pages/` no diff** — `mtime` dos 49 arquivos
      idêntico antes e depois (`diff` vazio).
- [x] `BACKLOG.md` e `new-ui.md` §A.8 corrigidos com riscar-e-explicar.
- [x] Gates verdes, com CSS e chunk antes e depois e o delta explicado.
- [x] Varredura de caracteres invisíveis: **limpa**, com o canary (soft hyphen + NBSP)
      provando que ela morde. → nota nº 8.

---

## Notas de reconciliação (2026-09-21, medidas na execução)

> Esta seção **não reescreve nada acima**. Ela registra o que foi **medido** ao executar,
> nos pontos em que a spec ou o canvas descreviam outra coisa. Molde: a seção equivalente
> das Tarefas 39 e 40.

### 1. "`Field` sem caixa" é impossível nesta fatia, e a razão é a decisão K

A decisão F manda o `Field` perder a caixa e ganhar `border-bottom` reagindo a preenchido e
a foco. **Medido: o `Field` não pinta o controle.** Ele o recebe por render prop, e quem
decide borda, raio, fundo e altura é `TEXT_INPUT_CLASS`, em
`packages/app/src/pages/form-styles.ts:26-29` — lido por **9** telas
(`grep -rln TEXT_INPUT_CLASS`, sem os testes). Esse arquivo está em `pages/`, e a decisão K
proíbe qualquer arquivo de `pages/` no diff.

Três saídas foram consideradas e duas recusadas:

1. **acrescentar `className` ao `FieldControlProps`** (no molde do `ListItemLinkProps`):
   recusada porque é **inerte** — as 9 telas escrevem `className={TEXT_INPUT_CLASS}`
   **depois** de espalhar `{...control}`, então o `className` do `Field` seria sobrescrito em
   todas. Seria uma prop nova com zero efeito, que é o oposto da decisão B;
2. **variante arbitrária no wrapper** (`[&_input]:border-0 [&_input]:border-b`): recusada
   — ~~porque ganha por ESPECIFICIDADE (descendente 0,2,1 contra utilitário 0,1,0) e por isso
   atropelaria também o `aria-invalid:border-danger` do controle, apagando a borda de erro de
   sete telas em silêncio~~ **mas NÃO por esse motivo, que é FALSO nos dois erros que ele
   contém.**

   ⚠️ **A auditoria compilou o Tailwind do próprio repositório
   (`@tailwindcss/node@4.3.3`, `compile().build([…])`) e a saída é esta:**

   ```css
   .border-danger                                 { border-color: #7a3520 }
   .aria-invalid\:border-danger[aria-invalid="true"] { border-color: #7a3520 }
   .\[\&_input\]\:border-0 input  { border-style: var(--tw-border-style); border-width: 0px }
   .\[\&_input\]\:border-b input  { border-bottom-style: var(--tw-border-style);
                                     border-bottom-width: 1px }
   ```

   **Erro 1 — a especificidade está INVERTIDA.** O descendente é `.classe input` =
   **(0,1,1)** (uma classe + um TIPO); o utilitário é
   `.classe[aria-invalid="true"]` = **(0,2,0)** (uma classe + um atributo). **(0,2,0) vence
   (0,1,1)** — numa briga, quem ganharia é a borda de erro, não o descendente.

   **Erro 2 — não existe briga nenhuma.** `border-0`/`border-b` declaram
   `border-*-width` e `border-*-style`; `aria-invalid:border-danger` declara
   `border-color`. São **longhands diferentes** e **compõem**: o resultado seria
   `border-width:0` + `border-bottom-width:1px` + `border-color: --danger`, ou seja **uma
   borda inferior vermelha** — exatamente o efeito desejado.

   ⚠️ **POR QUE ISSO ERA BLOQUEADOR, e não só um erro:** este é arquivo permanente e era
   a única justificativa TÉCNICA registrada para o `Field` ter saído pela metade. A Tarefa 47
   leria "não faça isso" e evitaria a saída CERTA por um motivo inexistente. É a mesma
   classe de defeito do `dayRange` do `CLAUDE.md`: uma afirmação falsa em arquivo
   permanente custa mais que a ausência dela.

   ✅ **E a decisão de adiar continua de pé, por duas razões que não precisam de CSS:**
   (a) a **decisão K** sozinha — `form-styles.ts` está em `pages/`, e mexer nele pelo lado
   do wrapper é mexer no efeito dele sem mexer no arquivo, o que é pior que mexer no
   arquivo; (b) **acoplamento** — um design system que alcança por seletor descendente o
   filho que o consumidor renderizou passa a depender da TAG que ele escolheu
   (`[&_input]` não pega `textarea`, e `highlight-fields.tsx:191` usa um), e a fiação
   do `Field` hoje é por PROP, que é verificável. A saída limpa continua sendo a 47
   apagar o `TEXT_INPUT_CLASS` e o controle nascer aqui;
3. **entregar o que é do `Field`** — escolhida. Rótulo em mono maiúsculo
   (`font-mono text-micro uppercase tracking-[0.12em] text-muted`, medido em
   `Main.dc.html:48` e `Convite.dc.html:45`) e a **dica ABAIXO do controle**
   (`Convite.dc.html:47,56`). O `border-bottom` do `input` fica para a fatia que puder editar
   `form-styles.ts` — 47 ou 48.

⚠️ **E a única mudança de ordem do DOM da fatia não quebrou uma asserção.** A dica passou
para depois do controle, e a ordem do `aria-describedby` continua dica→erro porque dica e
erro continuam nessa ordem RELATIVA no DOM. Os 6 `it()` do `field.test.tsx` ficaram verdes
**sem uma edição**.

### 2. São **68** `it()` na fatia, não 69 — e o arquivo errado é o `field`

A tabela "por que a 41 virou 41a e 41b" e a regra 6 dizem "os 7 `it()` do `field.test.tsx`".
**Contado:** `grep -c "^\s*it(" packages/ui/src/components/__tests__/field.test.tsx` dá **6**,
e o próprio vitest reportou **6 testes** antes de os dois novos nascerem. Os outros oito
arquivos batem com a tabela (button 10 · list 9 · filter-bar 7 · filter-chip 3 · sheet 11 ·
person-avatar 17 · styles 3 · avatar-contrast 2), então o total é **68**.

⚠️ **E A CONVENÇÃO DE CONTAGEM PRECISA ESTAR ESCRITA, porque é ela que faz o "68" ser
certo.** O que se conta é a **declaração** `it(…)` no início de linha
(`grep -c "^\s*it("`), e **`it.each` NÃO entra** — nem como uma, nem como N casos. Sem essa
regra o mesmo arquivo tem três números defensáveis: o `avatar-contrast.test.ts` de antes da
fatia tinha **2** `it()`, **2** `it.each` e **14** casos executados pelo vitest, e a tabela
da spec usava o primeiro. Quem recontar por outro critério vai achar que a tabela mentiu.

(A contagem do VITEST é outra coisa e está no relatório da fatia: ela conta casos, e é por
isso que `@clube/ui` vai de 201 para 213 testes enquanto os `it()` vão de 68 para bem
menos que isso somado.)

Conta sem consequência prática — mas o número estava no `BACKLOG.md`, que é o arquivo de
maior precedência do projeto, e a lição das duas fatias anteriores é exatamente esta.

### 3. `collapsed` sozinho é um beco sem saída — nasceu `refineLabel` com ele

A decisão H nomeia duas props: `collapsed?: boolean` e `onRefine?: () => void`. **Medido no
canvas** (`Acervo.dc.html:57-60`): a barra recolhida tem uma linha de resumo **e uma pílula
"Refinar"** — e pílula precisa de rótulo. A decisão J proíbe texto em `packages/ui`, então o
rótulo entra por prop.

As três viraram uma **união discriminada**, no molde do `href`/`onClick` do `ListItem`:
`{ collapsed?: false; onRefine?: never; refineLabel?: never }` ou
`{ collapsed: true; onRefine: () => void; refineLabel: string }`. É o compilador que impede
uma barra recolhida sem como abrir o painel, e um botão sem nome acessível.

✅ **E a linha de resumo NÃO ganhou prop de texto:** ela é **derivada** dos grupos — o
rótulo da opção selecionada de cada dimensão, junto por ` · `. Os rótulos já vieram
traduzidos da tela para ir nos chips, e reusá-los é o que impede a Tarefa 46 de manter um
segundo mapa valor → rótulo (a mesma razão de o `onSelect` devolver a OPÇÃO e não o
`value`). Zero chave de catálogo nova, como a decisão J manda.

### 4. ⚠️ A decisão I órfão o `--r-3`, e a spec não diz o que fazer com ele

A decisão I manda `--r-4: 10px` nascer e `--radius-sheet` apontar para ele. **Medido: isso
sozinho deixa `theme-tokens.test.ts › maps every declared token to a utility` VERMELHO** —
`--radius-sheet` era o único utilitário do `--r-3`, e a bijeção token↔utilitário é um para
um nos dois sentidos.

Com cinco raios são necessários cinco utilitários. A distribuição saiu do canvas, não do
gosto:

| token | valor | utilitário | por que, medido |
| --- | --- | --- | --- |
| `--r-1` | 2px | `--radius-mark` | inalterado (e o canvas usa `1px` no lugar que ele ocuparia — nota nº 4 da Tarefa 39) |
| `--r-2` | 3px | `--radius-callout` **(novo)** | a caixa de erro de formulário tem `border-radius:3px` (`Main.dc.html:41`) |
| `--r-3` | 4px | `--radius-control` **(era `--r-2`)** | **32 ocorrências** de `4px` nos artboards, contra 17 de `3px`, e são todas botão, campo e link-botão (`Inicio.dc.html:56,57`, `Main.dc.html:56`, `Acervo.dc.html:51,52`) |
| `--r-4` | 10px | `--radius-sheet` **(era `--r-3`)** | `Avulsa.dc.html:79`: `border-radius: 10px 10px 0 0` |
| `--r-pill` | 999px | `--radius-pill` | inalterado |

⚠️ **Efeito colateral declarado:** `rounded-control` passou de 3px para 4px, e ele está em
**19** ocorrências de produção em `packages/{app,ui}/src` (18 classes + 1 menção em
docblock), contado por `grep`. Nenhum arquivo foi tocado para isso — o valor vem do token —,
e a mudança **aproxima** o app do canvas, que é o oposto de churn.

`rounded-callout` nasce **sem consumidor**, e isso é tensão com a decisão B ("o que não tem
consumidor é peso"). Fica registrado que ele não é novidade de espécie: `rounded-mark` tem
**zero** consumidores de produção desde a Tarefa 13 (contado agora), e `rounded-pill` tinha
zero até esta fatia — a alça do `Sheet` é o **primeiro** uso dele. A alternativa a criar o
`callout` seria apagar o `--r-2` da escala, e isso mudaria a lista fechada de isenções de
cinco raios para quatro — o contrário do que a decisão I pede.

### 5. ⚠⚠ O canvas apaga o dia futuro com um cinza que REPROVA contraste — e escurecer é impossível

O canvas pinta o dia futuro do sumário com `--text-faint` (`Livro.dc.html:150,157,164`). Mas
a Tarefa 39 deixou a guarda
`theme-tokens.test.ts › refuses the FIRST USE of text-faint while it fails contrast`
apontada para este exato momento: `--text-faint` dá **2,45:1** no claro e **2,58:1** no
escuro, contra 4,5:1 de piso, e está escrito **dentro** da guarda que a saída é escurecer o
token, nunca apagar a guarda.

⚠️ **Medido: escurecer é impossível sem destruir a hierarquia.** O vizinho `--text-subtle`
já está NO piso (4,76 / 4,93 / **4,54** contra as três superfícies no claro), e um
`--text-faint` que passasse 4,5:1 ficaria igual ou mais escuro que ele — derrubando
`keeps the three greys in order, so the hierarchy still exists`. **Os três cinzas de legenda
não cabem todos acima de 4,5:1.**

A fatia usou `text-subtle` no dia futuro. Ele **preserva a intenção** do canvas (o futuro
fica mais apagado que a linha lida, que é `--text` cheio), passa contraste, e deixa a guarda
viva. O condutor futuro continua em `--leader-future`, que é filete de 1px e não texto.

✅ **DECIDIDO PELO DONO EM 2026-09-21: fica `text-subtle`, como entregue.** Isto NÃO é
"o que sobrou na falta de resposta" — é a opção (a) das três que estavam na mesa, escolhida
com a medição na frente: os três cinzas não cabem todos acima de 4,5:1, e o dono não quis
nem um quarto cinza (opção b, que apertaria quatro degraus em 4,5–5,8:1) nem uma isenção por
nome pela exceção de "componente inativo" da WCAG 1.4.3 (opção c, defensável só se o dia
futuro não fosse navegavél — e no canvas ele é um `<a>`).

⚠️ **CONSEQUÊNCIA A REGISTRAR, porque ela é duradoura:** `--text-faint` fica no
`theme.css` **sem consumidor nenhum**, com a guarda do primeiro uso ATIVA. Isso é
deliberado e não é dívida esquecida: enquanto ninguém o pinta, o valor do canvas não
reprova ninguém, e no dia em que alguém o pintar o vermelho chega antes do usuário. Quem
quiser usá-lo volta a esta nota e reabre a decisão com o dono — não apaga a guarda.

### 6. TRÊS alvos **desta fatia** ficaram abaixo dos 44px no canvas, e o piso venceu nos três

⚠️ **O TÍTULO DESTA NOTA DIZIA "O CANVAS DESENHA QUATRO ALVOS ABAIXO DOS 44px", E ERA FALSO
NAS DUAS PONTAS.** A auditoria mediu, e eu reconferi contando as alturas dos 21 artboards:

```
$ grep -o 'height: *[0-9.]*px' *.html | sed 's/.*height: *//' | sort | uniq -c
```

O canvas tem **dezenas** de alturas sub-44px: `38px` (×6, a aba do topo em `Acervo`,
`Busca`, `Dia`, `DiaEscuro`, `Livro`, `Preferencias`), `34px` (×6, entre eles os
`<input>` de `Convite` e `NovoLivro`), `32px` (×3, botões de `EditarLivro`), `36px` (×3),
`30px` (×2), `40px` (×2) e `42px` (×2) — contra `44px` (×91), que é o alvo dominante. A
frase só é verdadeira lida como "**quatro dos elementos que ESTA fatia toca**", e escrita do
jeito que estava ela afirmava algo sobre o canvas inteiro que não se sustenta.

⚠️ **E SÃO TRÊS, NÃO QUATRO: a linha do chip não valia.** Ela citava `Acervo.dc.html:65`,
que é um `<span>` de 30px **não interativo** — o chip REMOVÍVEL de filtro aplicado, que nem
existe em `packages/ui`. O `FilterChip` de verdade está em `CorrigirGrifo.dc.html:59` e
`NovoGrifo.dc.html:60`, e lá ele tem **`height:44px`** — o mesmo piso da decisão F. **Não há
divergência nenhuma nessa linha**, e o "custo" que eu declarei para ela não existe.

A tabela, corrigida:

| elemento desta fatia | canvas | entregue | fonte |
| --- | --- | --- | --- |
| pílula "Refinar" do `FilterBar` | **36px** | `min-h-11` (44px) | `Acervo.dc.html:59` |
| botão `seal` no desktop | **40px** | `min-h-11` (44px) | `LivroDesktop.dc.html:55` |
| linha do sumário | **~36–38px** (`padding:9px 0` + ~20px) | `min-h-11` (44px) | `Livro.dc.html:70` |
| ~~chip removível de filtro~~ | ~~30px~~ | — | **não é o `FilterChip`; o do canvas tem 44px** |

A regra 7 desta spec manda `MIN_TOUCH_TARGET_PX` continuar 44 e o `FOCUS_RING` não mudar, e
os três elementos que sobraram são alvos de toque de verdade (a pílula abre o painel, o selo
desmarca a leitura, a linha abre o dia). Onde o canvas e o piso discordam, aqui **o piso
venceu** — e é a única classe de divergência da fatia em que o canvas **não** mandou, porque
a decisão F é anterior a ele e o dono a nomeou.

⚠️ **O que isso custa, e o custo que sobrou fecha:** a linha do sumário fica ~6–8px mais
alta que o desenho, e um plano de 30 dias fica **~180px** mais comprido (6 × 30). Ela ficou
em `min-h-11` (44px, o mínimo) e **não** nos `min-h-14` (56px) da linha comum, justamente
para pagar o mínimo possível dessa conta.

### 7. As divergências de PINTURA — uma FECHOU pelo dono, e as outras continuam abertas

- ✅ **o papel do `Sheet`: DECIDIDO EM 2026-09-21 — adotar `--surface`, como o canvas
  desenha** (`Avulsa.dc.html:79`). Era `bg-surface-raised` (`--surface-2`) desde a Tarefa 13.

  ⚠️ **E O MEU MEDO ERA O OPOSTO DA VERDADE — o dono mediu.** Eu não troquei alegando que o
  raciocínio de contraste do `--text-subtle` da Tarefa 39 "usa `--surface-2` como a cor do
  bottom sheet" e que trocar invalidaria a pior das três medições dele. **Falso:** aquela
  medição é contra as TRÊS superfícies e passa nas três — sobre `--surface` dá **4,93:1**,
  contra **4,54:1** sobre `--surface-2`. Trocar o papel do sheet **MELHORA** o pior caso;
  nada da Tarefa 39 é invalidado. Eu tratei "o token está citado no raciocínio" como "o
  raciocínio depende dele", que é inferência e não medição.

  Soma-se o argumento de desenho, que fecha sozinho: um painel que flutua SOBRE a página
  sendo mais **escuro** que ela é o contrário de elevação. O canvas separa o sheet por outras
  três coisas, e as três estão no componente: o scrim, a sombra que sobe (`--shadow-sheet`,
  negativa no Y) e o filete de topo (`border-t border-line`, que entrou junto).

  `--surface-2` **mantém consumidor** — `home.tsx:436` (`hover:bg-surface-raised`), conferido
  antes de gravar — e ganha outro na Tarefa 46, que é o chip removível do acervo
  (`Acervo.dc.html:65`, `background:var(--surface-2)`);
- ⚠️ **os corpos de 12px, 13px, 14,5px e 11,5px.** O canvas usa 13px no `FilterChip`
  (`CorrigirGrifo.dc.html:59`) e na pílula "Refinar", 14,5px no título do sumário
  (`Livro.dc.html:76`) e **11,5px na dica do campo** (`Convite.dc.html:47,56`); a escala
  fechada de sete degraus da Tarefa 39 não tem nenhum dos quatro. Entregue: `text-sm` (14px)
  no chip e na pílula, `text-ui` (14px) no título do sumário e `text-label` (**11px**) na
  dica.

  ⚠️ **A dica é da mesma espécie e a nota anterior a esquecia**, o que fazia a lista
  parecer completa sendo de três: são **quatro** arredondamentos de corpo, não três.
  Acrescentar degraus à escala é decisão de desenho, e cada degrau novo entra também na
  lista fechada de isenções ao `light-dark()` — que é exatamente o custo que ela existe
  para cobrar. **Continua aberto para o dono.**

### 8. A varredura de invisíveis achou UM caractere — e ele é anterior à fatia

A varredura cobre 20 arquivos (os do diff desta fatia, separados do resto da árvore por
`mtime`) e procura NUL, NBSP, soft hyphen, ZWSP/ZWNJ/ZWJ, LRM/RLM, U+2028/U+2029, narrow
NBSP, word joiner, BOM e U+FFFD.

**Provado que ela morde antes de confiar nela:** com um soft hyphen e um NBSP plantados num
comentário de `filter-chip.tsx`, ela acusou os dois com arquivo, linha e coluna
(`filter-chip.tsx:42:10 SOFT HYPHEN`, `:42:11 NBSP`). O canary foi desfeito por `cp -p` do
backup, com `md5sum -c` OK.

⚠️ **A única ocorrência real é um U+FFFD em `person-avatar.test.tsx:78`, e ele é
DELIBERADO e ANTERIOR**: está num comentário que mostra o próprio caractere de substituição
para explicar o defeito do par surrogate (`o avatar mostra "<U+FFFD>" no lugar da inicial` —
no arquivo ele está como o caractere de verdade, e é por isso que a varredura o vê).
Conferido no arquivo **commitado** (`git show HEAD:…`): presente lá também, na posição 3002.
Não foi introduzido por esta fatia e não foi mexido.

### 9. O par de pessoa passa folgado no TEXTO, e o DISCO quase não se vê — medido

A guarda nova mede o que a decisão E pede: a INICIAL sobre o papel do avatar. Fecha com
folga, pela fórmula de luminância relativa da WCAG 2.1 (3.2.2):

| tema | tinta | papel | contraste |
| --- | --- | --- | --- |
| claro | `--person-fg` `#1b4632` | `--person-bg` `#dde9e2` | **8,55:1** |
| escuro | `--person-fg` `#b5d3c3` | `--person-bg` `#24312a` | **8,44:1** |

⚠️ **Mas, conferindo por conta própria o que a guarda NÃO mede, o disco em si quase não se
separa da página** — contra as três superfícies (`--bg` / `--surface` / `--surface-2`):

| o que | claro | escuro |
| --- | --- | --- |
| `--person-bg` (o preenchimento) | 1,11 / 1,15 / 1,06 | 1,31 / 1,21 / 1,09 |
| `--person-border` (o filete) | 1,43 / 1,48 / 1,36 | 2,12 / 1,97 / 1,76 |

Os seis números do filete estão **abaixo dos 3:1** de componente não textual. Isso **não** é
reprovação automática: o avatar não é um controle e não carrega estado — quem identifica é a
inicial, que passa a 8,5:1 —, e a WCAG 1.4.11 cobre "informação visual necessária para
identificar componentes e estados". O disco é moldura, e no canvas ele é um selo de tinta
clara de propósito: o desenho é caderno, não crachá.

**Fica registrado e não foi mexido**, por três razões: os valores são do canvas, a decisão E
nomeia UM par a medir, e escurecer `--person-border` até 3:1 mudaria um token do canvas sem
o dono pedir. ⚠️ **Se a Tarefa 42 ou a 48 decidir que a moldura precisa se ver** (por
exemplo porque o avatar passa a aparecer sobre `--surface-2` dentro do sheet, onde ele dá
1,36:1), a saída é escurecer `--person-border` e **acrescentar o par à guarda**, não trocar
o piso dela.

### 10. ⚠⚠ O `FilterChip` foi repintado contra o ELEMENTO ERRADO — revertido

A fatia trocou o repouso do `FilterChip` de `bg-transparent text-muted` para
`bg-surface-raised text-content`, citando `Acervo.dc.html:63,65` e escrevendo que o
`text-muted` "fazia o filtro solto parecer desabilitado". **A auditoria mediu os dois
elementos citados:**

- `Acervo.dc.html:63` é um **contêiner** (`<div style="display:flex;flex-wrap:wrap;gap:6px">`);
- `Acervo.dc.html:65` é um **`<span>` de 30px, não interativo** — o chip **removível** de
  filtro aplicado, que é um componente que **não existe** em `packages/ui` (quem o cria é a
  Tarefa 46).

Nenhum dos dois é o `FilterChip`.

⚠️ **O `FilterChip` DE VERDADE está desenhado no canvas, duas vezes**, e é a paleta de
canetas: `CorrigirGrifo.dc.html:59-63` e `NovoGrifo.dc.html:60-64`, dentro do
`<fieldset><legend>Cor da caneta</legend>` — que é literalmente o que
`highlight-fields.tsx:138` renderiza com este componente. Medido lá:

| estado | canvas |
| --- | --- |
| repouso | `<button height:44px>`, `background:none`, `border:1px solid var(--border)`, `border-radius:999px`, Geist 13px, **`color:var(--text-muted)`** |
| pressionado | `background:var(--pen-a)` (a cor da própria caneta), `border:1.5px solid var(--gold)`, `color:var(--text)` |

Ou seja: **o `bg-transparent text-muted` que estava ali desde a Tarefa 13 É o do canvas**, e
o repinte era opinião de desenho minha **contra a fonte** — numa fatia cuja regra diz "onde
o canvas e a spec discordarem, o canvas manda". **Revertido**, e o teste que pinava o
repinte foi reescrito na direção certa (senão ele propagaria o erro e custaria um teste para
desfazer).

⚠️ **A LIÇÃO, e ela é a mesma do `dayRange`:** "medido no canvas" não é medição se o
elemento medido não é o que o componente renderiza. O jeito de não repetir é partir do
CONSUMIDOR — achar a tela que usa o componente (`highlight-fields.tsx`), e só então achar o
artboard dela — em vez de partir do artboard que "parece" ter um chip.

✅ **O pressionado não foi tocado**, e isso é escolha: no canvas ele é a cor da CANETA, que
é dado por opção (`HIGHLIGHT_COLORS` é dado persistido, decisão fechada do MVP 3.5). Pintar
isso é da Tarefa 47, pelo `start`/`className` da opção. O `bg-accent` genérico continua
sendo o "escolhido" das dimensões que não têm cor própria.

### 11. O que a auditoria derrubou — a lista, para a próxima fatia não repetir

**Oito afirmações minhas caíram, cinco delas rotuladas "medido".** Estão consertadas nas
notas acima; aqui elas ficam juntas, porque o padrão vale mais que os itens:

| # | o que eu afirmei | o que foi medido | classe do erro |
| --- | --- | --- | --- |
| 1 | o descendente `[&_input]` "ganha por especificidade (0,2,1 contra 0,1,0)" | `.classe input` é **(0,1,1)** e `.classe[aria-invalid]` é **(0,2,0)** — invertido | **especificidade calculada de cabeça** |
| 2 | ele "atropelaria o `aria-invalid:border-danger`" | são **longhands diferentes** (`border-width`/`style` vs `border-color`) e **compõem** | **inferência tratada como medição** |
| 3 | o repouso do `FilterChip` é `--surface-2` (`Acervo.dc.html:63,65`) | `:63` é contêiner, `:65` é `<span>` não interativo; o chip real está em `CorrigirGrifo.dc.html:59` com `background:none` e `--text-muted` | **elemento errado** |
| 4 | "o canvas desenha QUATRO alvos abaixo dos 44px" | o canvas tem **dezenas**; e um dos quatro (o chip) tem **44px** no canvas | **generalização de amostra** |
| 5 | trocar o papel do sheet invalidaria a medição do `--text-subtle` | sobre `--surface` ele dá **4,93:1**, MELHOR que os 4,54 sobre `--surface-2` | **medo no lugar de conta** |
| 6 | "29 usos em 15 telas" | **12 arquivos** — e eu já tinha medido isso, mas só corrigi nos documentos, deixando o número errado **no docblock de produção** | **correção incompleta** |
| 7 | as cinco sondas do `ui-source-scan` "só existem em `packages/ui`" | **duas das cinco** já eram falsas (`rounded-control` em 10 arquivos do app, `min-h-11` em 5) | **promessa em comentário, §7.1** |
| 8 | "o erro de formulário de sete telas" | **8** telas, e o número contradizia as "9 telas" da minha própria nota nº 1 para outro arquivo | **número sem comando** |

⚠️ **Duas classes de erro aparecem mais de uma vez, e são as de vigiar:**

1. **inferência vestida de medição** (itens 2 e 5): eu sabia uma coisa verdadeira ("o token
   está citado no raciocínio", "os dois seletores tocam o mesmo elemento") e concluí outra
   sem rodar nada. A auditoria **compilou o Tailwind do repositório** para refutar o item 2,
   e a conta de contraste para o item 5. O teste de "isto é medição?" é simples: **existe um
   comando, e existe a saída dele?**
2. **correção incompleta** (item 6): medir, corrigir em dois lugares e deixar o terceiro —
   que era o de produção, o primeiro que o próximo agente lê. `grep` pelo número errado
   ANTES de fechar, não só pelo lugar onde ele foi notado.

✅ **E o que o revisor conferiu e ficou de pé** (para não ser reaberto): os quatro números de
teste, os cinco de build, `styles.ts` intocado, zero arquivo de `pages/` no diff, nenhum
`it()` pré-existente editado nos seis primitivos aditivos, o teto de 33 intacto, os 16 itens
da lista fechada com validação de forma, o U+FFFD pré-existente e commitado,
`.text-danger`/`.border-danger` ainda emitidos com `.text-danger-fg` sumido, os oito
contrastes recalculados do zero, o rótulo do `Field` valor a valor, e a alça do `Sheet`
36×4 com `aria-hidden`.
