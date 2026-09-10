# Tarefa 27 — O filtro compartilhado, e o chip que finalmente diz o nome

> A Tarefa 26a entregou `GET /clubs/:clubId/members`. **Esta fatia é onde ela é cobrada:** o
> filtro deixa de dizer "De outras pessoas" e passa a dizer **de Maria** — a lacuna que o MVP 1
> registrou três vezes (linhas 17, 18, 19) e que é a **pergunta 1** do `docs/ACEITE-MVP.md`.
>
> Leia antes: `docs/tasks/26a-rota-membros-do-clube.md` (a rota, e **a frase que decide o chip**),
> `docs/adr/0002-visibilidade-total-no-clube.md`, `docs/tasks/{13-design-system-ui,19-anotacao-avulsa-e-filtro,25-tela-de-grifos}.md`,
> `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§7.4, §7.6.1, §7.8, §7.9**.
>
> **Os vizinhos a imitar quase linha por linha:** `packages/ui/src/components/filter-chip.tsx`
> (o componente que já existe, e o docblock dele — que já diz que o `label` chega **traduzido
> pela tela**), `packages/ui/src/components/{list,person-avatar}.tsx`,
> `packages/app/src/pages/book.tsx` (o filtro `Tudo · Minhas · De outras pessoas`, feito no
> cliente) e `packages/app/src/pages/highlights.tsx` (o filtro por cor).

## Objetivo

Num lugar só, escolho de quem é o acervo que estou olhando — **pelo nome** —, que tipo de
anotação, qual leitura e qual cor. E as duas telas que já tinham filtro passam a usar o mesmo
componente, em vez de cada uma ter o seu.

## Escopo enxuto

**Entra:** o `FilterBar` em `packages/ui` (grupos de `FilterChip`, controlado), a migração dos
**dois** filtros que já existem (`book.tsx` e `highlights.tsx`), e o **chip por pessoa com
nome real**, alimentado pela rota da 26a.

⚠️ **Por que a migração entra:** um componente em `ui/` sem chamador é especulação
(`docs/WORKFLOW.md`), e o desenho de um filtro genérico só se prova contra filtros de verdade.
A Tarefa 13 construiu o design system antes das telas **porque os consumidores estavam
nomeados**; aqui eles **existem**, e migrá-los é o que impede a 28 de descobrir que a
abstração está errada depois de a terceira tela nascer em cima dela.

| Fora | Por quê |
| --- | --- |
| A tela de acervo unificado (anotações + grifos juntos) | É a **Tarefa 28**, e ela é o **terceiro** consumidor deste componente. |
| Busca por texto | É a **Tarefa 29**. |
| Filtro por **leitura** (capítulo) na interface | ⚠️ Ver decisão G: o `FilterBar` **aceita** o grupo, e nenhuma tela desta fatia o usa — a tela do livro já lista o plano dia por dia, e o acervo unificado da 28 é quem tem onde pôr. Entregar o grupo **sem** chamador seria especulação; entregar o componente **sem suportá-lo** faria a 28 reabrir `packages/ui`. A saída medida está na decisão G. |
| Filtro multi-seleção (amarelo **e** verde juntos) | Aditivo. Hoje os dois filtros que existem são de escolha única com um estado "tudo", e é o que as duas telas provaram ser suficiente. |
| `FilterChip` com `renderLink` ou `disabled` | Lacuna registrada na Tarefa 25, e a aba "Grifos" que a motivou é **navegação**, não filtro. Fica registrada. |
| Traduzir a barra do `RichEditor` | ⚠️ Ver "O que esta fatia NÃO conserta, e por que a razão é boa". |

## Decisões já tomadas (não reabrir)

- **O filtro é navegação, não permissão.** Nunca cadeado, nunca "só você vê", nunca contador ao
  lado do nome ("incentivo por presença, não por comparação"). → ADR 0002 + §1 do plano. O
  `filter-chip.tsx` **já** carrega essa guarda; ela vale para o componente novo.
- **`aria-pressed`, nunca `aria-checked`** (regra 25 da Tarefa 13): `aria-checked` pertence a
  `radio`/`checkbox`, e num botão faz o leitor de tela anunciar um controle que não existe.
- **`<button>` nativo** (regra 26): é a plataforma que dá Enter **e Espaço** de graça — e Espaço
  é a tecla de quem usa leitor de tela.
- **`packages/ui` não conhece i18n.** Todo texto chega **já traduzido**, por prop — é o que o
  docblock do `FilterChip.label` já declara.
- ⚠️ **O chip de pessoa se monta SÓ com `status === 'ACTIVE'`.** Os `ARCHIVED` que a rota
  devolve existem **exclusivamente** para resolver o nome de quem escreveu e saiu. → decisão A
  da Tarefa 26a, medida e registrada.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | O `FilterBar` é **controlado**: recebe os grupos e o que está selecionado, e devolve a escolha por callback. Ele **não** guarda estado | É o padrão dos seis componentes da Tarefa 13, e é o que permite a tela decidir se o filtro vive na URL, no `useState` ou em nada. Um componente com estado próprio faria a 28 lutar contra ele. |
| B | Um `FilterBar` com **grupos**, não quatro componentes | As quatro dimensões têm a mesma forma (rótulo do grupo + N chips + um "tudo"), e o que muda é o conteúdo. Quatro componentes seriam quatro cópias da mesma acessibilidade. |
| C | Cada grupo é `role="group"` com `aria-label` próprio | Sem isso, quem usa leitor de tela ouve doze botões seguidos sem saber onde acaba "pessoa" e começa "cor". |
| D | O chip de pessoa leva o `PersonAvatar` no slot `start` — que **já existe** no `FilterChip` e **nunca teve chamador** | Nasceu na Tarefa 13 para este uso exato. Se ele não servir, é sinal de que o slot estava errado, e aí a medição diz. |
| E | ⚠️ A **cor** no chip nunca é o único portador: o chip de cor tem **nome** além da amostra | É a regra 4 da Tarefa 25, já medida lá (apagar o nome dá 2 acusadores). O `FilterBar` recebe a amostra pelo `start` e o nome pelo `label`. |
| F | A migração das duas telas **não muda o comportamento visível**, exceto o chip de pessoa passar a dizer o nome | Refactor com mudança de comportamento escondida dentro é o que faz uma auditoria não saber o que está auditando. |
| G | ⚠️ O `FilterBar` é **agnóstico de dimensão**: ele não sabe o que é "pessoa", "tipo", "leitura" ou "cor" — só renderiza grupos de opções | É isso que faz o grupo de **leitura** da 28 não exigir reabrir `packages/ui`, **sem** entregar hoje um grupo sem chamador. O `BACKLOG` lista as quatro dimensões como o que o filtro **cobre**; cobri-las com um contrato genérico é mais forte que cobri-las com quatro props nomeadas, e é o único desenho em que "sem chamador" não se aplica. |
| H | O chip "Todas" de cada grupo é **do chamador**, não injetado pelo componente | Injetar o "tudo" obrigaria o componente a saber que existe um estado neutro — e o grupo de tipo, na 28, pode não ter. E o rótulo dele é texto, que só a tela sabe traduzir. |

## Regras (o que os testes provam)

### O componente em `packages/ui`

1. Renderiza N grupos, cada um com `role="group"` e `aria-label` próprio, e M chips por grupo.
2. `aria-pressed` reflete a seleção; tocar um chip chama o callback **com a opção**, e o
   componente **não** muda a seleção por si (é controlado — decisão A).
3. ⚠️ O slot `start` do `FilterChip` funciona para o `PersonAvatar` **e** para a amostra de cor,
   e o chip **sempre** tem `label` textual: um chip só-com-amostra é reprovado no teste, porque
   cor não pode ser o único portador de informação (decisão E).
4. Alvo de toque de **44 px** e anel de foco visível — herdados do `FilterChip`, e o teste
   confirma que a composição não os perde.
5. ⚠️ A varredura do ADR 0002 do `packages/ui` roda no componente novo: nenhum cadeado,
   nenhum olho fechado, nenhum termo de privacidade, **e nenhum `<svg>` inline** (o ícone vem do
   `lucide-react`, para o nome importado cair na varredura — a regra estrutural da Tarefa 13).
6. ⚠️ **Nenhuma string de interface nova em `packages/ui`.** Medido antes desta fatia: existem
   **16** strings de português cravadas no pacote, **todas** no `RichEditor`. A guarda nova
   **pina o número** — o componente novo não pode acrescentar a 17ª —, e ela é escrita para o
   número **só poder cair** (é a forma da "exatamente 1 linha vermelha" da Tarefa 25: uma
   asserção que descreve a verdade e morde).

### As duas migrações

7. `book.tsx` e `highlights.tsx` passam a usar o `FilterBar`, e **nenhuma** mantém a sua
   composição de chips própria.
8. ⚠️ A migração é **mensurável**: mudar a marcação do `FilterBar` deixa vermelho em **mais de
   uma** suíte de tela. Se acusar em uma só, uma das telas não está usando o compartilhado (é a
   regra 2 da Tarefa 25, que pegou exatamente isso).
9. O comportamento visível não muda além do nome (decisão F): o filtro por cor continua
   recortando a lista no cliente, e os estados vazio × filtrado-sem-resultado continuam
   distintos.

### O chip por pessoa, com nome

10. A tela carrega `GET /clubs/:clubId/members` e monta **um chip por membro `ACTIVE`**, com o
    nome e o `PersonAvatar`.
11. ⚠️ Membro `ARCHIVED` **não** vira chip — e o nome dele **continua** resolvendo a autoria de
    uma anotação antiga. Os dois lados têm teste: o chip que não existe e o nome que aparece.
12. ⚠️ `name: null` não vira chip vazio nem "null": cai numa frase do catálogo (`t()`), e a
    **tela** escolhe a palavra — o backend não inventa fallback (decisão C da 26a).
13. O chip "Minhas" continua existindo e é **o meu** (o `me` do contexto). ⚠️ E a armadilha da
    Tarefa 18 vale aqui: `me` é `null` fora do `ready`, e sem cuidado **ninguém** é "você".
14. Se `GET /members` **falhar**, o filtro **degrada** para o que a Tarefa 19 entregou
    (`Tudo · Minhas · De outras pessoas`) em vez de desaparecer ou quebrar a tela — o acervo é
    o conteúdo, o filtro é navegação.

### Transversais

15. A varredura **anti-culpa** e a de **privacidade** rodam em **todos** os estados novos, pelo
    helper único do `app` — e a de privacidade agora vive **dentro** do `expectNoGuilt` (a
    correção da Tarefa 25; não a chame duas vezes).
16. Nenhuma string da API na tela — texto **e atributos**. Chaves novas em **`pt` e `en`**.
17. ⚠️ O chunk de entrada continua **abaixo de 450.000 B**, e **cole o número**. Folga antes
    desta fatia: **33.286 B**, e faltam 28 e 29 (projeção medida: ~14,5 kB juntas). Se esta
    fatia estourar a projeção, **diga** — a saída registrada é o `en` por `import()` (medido:
    **8.984 B**), nunca elevar o teto.

## Arquivos a tocar

```
packages/ui/src/components/filter-bar.tsx                    NOVO
packages/ui/src/components/__tests__/filter-bar.test.tsx      NOVO
packages/ui/src/index.ts                                     exporta
packages/ui/src/__tests__/                                   a guarda da regra 6
packages/app/src/pages/book.tsx                              migra o filtro, e o chip ganha nome
packages/app/src/pages/highlights.tsx                        migra o filtro por cor
packages/app/src/pages/__tests__/{book,highlights}.test.tsx   crescer
packages/shared/src/locales/{pt,en}.ts                       as chaves
```

**Não tocar:** `packages/backend/**` e `prisma/` (a rota da 26a está pronta — se esta fatia
precisar de campo novo na resposta, **pare e reporte**) · `packages/ui/src/components/RichEditor.tsx`
e `editor.css` (ver abaixo) · `packages/ui/src/components/filter-chip.tsx` **se der para
compor** (se o `FilterBar` exigir uma prop nova nele, **diga qual e por quê** — o `start` já
existe) · `app/src/{i18n,theme,env}.ts` · `auth/require-auth.tsx` · `offline/**`.

## O que esta fatia NÃO conserta, e por que a razão é boa

**Medido agora: `packages/ui` tem 16 strings de interface em português cravadas, todas no
`RichEditor`** — os rótulos da barra (`"Negrito"`, `"Citação"`, `"Bloco de código"`…) e os
cinco da paleta (`"Grifo amarelo"`…), que vão para o `aria-label`/`title` dos botões. **A barra
do editor é monolíngue mesmo com o app em inglês**, e isso contraria o `CLAUDE.md` ("nenhum
texto solto — tudo via `t('chave')`"). É exatamente a classe que a Tarefa 15 mediu: texto em
`aria-label` passa por teste que lê `textContent`, e `aria-label` é o que o leitor de tela fala.

**O conserto é conhecido e não é caro** — o `RichEditor` recebe um objeto `labels` por prop, e o
app passa os `t()`; é o mesmo padrão que o `FilterChip.label` já usa.

**E ainda assim não entra aqui, por um motivo que vale registrar:** a **pergunta 7** do
`docs/ACEITE-MVP.md` — ainda sem resposta — é *"manter o inglês?"*, com o custo de "cada fatia
escreve tudo duas vezes". Se o dono responder **não**, o conserto certo é **apagar** o segundo
catálogo, e as 32 entradas que esta fatia teria criado (16 chaves × 2 locales, ~2 kB de bundle
pela medição da Tarefa 25) seriam trabalho jogado na direção oposta à decisão dele. Fazer agora
é apostar na resposta.

Fica **registrado nas duas casas** (a linha 27 do `BACKLOG` e a pergunta 7 do `ACEITE-MVP`),
com o número medido — e a regra 6 desta spec garante que o buraco **não cresce** enquanto a
resposta não vem.

## Definição de pronto

- [x] O `FilterBar` é **controlado** e agnóstico de dimensão (decisões A, G).
- [x] Grupos com `role="group"` + `aria-label`; `aria-pressed` nos chips (1, 2).
- [x] ⚠️ Chip **sempre** com `label` textual — cor nunca é o único portador (3). O acusador é o
      **compilador** (`FilterOption.label` obrigatório + `@ts-expect-error`): tornar o `label`
      opcional dá `TS2578` no teste e `TS2322` no componente.
- [x] 44 px e foco preservados na composição (4).
- [x] A varredura do ADR 0002 do `ui` cobre o componente novo, **incluindo `<svg>` inline** (5).
      `filter-bar.tsx` está **pinado por nome** na lista de arquivos lidos.
- [x] ⚠️ **A contagem de strings cravadas em `ui` está pinada e só pode cair** (6) — ⚠️ **mas
      não em 16: são 33 ocorrências / 24 textos distintos, em QUATRO arquivos.** O 16 da spec
      é o número de textos distintos do
      `RichEditor`; faltavam `slash-command.ts` (13), `SlashMenu.tsx` (1) e `MentionList.tsx`
      (1). A guarda é `ui/src/__tests__/no-hardcoded-ui-text.test.ts`, com teto **e** lista
      fechada de arquivos isentos — é a segunda que impede o componente novo de crescer o buraco.
- [x] ⚠️ A migração é **medida**: mudar o `FilterBar` acusa em **mais de uma** suíte (8) —
      apagar o `aria-label` do grupo dá **7 acusadores em 2 arquivos** (6 no `book`, 1 no
      `highlights`).
- [x] O chip por pessoa mostra **o nome**; `ARCHIVED` não vira chip **e** ainda resolve autoria
      (10, 11).
- [x] `name: null` cai numa frase do catálogo, não em "null" (12).
- [x] O `me` nulo não faz ninguém deixar de ser "você" (13) — e a segunda cara da armadilha
      (o `me` nulo dando um chip MEU ao lado de "Minhas") tem acusador por mutação.
- [x] `GET /members` que falha **degrada**, não quebra (14).
- [x] Anti-culpa e privacidade em **todos** os estados novos (15); chaves em `pt` **e** `en` (16).
- [x] ⚠️ **Chunk de entrada colado**, abaixo de 450.000 B (17): **418.114 bytes** (417.830
      unidades UTF-16), **0 marcas** de TipTap, folga de **31.886 B**. ⚠️ **A "divergência de
      283 B não reproduzida" era de UNIDADE, não de build**: o `bundle-guard` somava
      `asset.code.length` (UTF-16) sobre uma string decodificada, e cada acento custa 2 bytes e
      1 unidade — gap medido de **284**. Corrigido para `Buffer.byteLength(…, 'utf8')`.
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas (**408** · **195** · 1287 ·
      **552**; baseline 404 · 182 · 1287 · 536).
- [x] `packages/backend` em **1287** — **intocado**, provado por `git status` e mtime; os
      **367** de integração **não** rodados.
- [x] **Linhas de código coladas** (contador canônico do docblock de `highlights.tsx`) do
      componente novo e das duas telas, antes e depois: `filter-bar.tsx` **45** · `book.tsx`
      400 → **486** · `highlights.tsx` 380 → **381**.
- [x] Checklist marcada; a linha 27 do `BACKLOG.md` é do orquestrador.

## Rodada de correção (os nove itens da auditoria)

- [x] **1 [BLOQUEADOR]** A privacidade do ADR 0002 subiu para o CATÁLOGO:
      `shared/src/locales/__tests__/privacy-terms.ts` (exportado por `@clube/shared/adr-0002`) +
      `adr-0002.test.ts`, percorrendo `pt` **e** `en` inteiros. A lista é **importada** pelo
      `adr-0002-dom.ts` do app, não copiada. Plante em `en`: **0 → 1** acusador; em `pt`:
      **12 → 13**. **Zero falso positivo** nos dois catálogos, com teste dedicado da âncora.
- [x] **2 [ALTO]** "Sempre exatamente um chip pressionado" tem acusador: teste com `/members`
      **deferido** (o `Responder` aceita `Promise<Reply>`). Mutante **0 → 1**.
- [x] **3 [ALTO]** O extrator pega as duas fugas medidas (`={'x'}` e `const X = 'prosa'`):
      **0 → 2** acusadores cada, com heurística de prosa e **zero** falso positivo nas `const`
      de classe/identificador do pacote (teto continua **33**).
- [x] **4 [MÉDIO]** O union voltou a **duas** variantes (`unknown` | `ready`): o `failed` era
      peso morto (0 acusadores). Registrado que ele volta quando a falha ganhar ação própria.
- [x] **5 [MÉDIO]** O "tentar de novo" refaz **as três** cargas, com teste contando
      `/members` = 2 (mutante **0 → 1**). A analogia falsa sobre o `notesAttempt` foi corrigida.
- [x] **6 [MÉDIO]** "O slot `start` nunca teve chamador" era **falso** (dois `<FilterChip
      start={<ColorSwatch/>}>` desde as Tarefas 24/25) — corrigido nos quatro sítios de código.
- [x] **7 [MÉDIO]** A sobreposição do plano ganhou **as duas metades** do nome: inicial de
      verdade + `plan.writerNamed` interpolada, com fallback na frase genérica. +111 bytes.
- [x] **8 [MÉDIO]** `bundle-guard` conta **bytes** (`Buffer.byteLength`), não unidades UTF-16.
- [x] **9 [BAIXO]** O prefixo `author:` ganhou dono: fixture com `userId: 'mine'` — produzível
      pelo `clubMemberResponseSchema` (`z.string()`, sem `.uuid()`). Mutante equivalente
      **0 → 1**.
