# Tarefa 19 — Anotação avulsa e o filtro do acervo

> Fecha a escrita: além da anotação **do dia** (Tarefa 18), a pessoa registra a ideia que veio
> da página 112 — com título e referência próprios. E a aba **Anotações** da tela do livro
> deixa de ser um rótulo e passa a mostrar o acervo, filtrável.
>
> Leia antes: `docs/adr/0002-visibilidade-total-no-clube.md` (o filtro é **navegação, não
> permissão**), `docs/tasks/{17-tela-do-livro,18-tela-anotacao-do-dia}.md`, `CLAUDE.md`,
> `docs/CONVENCOES-CODIGO.md` §7.

## Objetivo

Anoto uma ideia que não é de nenhum dia do plano, com o título que eu quiser. E, na tela do
livro, vejo o acervo do clube — tudo, só o meu, ou só o das outras pessoas.

## ⚠️ O filtro é `Tudo · Minhas · De outras pessoas`, e NÃO `de <pessoa>`

O `BACKLOG` pede `Tudo · Minhas · de <pessoa>`. **Não é implementável hoje, e a lacuna é de
backend:** medido nas Tarefas 17 e 18 — o `listNotes` devolve `userId`, o `writers` devolve
`userId`, o `/me` traz só os **meus clubes**, e **não existe rota que liste os membros de um
clube com nome**. Um chip escrito "de Alguém do clube" não é um filtro, é um enigma.

**Decisão: três chips — `Tudo · Minhas · De outras pessoas`.** Num clube de **duas** pessoas
isso é **informação completa** (o complemento de "minhas" é exatamente "dela"), custa zero
backend, e é o caso real do dono hoje.

**Registrado:** com três ou mais pessoas, "de outras pessoas" deixa de discriminar, e aí o chip
por pessoa exige `GET /clubs/:clubId/members` (ou `name` junto do `userId` nas respostas de
nota). É uma fatia curta de backend, e é a mesma lacuna que impede o avatar de dizer o nome de
quem escreveu.

## Escopo enxuto

**Entra:** criar/editar anotação avulsa, arquivar a **própria** nota, e a listagem filtrável na
aba **Anotações** da tela do livro.

**Não entra:** busca por texto (o `text` do `listNotes` existe, mas um campo de busca sem tela
de resultados próprios é a Tarefa 29 do MVP 2) · filtro por `kind` na interface (a listagem
mostra os dois tipos, identificados) · grifos (MVP 2) · offline (Tarefa 21).

## Decisões já tomadas (não reabrir)

- **Anotação avulsa é ilimitada e exige `title`**; a do dia é uma por pessoa e o título vem do
  tema. → decisões fechadas do MVP 1.
- **O filtro é navegação, não permissão.** Nunca rotular como privacidade, nunca cadeado, nunca
  "só você vê". A guarda automática do ADR 0002 já varre `ui/`; aqui vale para as telas.
- **Ninguém edita nem arquiva conteúdo de outra pessoa.** A nota alheia aparece **sem nenhuma**
  affordance — foi assim na Tarefa 18 e continua.
- **`editNote` recusa nota do dia** (Tarefa 09): a tela de edição avulsa só serve `FREE`. A do
  dia se edita pelo `upsertPlanNote`, que é a tela da Tarefa 18.
- `plainText` é derivado no backend e **nunca** entra no input.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | A listagem mora na **aba Anotações da tela do livro**, que a Tarefa 17 deixou pronta e vazia | Uma tela nova de acervo duplicaria navegação. A aba já existe, já está ativa, e o acervo é **do livro**. |
| B | Criar/editar avulsa é uma **tela própria** (`/books/:bookId/notes/new` e `/notes/:noteId`), não um sheet | O editor precisa de altura e o teclado do celular come metade da tela. Sheet com editor dentro é o caminho curto para o teclado tapar o texto. |
| C | A listagem mostra **os dois tipos** (do dia e avulsa), com o tipo identificado | O acervo do livro é o que o clube escreveu; separar por tipo seria um segundo filtro sem pedido. |
| D | Arquivar pede **confirmação**, e usa o `Sheet` da Tarefa 13 | É destrutivo do ponto de vista de quem escreveu, mesmo sendo soft delete. Primeiro uso real do `Sheet`. |
| E | Sem paginação | O `listNotes` tem teto de 500 no repositório (válvula, não paginação). Um clube de duas pessoas com um livro por mês não chega perto. |
| F | O item da listagem mostra **um trecho** do `plainText`, não o `doc` renderizado | Renderizar 30 documentos ProseMirror numa lista é caro e ilegível. O `plainText` existe no backend exatamente para prévia. |

## Regras (o que os testes provam)

### A listagem (aba Anotações da tela do livro)

1. Lista as notas **do livro** — `GET /clubs/:clubId/notes?bookId=…` —, mais recentes primeiro.
2. Cada item mostra título, autoria (**você** × outra pessoa) e um **trecho do `plainText`**.
3. O tipo é identificável: anotação **do dia** × **avulsa**.
4. **`Tudo · Minhas · De outras pessoas`**, com `aria-pressed`, e o filtro **muda a lista**.
5. **O filtro é feito no cliente**, sobre a lista já carregada — não refaz requisição. (São
   dezenas de itens; e "Minhas" não é um pedido novo ao servidor, é um recorte do mesmo
   acervo.)
6. **Nenhum chip sugere privacidade** — a varredura do ADR 0002 vale para esta tela.
7. Acervo vazio → estado vazio **sem cobrança** (a varredura anti-culpa roda aqui também).
8. Tocar num item da **minha** nota avulsa abre a edição; na **do dia**, abre a tela do dia; na
   de **outra pessoa**, abre em leitura.

### Criar e editar a avulsa

9. `title` é **obrigatório**: vazio marca o campo, e **nada é enviado**.
10. `reference` é livre e opcional; vazio vira ausente no corpo.
11. Criar manda `POST /books/:bookId/notes` com `{ title, reference?, doc }` — **e nada mais**.
12. Editar manda `PATCH /notes/:noteId` só com **o que mudou**.
13. **Abrir a edição e não mudar nada não dispara `PATCH` nenhum** (a mesma regra da Tarefa 18,
    pelo mesmo motivo).
14. O editor é **lazy** e o chunk de entrada continua **sem TipTap**.
15. O autosave da edição segue o mesmo desenho da Tarefa 18 (1500 ms, debounce, status).
16. Criar é **explícito** (botão), não autosave — não se cria linha no banco por abrir uma tela.

### Arquivar

17. Só a **minha** nota tem a ação; a de outra pessoa **não** tem affordance nenhuma.
18. Pede confirmação; cancelar **não** chama a API.
19. Confirmar manda `DELETE /notes/:noteId` e a nota **some da lista**.
20. A nota arquivada **não reaparece** ao recarregar (o backend a esconde).

### Transversais

21. Nenhuma string da API na tela — texto **e** atributos.
22. Chaves novas em **`pt` e `en`**.
23. A varredura anti-culpa (o helper único da Tarefa 18) roda em **todos** os estados novos.

## Arquivos a tocar

```
packages/app/src/pages/book.tsx                    a aba Anotações passa a listar
packages/app/src/pages/free-note.tsx               NOVA (criar e editar)
packages/app/src/pages/__tests__/free-note.test.tsx        NOVO
packages/app/src/pages/__tests__/book.test.tsx     crescer (a listagem e o filtro)
packages/app/src/router.tsx                        as duas rotas novas
packages/shared/src/locales/{pt,en}.ts             as chaves
```

**Não tocar:** `packages/backend/**`, `prisma/`, `packages/ui/**`,
`packages/shared/src/client/**`, `app/src/{i18n,theme,env}.ts`, `auth/require-auth.tsx`,
`club/active-club.tsx`, `pages/day-note.tsx`. Se precisar de componente novo em `ui/`, **pare e
reporte**.

## Definição de pronto

- [x] O filtro **muda a lista** e é feito no cliente (4, 5).
- [x] **Nada sugere privacidade** (6) e **nada cobra** (7, 23).
- [x] `title` obrigatório **sem enviar nada** quando vazio (9).
- [x] **Abrir a edição e não mudar não salva** (13).
- [x] Arquivar só a minha, com confirmação, e cancelar **não** chama a API (17, 18).
- [x] O chunk de entrada continua **sem TipTap** (14) — 380.411 B e **0 marcas**.
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [x] Backend em **949 / 262** — verificado.
- [x] **Contagem de linhas de produção colada.**
- [x] Checklist marcada; a linha 19 do `BACKLOG.md` é do orquestrador.
