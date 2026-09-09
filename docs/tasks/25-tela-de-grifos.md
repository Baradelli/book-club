# Tarefa 25 — A tela de grifos do livro

> O backend do grifo está pronto e auditado (Tarefas 22–24). Esta fatia é a **primeira vez que
> o dono vê um grifo na tela**: a coleção do livro, filtrável por cor, e o formulário que
> registra o trecho, a cor da caneta, a página e o comentário — com o mesmo editor.
>
> Leia antes: `docs/tasks/{22-usecase-grifo,24-prisma-rotas-grifo}.md` (as **quatro rotas** e a
> armadilha do `%23`), `docs/tasks/19-anotacao-avulsa-e-filtro.md` (a fatia irmã: lista +
> formulário com editor, e o filtro no cliente), `docs/adr/0002-visibilidade-total-no-clube.md`,
> `docs/adr/0004-grifo-entidade-propria.md`, `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6.8**
> (o cliente valida a resposta) e **§7.4, §7.6.1, §7.8, §7.9**.
>
> **Os vizinhos a imitar quase linha por linha:** `packages/app/src/pages/free-note.tsx` (o
> editor `lazy`, o autosave, arquivar com confirmação), `pages/book-form.tsx` +
> `pages/plan-editor.tsx` (a divisão feita **antes** de a tela crescer), `pages/book.tsx` (as
> abas e a listagem com filtro), `pages/paths.ts` (os endereços num módulo sem dependência).

## Objetivo

Registro no app o que grifei no livro de papel — o trecho, a cor da caneta, a página e o meu
comentário — e vejo a coleção do livro, filtrável por cor, com o que a outra pessoa grifou ao
lado do meu.

## Escopo enxuto

**Entra:** a tela de grifos do livro (lista + filtro por cor), o formulário de criar/editar com
o editor no comentário, arquivar o próprio grifo, a aba "Grifos" do `book.tsx` deixando de ser
desabilitada, o pino da paleta em `packages/ui`, e a **unificação do `Notice`/`Screen`**.

| Fora | Por quê |
| --- | --- |
| **Filtro por pessoa** | É a **Tarefa 27** (o componente compartilhado) e depende da **26a** (`GET /clubs/:clubId/members`), sem a qual um chip "de Alguém do clube" é enigma, não filtro — a lacuna está medida três vezes no MVP 1. A tela **mostra** autoria (você × outra pessoa), como a 19 faz. |
| **Anotações e grifos no mesmo lugar** | É a **Tarefa 28**, e ela precisa do filtro compartilhado da 27. Fazer agora dentro do `book.tsx` seria construir a 28 sem a peça que a 27 entrega. |
| Busca por texto | É a **Tarefa 29** (e o `HighlightFilter` ainda não tem `text`). |
| Filtro por página / por cor **no servidor** | A rota aceita os dois, mas uma requisição por toque de chip é pior que filtrar no cliente sobre o acervo já carregado — é a decisão medida da 19. Os filtros de servidor ficam para quem paginar. |
| Grifo offline | Offline nível 1 provou-se numa tela (a do dia). A fila se prova numa antes de ser fiada em todas — decisão registrada da 21. E `POST` não é idempotente. |
| Desarquivar | MVP 4. |
| `Notice`/`Screen` em `packages/ui` | Ver a decisão H: a unificação desta fatia é **dentro do `app`**. Mudar `packages/ui` mexe em tokens de tema e no bundle, e é fatia própria. |

## Decisões já tomadas (não reabrir)

- **Dentro do clube não existe conteúdo privado.** Todo grifo é visível para todo membro ativo.
  O filtro é **navegação, não permissão** — nunca rotular como privacidade, nunca cadeado.
  → ADR 0002. A varredura automática roda nas telas novas.
- **Ninguém edita nem arquiva o grifo de outra pessoa.** O grifo alheio aparece **sem nenhuma**
  affordance — foi assim na 18 e na 19, e continua.
- **A paleta é fixa, 5 cores, e mora em `@clube/shared`** (`HIGHLIGHT_COLORS`). A tela não
  inventa cor nem grafia: o valor gravado é o hex minúsculo, e o `=` do Postgres é byte-sensível.
- **`commentText` é derivado no backend** e nunca entra no input. → ADR 0001.
- **O editor entra por `React.lazy()`**, e o chunk de entrada continua **sem TipTap**. A tela de
  login não baixa o ProseMirror. → medido na 14, exigido desde a 18.
- **Nenhuma string da API na tela** — texto **e** atributos. `ApiError` → chave de catálogo →
  `t()`. Chave nova em **`pt` e `en`**.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | A coleção de grifos é **rota própria** (`/books/:bookId/highlights`), e a aba "Grifos" do `book.tsx` deixa de ser `disabled` e passa a **linkar** para ela | `book.tsx` já tem **426 linhas de código** (número corrigido depois da fatia: a spec dizia 491, e o contador canônico está no docblock de `highlights.tsx`) e é a 2ª maior tela. Somar uma segunda listagem + paleta + navegação é o oposto da lição nº 8 do MVP 1 ("divida **antes** de a tela crescer"). E o `BACKLOG` chama a fatia de "**tela** de grifos", enquanto a **28** é que junta os dois acervos num lugar. |
| B | Criar/editar é **outra** tela (`/books/:bookId/highlights/new` e `/highlights/:highlightId`) | Decisão B da Tarefa 19, pelo mesmo motivo medido: o editor precisa de altura e o teclado do celular come metade da tela. Sheet com editor dentro é o caminho curto para o teclado tapar o texto. |
| C | O filtro por cor é **no cliente**, sobre a lista já carregada | Uma requisição por toque de chip. Mesmo desenho da 19. |
| D | ⚠️ O `color` vai na query **pela opção `query` do cliente**, nunca por concatenação | Medido na 24: `?color=#facc15` **não funciona** — `#` é delimitador de fragmento e o valor tem de ir `%23facc15`. O `buildUrl` do `ApiClient` usa `URLSearchParams` e escapa sozinho; concatenar à mão é o único jeito de cair na armadilha. (Nesta fatia o filtro é no cliente, então a query nem leva cor — a regra existe para a 28/29 não reintroduzir o problema.) |
| E | `quote` é `<textarea>`, não `<input>` | É um trecho de livro copiado à mão: duas frases é o caso normal. E não tem teto de tamanho no domínio (decisão G da 22) — o teto é o `bodyLimit` da rota. |
| F | Arquivar pede **confirmação**, com o `Sheet` | Decisão D da 19: é destrutivo do ponto de vista de quem escreveu, mesmo sendo soft delete. |
| G | ⚠️ **O pino da paleta do editor em `packages/ui` é pago aqui** — é a dívida registrada na Tarefa 22 | Hoje o único guarda das 5 `rgba` do `RichEditor` vive em `packages/shared` (o teste de espelho). Quem rodar só `pnpm --filter @clube/ui test` depois de corrigir uma cor vê **verde**. O conserto é um teste **dentro de `ui`** pinando os 5 valores, com docblock apontando para o espelho — **não** fazer `ui` importar de `shared` (as duas paletas têm valores diferentes de propósito: o alpha do editor é decisão de renderização, e varia por cor). |
| H | ⚠️ **Esta fatia NÃO cria a 6ª cópia do `Notice` nem a 4ª do `Screen`.** Os dois viram um módulo só em `packages/app/src/pages/chrome.tsx`, e as cópias existentes migram | **Medido agora:** o `Notice` já tem **duas variantes divergentes** — três cópias byte-idênticas (`book-form`, `day-note`, `free-note`) e duas com `description` (`home`, `book`) —, e o `Screen` tem duas que diferem só em `max-w-4xl` × `max-w-2xl`. É a lição nº 3 já acontecendo, e é o momento exato em que a Tarefa 23 agiu (a 3ª cópia). Um `description?` opcional e uma prop de largura cobrem os cinco casos. **É a UNIDADE 1 da fatia**, entregue verde antes de qualquer tela nova — não um refactor de carona no fim. |
| I | A lista mostra **um trecho** do `quote` e a **cor** como amostra, não o comentário renderizado | Renderizar N documentos ProseMirror numa lista é caro e ilegível — decisão F da 19. O `commentText` derivado existe exatamente para prévia. |
| J | Sem paginação | O `take: 500` do repositório é válvula. Um clube de duas pessoas com ~5 grifos/dia leva anos para chegar perto (medido na 23: ~1,4 KiB por grifo). |

## Regras (o que os testes provam)

### Unidade 1 — o `chrome.tsx` (antes de tudo)

1. `Notice` e `Screen` existem em **um** módulo, e as cinco telas existentes o **importam** — nenhuma cópia local sobra. `Notice` aceita `description` opcional; `Screen` aceita a largura (as duas que existem hoje: `max-w-4xl` e `max-w-2xl`).
2. ⚠️ A unificação é **mensurável**: mudar a marcação do `Notice` compartilhado deixa vermelho em **mais de uma** suíte de tela. Se der acusador em uma só, as telas não estão usando o compartilhado — cole a contagem.
3. Nenhuma contagem de teste do `app` **cai** com a migração (424 é o piso).

### A tela de grifos (a lista)

4. Carrega `GET /clubs/:clubId/highlights?bookId=…` e mostra, por grifo: o **trecho**, a **cor** (amostra visível **e** nome acessível — cor não pode ser o único portador de informação), a **página** quando existe, e a **autoria** (você × outra pessoa).
5. O grifo **sem página** e o **sem comentário** têm estado próprio na linha — nada de "página null" nem de bloco de comentário vazio.
6. ⚠️ O **comentário** aparece como prévia do `commentText`; um grifo com `commentDoc: null` **não** renderiza área de comentário nenhuma.
7. Filtro por cor com `aria-pressed`, feito **no cliente**, e ele **muda a lista**. Há um estado "todas".
8. Acervo vazio → estado vazio **sem cobrança**; filtro sem resultado → estado próprio, diferente do vazio (é a lição da 19: os dois estados não são o mesmo).
9. Só **o meu** grifo tem as ações (editar, arquivar); o alheio **não tem affordance nenhuma**.
10. Arquivar pede confirmação; **cancelar não chama a API**; confirmar manda `DELETE /highlights/:id` e o grifo **sai da lista** e não volta ao recarregar.
11. A aba "Grifos" do `book.tsx` deixa de ser `disabled` e **navega** para a tela (pelo `renderLink`/`Link` do roteador — **nunca** âncora crua, que recarrega o PWA inteiro; é a lição medida da 16).

### O formulário (criar e editar)

12. `quote` é **obrigatório**: vazio marca o campo e **nada é enviado**.
13. A cor é **obrigatória** e vem da paleta de `@clube/shared` — os cinco chips, com estado ativo acessível (não só a cor).
14. `page` é opcional; quando preenchida tem de ser **inteiro ≥ 1** e a tela recusa `0`, negativo e fracionário **antes** de enviar. ⚠️ (Medido na 24: o Prisma **trunca** fração e a borda responde 400 — mas quem escreve não deve descobrir isso por um 400.)
15. `reference` é livre e opcional; vazio vira ausente no corpo.
16. ⚠️ O **comentário** distingue **"não há"** de **"vazio"**: abrir o formulário e não tocar no editor manda `POST` **sem `commentDoc`**; na edição, ausente **não mexe** e limpar manda `null` explícito (o que zera o `commentText` no servidor). → decisão C e regra 6 da Tarefa 22.
17. Criar manda `POST /books/:bookId/highlights` com **só** os campos preenchidos — nada de `commentText`, `userId`, `clubId`, `status` (o corpo é `.strict()`: qualquer um deles é **400**).
18. Editar manda `PATCH /highlights/:id` só com **o que mudou**, e **abrir a edição e não mudar nada não dispara `PATCH` nenhum**.
19. Criar é **explícito** (botão), não autosave — não se cria linha no banco por abrir uma tela (regra 16 da 19).
20. O editor é **lazy** e o chunk de entrada continua **sem TipTap** (cole o número antes e depois).

### Transversais

21. ⚠️ A varredura **anti-culpa** e a de **privacidade** (ADR 0002) rodam em **todos** os estados novos das duas telas — pelo helper único (`anti-guilt-dom.ts`), não por cópia. É a lição da 19/20: a terceira cópia da varredura foi o que a auditoria pegou.
22. Nenhuma string da API na tela — texto **e atributos** (`title`, `aria-label`, `placeholder`, `alt`, `value`), pelo `readableText()` do harness. Chaves novas em **`pt` e `en`**.
23. ⚠️ **O pino da paleta em `packages/ui`** (decisão G): mudar uma `rgba` do `RichEditor` deixa vermelho **dentro de `packages/ui`**, e não só em `shared`. Cole as duas contagens.

## Arquivos a tocar

```
packages/app/src/pages/chrome.tsx                    NOVO — Notice + Screen (unidade 1)
packages/app/src/pages/{home,book,book-form,day-note,free-note}.tsx   passam a importar
packages/app/src/pages/highlights.tsx                NOVA — a coleção + o filtro por cor
packages/app/src/pages/highlight-form.tsx            NOVA — criar e editar
packages/app/src/pages/paths.ts                      + os três endereços novos
packages/app/src/router.tsx                          + as três rotas
packages/app/src/pages/book.tsx                      a aba Grifos deixa de ser disabled
packages/shared/src/locales/{pt,en}.ts               as chaves
packages/ui/src/components/__tests__/                + o pino da paleta (decisão G)
+ os testes de tela novos e o crescimento dos existentes
```

**Não tocar:** `packages/backend/**` e `prisma/` (o backend do grifo está pronto — se esta
fatia precisar de rota nova, **pare e reporte**) · `packages/shared/src/{highlight,note,book,
club}.ts` e `client/**` · `packages/ui/src/components/RichEditor.tsx` e `editor.css` (o pino
da decisão G é um **teste**, não uma mudança no componente) · `app/src/{i18n,theme,env}.ts` ·
`auth/require-auth.tsx` · `club/active-club.tsx` · `offline/**`. Se precisar de **componente
novo** em `packages/ui`, **pare e reporte**.

## Definição de pronto

- [x] **Unidade 1 verde antes das telas:** `Notice`/`Screen` em um módulo, cinco telas
      migradas, e a unificação **medida** (mais de uma suíte acusa) (1, 2, 3).
- [x] A coleção mostra trecho, **cor com nome acessível**, página e autoria (4, 5).
- [x] Grifo sem comentário **não** renderiza área de comentário (6).
- [x] O filtro por cor **muda a lista**, no cliente, com `aria-pressed` (7).
- [x] Vazio ≠ filtrado-sem-resultado, e **nada cobra** (8, 21).
- [x] Grifo alheio **sem affordance**; arquivar com confirmação e cancelar **não** chama a API
      (9, 10).
- [x] A aba "Grifos" navega pelo `Link` do roteador, **não** por âncora crua (11).
- [x] `quote` obrigatório **sem enviar nada** quando vazio (12); `page` recusada na tela antes
      do 400 (14).
- [x] ⚠️ "Não há comentário" ≠ "comentário vazio", nos dois sentidos (16).
- [x] **Abrir a edição e não mudar não salva** (18); criar é explícito (19).
- [x] O chunk de entrada continua **sem TipTap** — cole o número (20).
- [x] Nenhuma string da API em texto **nem em atributo**; chaves em `pt` **e** `en` (22).
- [x] ⚠️ **O pino da paleta morde dentro de `packages/ui`** (23).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas (baseline: 391 · 175 · 1266 ·
      424).
- [x] `packages/backend` em **1266** — **intocado**, provado por `git status` e mtime. Os
      **359** de integração **não** foram rodados (escrevem no banco do dono) e não havia como
      mudar.
- [x] **Contagem de linhas de código colada** das duas telas novas e do `chrome.tsx`, e do
      `book.tsx` antes e depois.
- [x] Checklist marcada; a linha 25 do `BACKLOG.md` é do orquestrador.
