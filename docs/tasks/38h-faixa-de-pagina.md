# Tarefa 38h — A faixa de página no acervo

> **Fatia gerada pela resposta do dono à pergunta 4 do MVP 2, opção (c)** (2026-09-18):
> *"os grifos do capítulo 3"* passa a ser pedível — pelo eixo que é do grifo, a **página**.
> → `docs/ACEITE-MVP.md`, MVP 2, pergunta 4.
>
> Leia antes: `CLAUDE.md` · `docs/CONVENCOES-CODIGO.md` **§7.4**, **§7.9**, **§7.10** ·
> `docs/tasks/38g-texto-no-acervo.md` — **a irmã imediata desta fatia, e o mapa do que pode dar
> errado aqui** · `docs/adr/0004-grifo-entidade-propria.md`.

---

## ⚠️⚠️ CORREÇÃO AO PLANO QUE GEROU ESTA FATIA — ela ENCOLHE a fatia

O plano aprovado dizia: *"Port cresce + impl Prisma na MESMA unidade (§6.9), fake acompanhando
nos dois sentidos"*. **Medido, e está errado.**

O `HighlightRepository` de fato diz por escrito *"sem faixa de página (`pageFrom`/`pageTo`): é
aditiva e **ninguém pediu**"* — e eu li isso como convite. Mas o filtro `page` que já existe lá
**não tem UM consumidor no app**: `grep` por `?page=` em `packages/app/src` e
`packages/shared/src/client` devolve **nada**. Ele existe ponta a ponta no backend, com teste
de contrato e de rota, e **nenhuma tela o usa**.

⚠️ **E o acervo — a tela desta fatia — filtra no CLIENTE.** Ele pede `/notes` e `/highlights`
uma vez cada e recorta o que já está na memória (`filterEntries`), que é o que faz tocar num
chip custar zero requisição. Foi exatamente a correção que a 38g já pagou.

✅ **Logo: esta fatia NÃO toca o backend.** Fazer o port crescer criaria um **segundo** filtro
sem cliente — e o projeto já nomeia esse erro por escrito, no `book.ts`: *"a `/writers`
equivalente existe sem cliente nenhum desde a Tarefa 11 (medido), e criar a gêmea seria repetir
um erro já pago"*. ✅ **A frase "é aditiva e ninguém pediu" do port CONTINUA VERDADEIRA**, porque
quem pediu foi a tela, e a tela não passa por lá.

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **A sexta dimensão do `filterEntries`, no cliente** | Modelo da tela desde a Tarefa 28, e o que a 38g acabou de reafirmar. **Zero requisição nova, zero linha no backend** |
| **B** | ⚠️ **A faixa EXCLUI o que não tem página** — nota (que nunca tem) e grifo com `page` nulo | ✅ **Não é escolha nova: é o precedente da COR, medido nesta tela.** `colorOf(note)` é `null`, e escolher uma cor **já exclui as anotações**. E o port do grifo documenta a mesma coisa do lado do servidor: *"no Postgres `WHERE "page" = 45` contra `NULL` é FALSO — o filtro por página não traz o grifo sem página"*. Cliente e servidor concordam |
| **C** | ⚠️ **O grupo some quando o tipo exclui grifo** — `pageApplies`, irmão do `colorApplies` | Já existe `typeCanIncludeHighlight(typeFilter)` na tela, e é o dono da pergunta "esta dimensão faz sentido agora?". ⚠️ **Reuse-o; não escreva um segundo** |
| **D** | **Duas pontas, as duas opcionais.** Só "de", só "até", ou as duas | Vazio = sem limite daquele lado. "A partir da 40" é pedido real e não custa nada |
| **E** | **Faixa invertida (de > até) devolve lista vazia, literalmente** | É o que a pessoa escreveu. ⚠️ **Não "conserte" trocando os dois em silêncio** — um filtro que desobedece é pior que um filtro que devolve nada, e a frase de vazio da 38g já cobre o caso |
| **F** | **O teto é o `HIGHLIGHT_PAGE_MAX` do `shared`**, o mesmo da borda | Um teto próprio na tela seria uma segunda verdade sobre o contrato da coluna |

---

## As regras

1. **TDD.** A faixa é decidível **sem tela** — função pura sobre `AcervoEntry[]`, como o
   `matchesText` da 38g. Teste lá primeiro.
2. ⚠️ **A decisão B com teste dos DOIS casos que somem:** a **nota** (que nunca tem página) e o
   **grifo com `page` nulo**. ⚠️ **O segundo é o que ninguém escreve**, e é legítimo — grifar
   sem anotar a página é caso previsto, e a coluna é anulável de propósito.
3. ⚠️ **A faixa COMBINA com as outras cinco, e isso precisa de teste** (§ a lição da 38g).
   ⚠️⚠️ **E o fixture não pode ser cúmplice:** um teste de `faixa AND cor` só prova o AND se a
   cor **sozinha** devolvesse MAIS. A 38g descobriu isso do jeito difícil — o fixture dela
   ganhou quatro entradas "mudas" por causa disso. **Faça o mesmo aqui, e mostre os dois
   tamanhos em cada par.**
4. **Mutação obrigatória:** (a) o casamento de faixa → `return true`; (b) a faixa passa a
   **incluir** quem não tem página. Os dois com acusador.
5. ⚠️ **Contador canônico colado ANTES e DEPOIS dos três arquivos.** Hoje: `acervo.tsx` **511**
   (⚠️ **não pode subir**), `acervo-filters.tsx` **194**, `acervo-entries.ts` **142**.
   ⚠️ **Um bloco `{/* … */}` de JSX conta 1 linha** no contador — a 38g descobriu isso ficando
   em 512 por causa de um comentário.
6. ⚠️ **`expectNoGuilt()` nos estados novos**, inclusive o de faixa que não achou nada.
7. **Um catálogo só**: frases novas em `pt`, sem irmã em inglês.
8. **Backend intocado.** ⚠️ **Se você sentir vontade de acrescentar `pageFrom`/`pageTo` ao
   port, PARE e leia a correção no topo** — seria um filtro sem cliente, e a fatia foi desenhada
   para não fazer isso.
9. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
   `pnpm --filter @clube/app build`. Hoje: **587 · 195 · 1943 · 777**; integração **618**;
   chunk **432.726 B** (teto **450.000**, folga 17.274); precache **16 / 899,54 KiB**.

---

## Definição de pronto

- [x] O acervo filtra por faixa de página, **junto** com as outras cinco dimensões.
- [x] Nota e grifo sem página **somem** da faixa — os dois com teste.
- [x] O grupo some quando o tipo exclui grifo, pelo `typeCanIncludeHighlight` que já existe.
- [x] Faixa invertida devolve vazio, sem "consertar" a entrada.
- [x] `acervo.tsx` **não cresceu** — contador colado antes e depois.
- [x] Mutação nos dois pontos da regra 4, com acusador, e o fixture **não é cúmplice**.
- [x] **Nenhuma mudança no backend.** Nenhuma migration. Nenhuma dependência nova.

---

## O que ficou medido (execução de 2026-09-18)

**O contador canônico, antes e depois (regra 5):**

```
                      ANTES   DEPOIS
acervo.tsx              511      511   ← não subiu uma linha
acervo-filters.tsx      194      257   ← os dois campos (PageRangeFilter)
acervo-entries.ts       142      167   ← o casamento (matchesPage) e o PageRange
```

O saldo da tela veio de **um** lugar só: o "tentar de novo" estava escrito **três** vezes
no `acervo.tsx` — um por carga que pode falhar (`/me`, livro, acervo) —, com a mesma
chave e a mesma variante, e virou o `retryButton`. É o `authorLabel` da 38g outra vez: a
dimensão nova se paga com uma repetição a menos, não com um arquivo maior. O que ENTROU na
tela foram oito linhas: dois imports, o estado da faixa, o `page: pageRange` do recorte, o
descarte no toque de tipo e três de render.

**A regra 3, par a par, com os DOIS tamanhos** (fixture do unitário, faixa `[10, 100]`):

| par | com a faixa | sem a faixa |
| --- | --- | --- |
| faixa sozinha | 3 | 8 (as oito entradas) |
| ∧ PESSOA (minhas) | 2 | 5 |
| ∧ PESSOA (dela) | 1 | 3 |
| ∧ TIPO (grifo) | 3 | 6 |
| ∧ TIPO (do dia) | 0 — vazio por construção | 1 |
| ∧ COR (verde) | 1 | 2 |
| ∧ COR (amarelo) | 2 | 4 |
| ∧ LEITURA | 0 — vazio por construção | 1 |
| ∧ TEXTO ("colina") | 2 | 7 (e a faixa sozinha, 3) |
| **as SEIS juntas** | 1 | 2 sem a faixa |

⚠️ **O fixture NÃO é cúmplice:** cada recorte das outras cinco contém pelo menos uma
entrada **fora** de `[10, 100]` — a página 120, a 200, o grifo de `page` nula e as duas
anotações —, e por isso nenhuma das colunas da direita repete a da esquerda.

**As mutações (regra 4), com acusadores nomeados** (suíte do app em **799**):

| Mutante | Acusadores |
| --- | --- |
| `matchesPage` → `return true` (o filtro que não filtra) | **18** (13 no unitário, 5 na tela) |
| a faixa **inclui** quem não tem página (`page === null` → `true`) | **13** (8 no unitário, 5 na tela) |
| a tela passa `page: EVERY_PAGE` ao `filterEntries` (campo desligado) | **5**, todos na tela |
| o `setPageRange(EVERY_PAGE)` do toque de tipo some (a escolha sobrevive escondida) | **1**, na tela |

**O que NÃO foi provado:** a suíte de integração do backend não foi rodada — esta fatia
não toca um arquivo de `packages/backend` (`git status` confirma) e não tem migration.

---

## Rodada de correção (auditoria da 38h) — três achados, os três de PROSA

A auditoria independente **não achou nada de ALTO**: 1 MÉDIO e 2 BAIXOs, e nenhum deles toca
uma linha executável. Nenhuma contagem mudou — o contador canônico continua **511 · 257 ·
167**, porque comentário de bloco não conta.

**✅ E UMA MEDIÇÃO A MAIS, do dono, que era o que ele mais queria confirmar.** O mutante
**fino** do revisor — `if (page === null) return entry.type === 'HIGHLIGHT'`, em que a
anotação continua sumindo e **só o grifo de página nula volta** — dá **11 acusadores**, e o
nomeado é `⚠️ drops the HIGHLIGHT whose page is NULL — the one nobody writes (rule 2)`. O
caso que ninguém escreve tem acusador **próprio**, não de carona na anotação. O revisor
também confirmou que os **seis** pares do "E" acusam individualmente, que o AND morde nas
**duas** direções (apagar a linha da COR derruba o par da 38g **e** o da 38h — o par novo
não é um teste de faixa disfarçado) e que a consolidação do `retryButton` **não comprou
cobertura com linha**: os três call sites, mutados isoladamente, têm acusador cada um, e a
política do `isRetriable` — que o botão deliberadamente não absorveu — continua guardada.

**🟡 MÉDIO — o renome deixou prosa morta em DOIS docblocks do mesmo arquivo.** O `const`
passou a se chamar `highlightApplies` (decisão C: a faixa faz a MESMA pergunta que a cor,
então um segundo booleano seria um segundo nome para o mesmo valor), e `colorApplies` ficou
escrito em dois lugares como se ainda existisse — **zero declarações**. É a lição do
`dayRange` que o `CLAUDE.md` registra: um nome que não existe faz o próximo leitor procurar,
não achar, e inventar um terceiro.

- **no comentário dos setters**, o pior dos dois: ele dizia `colorApplies` **e** "estas duas
  linhas" — contradizendo o cabeçalho do PRÓPRIO bloco três linhas acima (já corrigido para
  "AS TRÊS ESCOLHAS CONDICIONAIS") e o código abaixo, que tem três setters. ⚠️ **Metade do
  comentário tinha sido atualizada e a outra metade não, e é a de baixo que se lê primeiro**
  ao chegar nos setters;
- **no docblock "DECISÃO E, GENERALIZADA"**, que ficou inteiro na versão de cinco dimensões:
  a enumeração não citava a faixa, dizia "estes **dois** booleanos" sem explicar por que dois
  booleanos servem três controles, e a lista do parêntese omitia o `setPageRange(EVERY_PAGE)`.

Os dois foram corrigidos, com o registro do defeito ao lado. ⚠️ **E os dois parágrafos que
descrevem o mutante de código morto da 38g deixaram de CITAR o nome do booleano**: eles
descrevem uma mutação que alguém pode querer reaplicar, e um nome citado ali envelhece
sozinho — quem for remedir lê o nome no código, três linhas abaixo. O `grep` final
(`grep -n colorApplies`) devolve só menções que falam do renome e a **prop** do
`filterGroups`, que existe de verdade (`acervo-filters.tsx:164/183/217`).

**🔵 BAIXO 1 — "5 acusadores na tela" não são cinco pares medidos.** O teste de AND da tela é
**um** `it` com cinco pares em sequência: sob mutação ele morre no PRIMEIRO `expect` e os
outros quatro nunca são avaliados, então a resolução dele é "algum par quebrou". ✅ Não é
grave porque a medição par a par existe onde é barata — o unitário tem **seis** `it`
separados, e os seis acusaram. O docblock do teste passou a dizer isso por escrito, para
ninguém ler o número como "cinco pares medidos".

**🔵 BAIXO 2 — registrado, sem conserto.** O `boundOf` aceita 0, negativo e valor acima do
teto. É inofensivo (só produz lista vazia), a decisão F está escrita, e o `min`/`max` do
`<input>` **estão assertados no DOM** — a segunda verdade que a decisão F queria evitar não
existe. Fica aqui para a próxima auditoria não achar que ninguém olhou.

Gates da rodada: **587 · 195 · 1943 · 799** · typecheck Done nos quatro · lint limpo ·
prettier limpo · build com chunk de **433.794 B** e precache 16 / 900,62 KiB. Varredura de
invisíveis rodada de novo sobre os arquivos do diff, provando antes que ela morde (um soft
hyphen e um NBSP plantados): nenhum.
