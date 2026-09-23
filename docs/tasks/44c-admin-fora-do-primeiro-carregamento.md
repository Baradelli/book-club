# Tarefa 44c — As telas de administração saem do primeiro carregamento

> **Fatia de orçamento, decidida pelo dono em 2026-09-23.** Ela existe porque a folga do
> chunk de entrada caiu para **5.124 B** (1,1%) com **quatro** tarefas ainda por vir, e a
> Tarefa 44 sozinha custou 2.600 B. O veredito sobre o teto era da Tarefa 48; o dono o
> **antecipou** para não interromper a 46 ou a 47 no meio.
>
> Leia antes: `CLAUDE.md` · `docs/BACKLOG.md`, **"Decisões fechadas do MVP 3.5"** ·
> ⚠️ **`packages/app/src/pages/day-note.tsx:52-135`** — é o precedente do `React.lazy()`
> neste projeto, com o argumento escrito · ⚠️ **`packages/app/vite.config.ts:90-140`** — a
> decisão da Tarefa 38d sobre o `globIgnores`, que esta fatia **não** desfaz ·
> `docs/CONVENCOES-CODIGO.md` §7.1, §7.4, §7.9, §7.10.

---

## ⚠️ O que esta fatia entrega, e o que ela NÃO entrega

**Entrega:** o código das telas de administração sai do arquivo que o navegador precisa
baixar **antes de qualquer coisa aparecer**. Isso devolve folga à trava do `bundle-guard`
e acelera o primeiro desenho para todo mundo.

**NÃO entrega — e isto foi medido, não suposto:** *"quem só lê e escreve nunca baixa esse
peso"*. O `globPatterns` do Workbox é `['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}']`
(`vite.config.ts:97`) e precacheia **todo** `.js` emitido, inclusive o chunk do editor. Num
PWA já instalado, o pedaço novo continua sendo baixado em segundo plano — só deixa de estar
no caminho crítico.

⚠️ **E tirá-lo do precache NÃO é tarefa desta fatia**, por duas razões medidas:

1. `vite.config.ts:98-107` registra que o `globIgnores` foi **apagado na Tarefa 38d** e
   avisa: *"é justamente esta chave que NÃO pode voltar com o `push-handler.js` dentro — e
   ela já custou uma rodada de conserto"*.
2. Tirar do precache quebraria **"cadastrar o livro do mês" offline** para o admin — que é
   exatamente quem precisa dela, e num app cuja Decisão D diz que offline é assunto próprio.

**Se o dono quiser essa metade, ela é fatia própria, com ADR.** Registre a opção; não a
faça aqui.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | ⚠️ **MEÇA ANTES DE MEXER, e PARE se o ganho for pequeno** | Se separar as telas de admin devolver menos de ~4 KB, a fatia não resolve o problema que a motivou e vira churn. **Meça primeiro** (ver "As medidas"), escreva o número, e **só então** implemente. Se for pequeno, **pare e reporte** com o número na mão |
| **B** | **O padrão é `React.lazy()` + `Suspense`, como o editor** | `day-note.tsx:129` e `free-note.tsx:100` já o usam, e `day-note.tsx:52` argumenta por escrito que não é otimização prematura. **Não invente um mecanismo novo** |
| **C** | **As telas são as de administração do LIVRO**: `BOOK_NEW_PATH` e `BOOK_EDIT_PATH`, que hoje apontam para o mesmo `BookFormPage` (`router.tsx:111-112`) | São as que o dono nomeou. Elas carregam `book-form.tsx` **e** `plan-editor.tsx`, que é o editor do plano por dia — o maior candidato do app fora do TipTap |
| **D** | ⚠️ **`preferencias`, `acervo` e `busca` FICAM onde estão** | Não são administração: todo mundo as usa, e o acervo é caminho de leitura. **Não amplie o escopo por conta própria** — se você medir que uma delas vale muito, **reporte, não faça** |
| **E** | ⚠️ **O `Suspense` precisa de um `fallback` que não pisque** | O precedente tem os dois modos: `day-note.tsx:806` usa `fallback` visível e `:949` usa `fallback={null}` **de propósito**, com o motivo escrito ao lado. Leia os dois e **escreva por que escolheu o que escolheu** |
| **F** | ⚠️ **NÃO mexa no teto do `bundle-guard`** | O teto de 450.000 fica. A fatia existe para criar folga **debaixo** dele, não para levantá-lo. ⚠️ Se você achar que precisa levantá-lo, **pare e pergunte** |
| **G** | **Nenhuma mudança de comportamento, de rota ou de permissão** | As mesmas URLs, os mesmos papéis (`OWNER`/`ADMIN`), o mesmo 404 para quem não é membro. É uma fatia de empacotamento |

---

## As medidas, e de onde tirá-las

⚠️ **A medição vem primeiro, e ela é a decisão A.**

1. Rode `pnpm --filter @clube/app build` e anote **os bytes por `ls -l dist/assets`** — não
   os "kB" arredondados que o Vite imprime. Ponto de partida: entrada **444.876 B**, CSS
   **35.229 B**, editor **449.522 B**, `index.html` **1.638 B**, precache 26 entradas.
2. Descubra **quanto** `book-form.tsx` + `plan-editor.tsx` (mais o que só eles importam)
   pesam hoje dentro da entrada. O `rollup-plugin-visualizer` **não** está no projeto —
   ⚠️ **não o instale sem perguntar**; prefira medir pela diferença (separar, buildar,
   comparar) ou pelo `build --mode` com `sourcemap` temporário que você **remove depois**.
3. Escreva o número **antes** de decidir seguir.

| peça | onde |
| --- | --- |
| o precedente do `lazy` | `day-note.tsx:52-135`, `free-note.tsx:100` |
| os dois `fallback` e por que diferem | `day-note.tsx:806` e `:949` |
| as rotas a separar | `router.tsx:111-112` |
| o que o SW precacheia | `vite.config.ts:90-140` |
| o acusador do teto | `packages/app/src/__tests__/bundle-guard.test.ts` — ⚠️ **ele compila de verdade** |

---

## As regras

1. **TDD estrito**, e vale para `packages/app`. **Vermelho colado** para cada guarda nova.

2. ⚠️⚠️ **A guarda que dá sentido à fatia: o chunk de entrada NÃO pode conter o formulário
   de livro.** Hoje o `bundle-guard` só mede **tamanho** — um teto que continua verde se o
   código voltar para a entrada e outra coisa encolher na mesma proporção.
   **Escreva a guarda de CONTEÚDO**, no espírito do *"NÃO HÁ EDITOR AQUI"* que
   `acervo.tsx:204` e `busca.tsx:88` já registram.
   **Mutante obrigatório:** troque o `lazy()` por `import` estático → **tem de ficar
   vermelho** *por conteúdo*, não só por byte. ⚠️ **Se só o teto de bytes acusar, a guarda
   é frágil**: no dia em que a fatia seguinte encolher outra coisa, o defeito volta em
   silêncio. É a classe "guarda unidirecional" que a Tarefa 41b pagou.

3. ⚠️ **O `Suspense` tem de ter acusador.** **Mutante:** tire o `Suspense` de volta do
   `lazy` → a tela tem de quebrar num teste, não em produção.

4. **A tela continua funcionando igual.** Os testes de `book-form.test.tsx` passam **sem
   serem reescritos para acomodar o `lazy`**. ⚠️ Se você precisar mudar muitos testes para
   eles passarem, **pare e diga** — é sinal de que o recorte está errado.

5. ⚠️ **O corte de tenant e o papel não mudam.** `OWNER`/`ADMIN` para as telas de admin;
   sem membership → **404**. **Mutante:** deixe a rota preguiçosa sem o guarda de papel →
   acusa.

6. **Nada de `globIgnores`.** A decisão da Tarefa 38d fica. Se você tocar em
   `vite.config.ts`, o `service-worker-config.test.ts` é quem cobra — e ele pina
   propriedades, não texto.

7. ⚠️ **O precache vai ganhar uma entrada a mais** (o chunk novo). Isso é **esperado**:
   anote o número antes e depois e **escreva que é esperado e por quê**, senão a próxima
   auditoria lê como regressão.

8. **Nenhuma chave de catálogo nova**, a não ser que o `fallback` precise de texto — e aí
   ela é uma só, semântica, em inglês.

9. **O tamanho dos arquivos pelo contador canônico** (`acervo.tsx:115-126`), **nunca
   `wc -l`**. ⚠️ O `book.tsx` tem teto de **420** desde 2026-09-23 (decisão do dono).

10. **Varredura de caracteres invisíveis** nos arquivos do diff, **provando antes que
    morde**, com os code points montados **por número**.

---

## Definição de pronto

- [ ] O número medido **antes** de mexer está escrito, e a decisão A foi respeitada
      (seguiu porque o ganho justifica, ou parou e reportou).
- [ ] `BOOK_NEW_PATH` e `BOOK_EDIT_PATH` entram por `React.lazy()` + `Suspense`, no padrão
      do editor, com o `fallback` escolhido **e justificado**.
- [ ] **A guarda de CONTEÚDO existe** e o mutante do `import` estático a deixa vermelha —
      não só o teto de bytes.
- [ ] O `Suspense` tem acusador próprio.
- [ ] Os testes do formulário passam **sem reescrita para acomodar o `lazy`**.
- [ ] Papel e corte de tenant inalterados, provados por teste.
- [ ] `vite.config.ts` **sem `globIgnores`**; a entrada nova no precache está anotada como
      esperada, com o porquê.
- [ ] Bytes colados antes e depois: entrada, CSS, editor, `index.html`, precache — e **a
      folga nova contra os 450.000**.
- [ ] Gates: `pnpm -r test` · `typecheck` · `lint` · `prettier --check` · `build`.
- [ ] Varredura de invisíveis, com a prova de que morde.
- [ ] ⚠️ **A opção que esta fatia NÃO fez está registrada**: excluir o chunk do precache
      para que ele nunca seja baixado por quem não é admin — com o custo (admin perde a
      tela offline) e o risco (`globIgnores` + `push-handler.js`, `vite.config.ts:98-113`).

---

## Notas de reconciliação

_O executor anexa aqui o que mediu e divergiu da spec. Numere de 1 em diante. Se um número
desta spec estiver errado, **corrija-o aqui e no `BACKLOG.md`**, dizendo como mediu._
