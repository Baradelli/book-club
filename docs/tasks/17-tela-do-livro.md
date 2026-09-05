# Tarefa 17 — Tela do livro: o plano, hoje destacado, quem escreveu

> A tela que mostra o mês inteiro. Ela é **panorama e navegação**: quem quer escrever chega
> pelo atalho da home ou clicando num dia daqui.
>
> Leia antes: `CLAUDE.md`, **`docs/plano-clube-do-livro.md` §1**,
> `docs/adr/0002-visibilidade-total-no-clube.md`, `docs/CONVENCOES-CODIGO.md` (§7),
> `docs/tasks/16-home-seletor-livros.md`.

## Objetivo

Abro o livro do mês e vejo o plano dia por dia, com hoje destacado e a indicação de quem já
escreveu em cada dia. Toco num dia e vou escrever.

## Escopo enxuto — o dono pediu para cuidar da complexidade

Esta fatia é **uma requisição e uma lista**. O `GET /books/:bookId` já devolve
`{ book, planItems, writers }` — tudo o que a tela precisa, de uma vez. Não há UseCase novo,
não há schema novo, não há componente novo em `ui/`.

**Fora, e de propósito:** aba de grifos funcional (MVP 2 — a aba aparece **desabilitada**,
porque o `BACKLOG` a pede assim), filtro por pessoa (Tarefa 19), progresso/contagem (MVP 3),
editar o plano (Tarefa 20), e qualquer coisa de offline (Tarefa 21).

## Decisões já tomadas (não reabrir)

- **Tudo compartilhado dentro do clube.** A sobreposição de autoria diz **quem** escreveu, e
  **nunca** quantas notas cada um tem — isso seria placar, proibido pelo §1 ("incentivo por
  presença, não por comparação"). → ADR 0002.
- **Princípio anti-culpa.** Dia passado sem anotação é **um dia sem anotação**, não uma dívida:
  sem vermelho, sem "faltou", sem contador. A guarda do catálogo (Tarefa 16) já cobre o
  vocabulário; aqui a varredura de DOM tem de cobrir **esta** tela.
- **`CalendarDay` é string `"YYYY-MM-DD"`**, comparada como string. Nunca `new Date()` para
  decidir que dia é hoje — é o `localDay` da Tarefa 16.
- Ninguém edita conteúdo de outra pessoa. Aqui isso é só leitura, mas o **link** para escrever
  aponta para a **minha** anotação daquele dia.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **A estante da home passa a linkar para cá**, com o `renderLink` do `ListItem` | Ele nasceu na Tarefa 16 justamente para isso e **não tem chamador**. Sem o link, a única porta para esta tela seria digitar a URL. |
| B | O plano mostra **todos** os dias, sem paginar nem colapsar o passado | São ~30 itens. Colapsar o passado esconderia justamente o que se quer reler, e "mostrar só daqui para frente" é a leitura de culpa que o §1 proíbe. |
| C | **Hoje é destacado; nada mais é.** | Destacar "atrasados" seria cobrança. Destacar o futuro não serve para nada. |
| D | Avatares dos autores por dia, sem número | `PersonAvatar` da Tarefa 13, com o nome no `aria-label`. **Sem** "+2" nem contagem. |
| E | O nome de quem escreveu vem do `/me` do contexto de clube | O `writers` devolve `userId`; o nome de quem **não** é você não está em nenhuma resposta hoje. Para um clube de duas pessoas, "você" e "ela" resolvem — e o resto cai para as iniciais do id. **Registrado como lacuna**: o `/me` não lista membros do clube. |
| F | A aba de grifos existe, **desabilitada**, com o motivo visível | O `BACKLOG` pede exatamente isso. Uma aba que não existe esconde o plano do produto; uma que existe e não faz nada frustra. Desabilitada com "chega no MVP 2" é honesto. |

## Regras (o que os testes provam)

1. Carrega `GET /books/:bookId` **uma vez** e desenha livro + plano.
2. O plano aparece **na ordem do `order`** (a API já ordena; a tela **não** reordena).
3. **Hoje é destacado**, e o dia de hoje é o do `localDay` no fuso do navegador — não `new
   Date()` local.
4. **Nenhum outro dia é destacado**, e nenhum dia passado ganha marca de cobrança.
5. **A varredura anti-culpa passa nesta tela**, em todos os estados (com plano, sem plano,
   carregando, erro) — texto **e** atributos **e** cor (o regex de vermelho da Tarefa 16).
6. Cada dia com autoria mostra **um avatar por pessoa**, sem número em lugar nenhum.
7. Dia **sem** autoria não mostra nada no lugar — nem "ninguém escreveu".
8. Tocar num dia vai para `/books/:bookId/days/:planItemId`, com os ids **na ordem certa**
   (o placeholder da Tarefa 16 já lê os dois params e prova isso).
9. **404** (livro de outro clube, arquivado, ou id inexistente) → estado tratado com frase
   própria, **não** tela branca e **não** a frase genérica de "não encontrado".
10. Falha de rede → mensagem de rede **com repetir**, e o repetir refaz a requisição.
11. Plano **vazio** (livro sem plano cadastrado) → estado vazio próprio, e **sem cobrança**.
12. A aba **Anotações** está ativa; a de **Grifos** está `disabled` com `aria-disabled` e o
    motivo legível.
13. **A estante da home linka para cá** (decisão A), pelo `renderLink` — e o clique **não
    recarrega o PWA** (é `<Link>`, não `<a>` cru).
14. Nenhuma string da API na tela — texto e atributos.
15. Chaves novas em **`pt` e `en`**.
16. O bundle continua **sem TipTap** (esta tela não usa editor).

## Arquivos a tocar

```
packages/app/src/pages/book.tsx                   NOVA
packages/app/src/pages/__tests__/book.test.tsx    NOVO
packages/app/src/pages/home.tsx                   a estante linka (decisão A)
packages/app/src/router.tsx                       a rota /books/:bookId
packages/app/src/pages/day-note.tsx               só o `bookPath()`, se precisar
packages/shared/src/locales/{pt,en}.ts            as chaves da tela
```

**Não tocar:** `packages/backend/**`, `prisma/`, `packages/ui/**`,
`packages/shared/src/client/**`, `packages/app/src/{i18n,theme,env}.ts`,
`auth/require-auth.tsx`, `club/active-club.tsx`. Se faltar algo em `ui/`, **pare e reporte**.

## Definição de pronto

- [x] Regras 1–16, com destaque para **a varredura anti-culpa nesta tela** (5) e **o 404 com
      frase própria** (9). O mapa regra→teste está no relatório da execução; a varredura roda
      em **todos** os 7 estados renderizados pela suíte (plano, plano sem hoje, plano vazio,
      carregando, 404, rede, 400) e cobre **cor** (regex), **número** (regex de placar) e
      **palavra** (radicais, sobre `readableText()`). Mutantes plantados e acusados: destacar
      o primeiro item (3 falhas), ordenar por título (1), `writers` por índice (2), 404 sem
      frase própria (1), repetir sem refazer (1), `+N` ao lado do avatar (8), aba sem
      `disabled` (1), cobrança em `title` (14), `text-[#b3261e]` no dia passado (15), ids do
      link trocados (2).
- [x] A estante da home linka e **não recarrega** o PWA (13). Provado por construção: em jsdom
      uma âncora crua **não navega**, então o `LocationProbe` mudar depois do clique é a prova
      de que o `Link` interceptou. Mutante (remover o `renderLink`) → acusa.
- [x] Nenhum número ao lado de avatar (6) — asserção por avatar (`textContent` sem dígito) mais
      a varredura de placar na tela inteira.
- [x] `pnpm -r test` (shared 277/12 · ui 175/20 · backend 949/41 · app **221/17**),
      `pnpm --filter @clube/backend test:integration` (262/14), `pnpm -r typecheck`,
      `pnpm lint`, `pnpm prettier --check .` e `pnpm --filter @clube/app build` limpos.
      Bundle: **357.589 B** (gzip 111,61 kB) · **0** marcas de `tiptap`/`prosemirror` nos
      assets.
- [x] Backend em **949 / 262** — verificado, e `packages/backend/**` não foi tocado.
- [x] Checklist marcada; a linha 17 do `BACKLOG.md` é do orquestrador (não marcada aqui).
