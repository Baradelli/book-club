# Tarefa 20 — Cadastrar o livro do mês e o plano, pela tela

> **É a fatia que aposenta o Swagger.** Hoje, para começar um mês, o dono abre o `/docs`, monta
> um JSON com 30 objetos e cola. Depois desta tarefa ele cadastra o livro e o plano no celular,
> como qualquer outra coisa do app.
>
> Leia antes: `docs/CONVENCOES-CODIGO.md` §6 (o padrão de rota e o erro da API na tela) e §7,
> `docs/tasks/{17-tela-do-livro,19-anotacao-avulsa-e-filtro}.md`, `CLAUDE.md`.

## Objetivo

Sou admin do clube. Cadastro o livro do mês, gero os dias do plano de uma vez, escrevo o tema de
cada dia, e salvo. Depois consigo corrigir o que digitei errado.

## O backend está pronto — esta fatia é SÓ tela

Medido: `POST /clubs/:clubId/books` aceita o livro **com** `planItems` no mesmo corpo;
`PATCH /books/:bookId` edita os campos do livro; `PUT /books/:bookId/plan` substitui o plano
inteiro (por dentro é um diff pela `date`, então **o `id` do dia sobrevive** e a anotação de
quem já escreveu continua apontando para ele).

E o caminho do erro também está pronto desde a Tarefa 15: `apiErrorKey` já normaliza
`planItems.7.date` → `planItems.*.date` → `errors.fields.planItem.date`. **Nada de backend.**

## Escopo enxuto

**Entra:** criar o livro (com plano), editar o livro, substituir o plano, e o gerador de dias.

**Não entra:** arquivar livro (o `DELETE /books/:bookId` existe; a tela dele é uma fatia
própria, e um livro cadastrado errado se **corrige**, não se apaga) · gerenciar membros ·
convidar (Tarefa 22) · capa por upload (não existe endpoint; o campo é URL, como no backend).

## Decisões já tomadas (não reabrir)

- **Só `OWNER`/`ADMIN`.** O `role` vem do `/me`, por clube — o contexto de clube já o carrega.
- **`order` não é campo.** O domínio o deriva da posição no array. Nunca mande `order`.
- **As datas do plano são estritamente crescentes e sem repetição** (`findPlanDateProblem`), e
  quem reprova é o Zod da borda, com `details[].path` apontando a linha.
- **`plainText`, `userId`, `clubId` nunca entram em corpo nenhum.**
- Nada de string da API na tela — texto **e** atributos (§6.2).

## Decisões que assumi (revisar antes de executar)

| #   | Decisão                                                                                                                          | Alternativa e por que não                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Uma tela, dois modos**: `/clubs/:clubId/books/new` e `/books/:bookId/edit`                                                      | São o mesmo formulário. Duas telas dobrariam a validação do plano, que é a parte difícil.                                                                                                                       |
| B   | **O editor de plano é arquivo próprio** (`pages/plan-editor.tsx`), não um trecho da tela                                          | O `free-note.tsx` chegou a **580 linhas de código** acumulando modos, e a Tarefa 19 registrou isso como o próximo lugar onde a complexidade morde. Aqui a divisão é feita **antes**.                             |
| C   | **Gerador de dias: data inicial + quantidade → N linhas com as datas já preenchidas**                                             | Sem ele, cadastrar um mês é digitar 30 datas à mão no celular. É a diferença entre a tela ser usada e o dono voltar para o Swagger. Os **temas** continuam sendo digitados um a um — eles são o conteúdo.        |
| D   | No modo criar, o `POST` manda **livro + plano juntos**; no modo editar são **duas** chamadas (`PATCH` do livro, `PUT` do plano), e **só as que mudaram** | Criar em duas etapas deixaria um livro sem plano se a segunda falhasse. Editar em duas é o que a API oferece — e mandar o plano inteiro sem mudança nenhuma faria um diff inútil.                                |
| E   | **Salvar é explícito.** Sem autosave                                                                                             | Autosave num formulário de 30 linhas grava plano inválido pela metade, e o `PUT` **substitui** o plano — o custo de um salvamento errado aqui é o plano do mês.                                                 |
| F   | **Layout largo no desktop**: a linha do plano vira `data · tema · referência` numa só; no celular ela empilha                     | É o pedido do `BACKLOG`, e é a única tela de administração do MVP 1.                                                                                                                                            |
| G   | Sem confirmação ao sair com mudança pendente                                                                                     | Não existe `beforeunload` no projeto, e um diálogo trava a sessão de teste. Registrado como lacuna.                                                                                                             |

## Regras (o que os testes provam)

### Quem entra

1. Sem `OWNER`/`ADMIN` no clube ativo, **a entrada não aparece** na home nem na tela do livro.
2. E a **rota** também recusa: abrir a URL na mão dá frase própria, não formulário.

### O livro

3. `title` e `month` são obrigatórios; vazio marca o campo e **nada é enviado**.
4. `month` é `AAAA-MM`; um mês malformado é reprovado **na tela**, antes do envio.
5. `author`, `coverUrl` e `totalPages` são opcionais; vazio **não vai no corpo** (nem como
   string vazia).
6. Criar manda `POST /clubs/:clubId/books` e nada além do que o schema declara — sem `order`,
   sem `clubId` no corpo, sem `id`.

### O plano

7. O gerador cria **N linhas com datas consecutivas** a partir da data escolhida, com tema
   vazio.
8. Dá para **acrescentar** e **remover** uma linha à mão.
9. Linha com **tema vazio** reprova, é **marcada**, e **nada é enviado** (o backend exige
   `title`; deixar a tela mandar seria trocar uma marca no campo por um 400 sem lugar).
10. Data repetida ou fora de ordem reprova **na tela**, marcando **a linha certa** — é a mesma
    regra do `findPlanDateProblem`, e ela é do `shared`: **não reescreva a comparação aqui**.
11. Se mesmo assim vier um **400 do servidor** com `details[0].path = planItems.7.date`, a tela
    marca **a linha 7**. O índice vem do `path` (é número, não texto da API); a **frase** vem do
    catálogo, via `apiErrorKey`.
12. **Remover um dia que já tem anotação** volta 400 do domínio → frase própria do catálogo, o
    formulário **não perde o que foi digitado**, e a linha volta.
13. Plano vazio é válido: livro sem plano cadastra.

### Editar

14. A tela abre **preenchida** com o livro e o plano de `GET /books/:bookId`.
15. **Abrir e salvar sem mudar nada não dispara `PATCH` nem `PUT`** (a mesma regra das Tarefas
    18 e 19, pelo mesmo motivo).
16. Salvar com sucesso leva para a tela do livro.

### Transversais

17. Nenhuma string da API na tela — texto **e** atributos; chaves novas em **`pt` e `en`**.
18. A varredura **anti-culpa** e a do **ADR 0002** rodam em todos os estados novos.
19. O chunk de entrada continua **sem TipTap** (esta tela não usa editor).

## Arquivos a tocar

```
packages/app/src/pages/book-form.tsx               NOVA (criar e editar o livro)
packages/app/src/pages/plan-editor.tsx             NOVA (as linhas do plano — decisão B)
packages/app/src/pages/__tests__/book-form.test.tsx    NOVO
packages/app/src/pages/{home,book}.tsx             a entrada, só para admin
packages/app/src/router.tsx                        as duas rotas
packages/shared/src/locales/{pt,en}.ts             as chaves
```

**Não tocar:** `packages/backend/**`, `prisma/`, `packages/ui/**`,
`packages/shared/src/client/**`, `shared/src/reading-plan-dates.ts` (a regra de sequência já
está lá — **use-a**), `app/src/{i18n,theme,env}.ts`, `auth/require-auth.tsx`,
`pages/{day-note,free-note}.tsx`. Se precisar de componente novo em `ui/`, **pare e reporte**.

## Definição de pronto

- [x] A entrada e a rota são **só de admin** (1, 2).
- [x] O gerador de dias funciona (7) — é o que faz a tela substituir o Swagger.
- [x] Data repetida/fora de ordem marca **a linha certa** (10), reusando o `shared` (não
      reescrever a regra).
- [x] O 400 do servidor marca a **linha** pelo `path` e a frase vem do **catálogo** (11).
- [x] Remover dia com anotação **não perde o formulário** (12).
- [x] **Abrir e salvar sem mudar não dispara nada** (15).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
      → shared 277 · ui 175 · backend 949 · app **345** (298 + 47 desta fatia,
      já com os 13 acusadores que a auditoria pediu).
- [x] Backend em **949** — verificado, e `packages/backend` **intocado** (md5 dos 147
      arquivos idêntico ao do início da fatia).
- [x] **Contagem de linhas de código (sem comentário) das duas telas novas colada**:
      `book-form.tsx` **347** e `plan-editor.tsx` **238**, mais o `paths.ts` (**21**) que a
      auditoria pediu para matar o ciclo de import. O `free-note.tsx` da Tarefa 19, medido
      com o mesmo contador, tem **576**.
- [x] Checklist marcada; a linha 20 do `BACKLOG.md` é do orquestrador.
