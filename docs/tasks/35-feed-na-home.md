# Tarefa 35 — O feed de atividade na home

> **A última fatia do Bloco H, e a mais perigosa do MVP inteiro para o §1 do plano.** Um feed
> é, por construção, uma superfície de **comparação**: quem fez mais aparece mais. Toda decisão
> aqui existe para entregar o incentivo sem entregar o placar.
>
> Leia antes: `docs/ACEITE-MVP.md` **MVP 3, pergunta 1** (a decisão do dono: presença, não
> placar) · `CLAUDE.md` · `docs/CONVENCOES-CODIGO.md` **§7.4** (⚠️ a forma de tela:
> `expect(getByRole(...)).toBeDefined()` **não asserta nada**), **§7.6.1** (`readableText()`
> varre texto **e** atributos; `document.body.textContent` cola nós irmãos **sem separador**),
> **§7.9** (⚠️ a partição catálogo × DOM, e *"guarda no lugar errado é pior que nenhuma"*),
> **§7.10** · ADR `0002`.
>
> **Os vizinhos:** `packages/app/src/pages/home.tsx` (**284** linhas — a tela que cresce) ·
> `pages/club-names.ts` (⚠️ **o dono único de `userId` → nome**, hoje usado pelo livro e pelo
> acervo; a home será o **terceiro** chamador) · `pages/reading-marks.tsx` (a fatia de tela
> mais recente, com a varredura de cor estendida) · `pages/__tests__/anti-guilt-dom.ts` (o
> `expectNoGuilt()`, que **já embute** a varredura de privacidade — não a chame duas vezes) ·
> `packages/shared/src/activity.ts` (o contrato).

## Objetivo

Abro o app e vejo que o clube está vivo — quem leu, quem escreveu, quem grifou — sem que isso
vire uma tabela de quem fez mais.

## ⚠️ O que eu medi antes de escrever esta spec, e que muda o escopo

1. **A home NÃO resolve nome de membro hoje.** O livro e o acervo resolvem, pelo
   `club-names.ts` + `GET /clubs/:clubId/members` (desde a 26a). A home nunca precisou. O feed
   precisa → a home vira o **terceiro** chamador do dono único.
2. ⚠️ **O evento NÃO carrega o tema do dia.** Ele tem `bookId` e `planItemId`, mas não o
   título. A home **tem** a lista de livros (então `bookId` → nome do livro é resolvível), e
   **não** tem o plano dos outros livros. Decisão E abaixo.
3. **A home já faz requisições em série** para achar o livro com o dia de hoje
   (`home.tsx:257`). O feed acrescenta **duas** (o feed e os membros). Decisão F.

## Escopo enxuto

**Entra:** o feed de atividade na home — quem, o quê, em que livro, quando — com link, e as
varreduras em todos os estados novos.

| Fora | Por quê |
| --- | --- |
| ⚠️ **Qualquer contagem, agrupamento por pessoa ou ranking** | É a decisão do dono (`ACEITE-MVP.md`, MVP 3, pergunta 1) e o §1 do plano. "3 atividades de Maria" é o placar que a `COUNTER_SHAPE` proíbe. |
| ⚠️ **"Carregar mais" / paginação** | O feed é "o que aconteceu recentemente". Um botão de carregar mais convida a rolar o histórico procurando quem fez mais — que é a comparação pela porta dos fundos. |
| Filtro por pessoa ou por tipo no feed | O acervo já filtra. Aqui a pergunta é "o clube está vivo?", não "o que a Maria fez". |
| Push | Tarefa 38. |
| O tema do dia na linha | Medição 2 — ver decisão E. **Registre como pergunta do dono**, não implemente. |
| Avatar/foto | Não existe upload; o `PersonAvatar` com inicial já é o padrão das outras telas. |

## Decisões já tomadas (não reabrir)

- **Progresso e atividade são presença, não placar.** → decisão do dono.
- **Dentro do clube nada é privado** (ADR 0002): o feed mostra o que todo membro ativo já podia
  ver. Ele **não** cria visibilidade nova.
- **Nenhum texto solto**: tudo via `t()`, chave nova em `pt` **e** `en`.
- **Teto do chunk: 450.000 B, não relaxado.** Hoje **418.565 B**, folga **31.435**.
- **O `nameOfWriter` do `club-names.ts` é o dono único** de `userId` → nome.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **A linha é uma FRASE, não uma tabela** — "Maria leu um dia de *O Senhor dos Anéis*", "Maria escreveu uma anotação em…", "Maria grifou em…" | Uma tabela com colunas (pessoa · tipo · quando) convida o olho a varrer a **coluna da pessoa** e contar. A frase obriga a ler uma coisa de cada vez. É o mesmo motivo pelo qual o plano usa avatar por dia e não uma contagem por pessoa. |
| B | ⚠️ **Ordem cronológica pura, sem agrupar por pessoa nem por dia** | Agrupar por pessoa **é** o placar. Agrupar por dia cria cabeçalhos que viram régua ("ontem: 4 · hoje: 0"). |
| C | **Tempo relativo ("há 2 horas"), com `Intl.RelativeTimeFormat`** | Data absoluta numa lista curta é ruído. ⚠️ E **não** pode virar cobrança: nada de "há 3 dias ninguém escreve". O tempo descreve **o que aconteceu**, nunca o que não aconteceu. |
| D | **A linha inteira é o link**, para o alvo do tipo (dia · avulsa · grifo) | É o padrão do acervo. E um alvo dentro de outro alvo em celular é toque errado garantido (a mesma razão da decisão I da 32b). |
| E | ⚠️ **A linha diz o LIVRO, não o tema do dia** | Medição 2: o evento não carrega o título do dia, e a home só tem o plano de **um** livro. Buscar o plano de cada livro do feed seriam N requisições para enfeitar uma frase. O livro **é** resolvível (a home já lista) e responde "onde". **Registre como pergunta do dono**: vale uma requisição a mais para dizer "sobre o Cap. 3"? |
| F | ⚠️ **As duas requisições novas (feed + membros) são PARALELAS entre si e não bloqueiam a estante** | A estante e o atalho de hoje são o produto da home; o feed é o acessório. Se o feed falhar, **a home continua inteira** — o mesmo desenho que o `home.tsx:257` já usa para o plano (silêncio de propósito). ⚠️ Provado por contagem, não por ausência de erro. |
| G | ⚠️ **Feed vazio tem frase própria, e ela NÃO cobra** | "Ainda não há atividade por aqui" é constatação; "ninguém leu ainda" é cobrança. E ela é **diferente** da de erro — a lição das Tarefas 19/25/28: os dois estados nunca são o mesmo. |
| H | **Quem sou eu aparece como "Você"**, pelo mesmo `nameOfWriter` | Já é o comportamento do acervo e do plano. Uma frase dizendo o próprio nome na terceira pessoa é estranha e, num feed, soa a registro de ponto. |
| I | ⚠️ **O limite pedido é explícito na query** (`?limit=`), e pequeno | O contrato da 34 tem `limit` com padrão 50. A home não precisa de 50 linhas; peça o que a tela mostra. ⚠️ **E não mostre "e mais N"** — é contador. |

## Regras (o que os testes provam)

### O feed

1. O feed mostra as atividades do clube ativo, **em ordem cronológica inversa**, sem agrupar.
2. Cada linha diz **quem** (pelo `nameOfWriter`, com "Você" para o ator), **o quê** (frase por
   tipo), **em que livro**, e **quando** (relativo).
3. ⚠️ Os **quatro** tipos têm frase própria e **distinguível** — `PLAN_NOTE`, `FREE_NOTE`,
   `HIGHLIGHT`, `READ`. O teste prova que as quatro frases **não são iguais** (a lição nº 16 do
   MVP 2: duas coisas que falam a mesma frase são indistinguíveis pela varredura).
4. Tocar numa linha abre o alvo certo (dia · avulsa · grifo); o `READ` leva ao dia.
5. ⚠️ **Nenhum número em lugar nenhum** — nem contagem, nem "+N", nem "3 atividades".
6. Livro que a home não conhece (fora da estante carregada) **não quebra a linha** — ela cai
   numa frase neutra, sem "livro desconhecido" nem tom de erro.

### O que o feed NÃO pode quebrar

7. ⚠️ **Feed que falha NÃO derruba a home**: a estante e o atalho continuam. Provado por
   **contagem** de requisições e pelo estado renderizado, não por ausência de erro (§7.4).
8. ⚠️ Membros que falham **não** derrubam o feed: as linhas aparecem com a frase neutra de
   nome. Também por contagem.
9. As duas requisições novas são feitas **uma vez cada** por carga — provado por contagem
   (§7.3), com o lado positivo junto do `toBe(0)`.

### As guardas

10. ⚠️ **As varreduras rodam em TODOS os estados novos** — carregando, com feed, feed vazio,
    feed com erro, membros com erro, livro desconhecido. Pelo helper único: o `expectNoGuilt()`
    **já embute** a de privacidade; **não a chame duas vezes**.
11. ⚠️ **A varredura de cor de fonte alcança o arquivo novo**, se você criar um (a 32b mediu
    que ela é **por nome de arquivo** e precisou ser estendida; as de desenho e de ícone são
    recursivas e pegam de graça).
12. ⚠️ Chave nova em `pt` **e** `en`, e a varredura de catálogo cobre os dois (§7.9). ⚠️ Plante
    um termo de `GUILT_TERMS` numa chave nova do **`en`** e cole a contagem.
13. ⚠️ **O tempo relativo não pode produzir vocabulário de cobrança em nenhum idioma.** Meça:
    o `Intl.RelativeTimeFormat` em `pt` e em `en`, nas faixas que a tela usa, não emite nada
    que a `GUILT_TERMS` pegue. Se emitir, **pare e reporte** — é o teste mandando no produto e
    a saída é escolher outra faixa, não afrouxar a lista.

### Transversais

14. ⚠️ **Chunk de entrada em BYTES, colado, abaixo de 450.000.** Antes **418.565 B**, folga
    **31.435**. Densidade: ~13 B/linha de tela e **~43 B por chave** (só o lado `pt` — a 29a
    tirou o `en` do chunk).
15. ⚠️ **`packages/backend` e `packages/ui` INTOCADOS** — `git status` vazio. A varredura de
    strings cravadas em `ui` continua em **33**.
16. ⚠️ **`home.tsx` tem 284 linhas** pelo contador canônico. Lição nº 8: **divida antes de
    crescer**. Se passar de ~380, corte — e diga por medição o que saiu e para onde.
17. ⚠️ **A integração NÃO roda** (a fatia não toca backend). Diga isso em vez de repetir o
    número de outro.

## Arquivos a tocar

```
packages/app/src/pages/home.tsx                    o feed
packages/app/src/pages/activity-feed.tsx           NOVO, se a decisão 16 mandar cortar
packages/app/src/pages/__tests__/home.test.tsx     crescer
packages/app/src/pages/__tests__/ (a varredura de cor, se nascer arquivo novo)
packages/shared/src/locales/{pt,en}.ts             as chaves
```

**Não tocar:** `packages/backend/**` · `packages/ui/**` · `prisma/**` · `pages/club-names.ts`
(⚠️ a home **importa** dele; não o reescreva) · `pages/{book,acervo,busca,reading-marks}.tsx` ·
`app/src/{i18n,theme,env}.ts` · `docs/**`.

## A pergunta do dono (registre, não decida)

**O feed deve dizer o TEMA do dia?** Hoje ele diz o livro ("Maria leu um dia de *O Senhor dos
Anéis*") e não o capítulo ("…sobre o Cap. 3"). Medido: o evento não carrega o título, e a home
só tem o plano de um livro — dizer o tema exigiria uma requisição por livro do feed, ou
denormalizar o título dentro do evento (que envelhece quando o admin corrige o plano).
**Recomendação:** deixar como está e ver se incomoda. Se incomodar, a saída barata é a rota do
feed devolver o título junto — uma mudança de contrato, não N requisições.

## Definição de pronto

- [x] Ordem cronológica sem agrupar (1, B); quatro frases **distinguíveis** (3).
- [x] Quem · o quê · livro · quando, com "Você" para o ator (2, H).
- [x] Toque abre o alvo certo (4); livro desconhecido não quebra (6).
- [x] ⚠️ **Nenhum número** (5).
- [x] ⚠️ **Feed que falha não derruba a home**, por contagem e estado (7); membros que falham
      não derrubam o feed (8); uma requisição de cada por carga (9).
- [x] ⚠️ Varreduras em **todos** os estados novos, sem chamada dupla (10); a de cor alcança
      arquivo novo (11); catálogo nos **dois** locales, com a contagem colada (12).
- [x] ⚠️ **O tempo relativo medido nos dois idiomas** contra a `GUILT_TERMS` (13).
- [x] ⚠️ **Chunk em bytes colado**, abaixo de 450.000 (14).
- [x] `pnpm -r test`, `typecheck`, `lint` (⚠️ **`pnpm lint` na raiz**), `prettier --check .`,
      `build` limpos.
- [x] ⚠️ `git status -- packages/backend packages/ui` **vazio** (15); `home.tsx` em linhas,
      antes e depois (16).
- [x] ⚠️ O **vermelho colado** das regras 3, 5, 7 e 13.
