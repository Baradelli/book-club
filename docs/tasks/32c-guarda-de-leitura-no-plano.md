# Tarefa 32c — Remover dia do plano que já tem LEITURA recusa com 400, não com 500

> **Fatia inserida, e o motivo foi medido pela Tarefa 32 — que é quem introduziu o caminho.**
> Antes dela não havia `ReadingLog`; depois dela, existe um jeito de o admin tomar um 500 mudo
> numa ação normal.
>
> Leia antes: `CLAUDE.md`, `docs/CONVENCOES-CODIGO.md` **§6.2** (`handleDomainError` é o único
> tradutor, e `error.message` só sai na classe 400 — ou seja, **a mensagem desta guarda é
> publicada**), **§6.9** (o port cresce: implementação Prisma na **mesma** unidade), **§7.1**,
> **§7.3**, **§7.5**. ADR `0007`.
>
> **Os vizinhos, e eles são quase um molde:** `src/usecases/replace-plan-items.ts:99-121` (a
> guarda de **nota**, com o docblock que explica por que ela usa `planItemIdsWithAnyNote` e
> não a sobreposição) · `src/usecases/ports/note-repository.ts:137-143` (o método irmão, e o
> contrato `[] → []` sem ida ao banco) · `src/repositories/prisma-note-repository.ts` (a
> implementação dele) · `src/usecases/ports/reading-log-repository.ts` (o port que cresce) ·
> `src/repositories/__tests__/prisma-reading-log-repository.contract.integration.test.ts:687`
> (⚠️ **o teste que PINA a lacuna hoje** — ver regra 8).

## Objetivo

Eu corrijo o plano de leitura e o app me diz **por que** não dá para tirar aquele dia, em vez
de estourar.

## A lacuna, como a Tarefa 32 a mediu

O `replacePlanItems` tem guarda de domínio para "não remover dia que já tem **nota**"
(`planItemIdsWithAnyNote`). Ele **não sabe nada** sobre `ReadingLog`. Então um dia que tem
**só leitura**:

1. passa pela guarda — `note.count({planItemId})` é **0**;
2. chega ao `replaceForBook` e bate na FK `ReadingLog_planItemId_fkey ON DELETE RESTRICT`;
3. vira erro de banco → **500**, sem mensagem.

**O dado fica a salvo** (o `replaceForBook` roda em `$transaction`, e o teste pinado prova que
o plano continua intacto). O que está errado é o status e o silêncio.

⚠️ **E o pior detalhe é de produto, não de código:** a guarda de nota **funciona** e dá uma
mensagem clara. O admin aprende que o sistema recusa educadamente — e é surpreendido por um
500 mudo no caso irmão. É caso de terça-feira: o admin edita o plano do livro do mês e basta
**uma** pessoa ter marcado "li" sem escrever nada.

## Escopo enxuto

**Entra:** `planItemIdsWithAnyReadingLog` no port (com a implementação Prisma na mesma
unidade), a segunda guarda no `replacePlanItems`, e as mensagens que não mentem.

| Fora | Por quê |
| --- | --- |
| Migration, mudança de modelo | A FK e o índice já existem (Tarefa 32). ⚠️ Se você achar que precisa de migration, **pare e reporte**. |
| Tela / mensagem traduzida no app | A borda publica `error.message` na classe 400 e o app mapeia por **chave**, não por texto (§6.2). Se o mapeamento precisar de chave nova, **meça e reporte** — pode virar fatia curta, não entra aqui de surpresa. |
| Deixar remover o dia apagando as leituras junto | Apagar registro de leitura de outra pessoa para o admin poder editar o plano viola o `CLAUDE.md` ("ninguém mexe no conteúdo de outra pessoa") e o `ReadingLog` é **log imutável**. Nem como opção. |
| Desfazer/arquivar dia do plano | Não existe no modelo, e inventar estado novo é MVP 4. |

## Decisões já tomadas (não reabrir)

- **`ReadingLog` é log imutável**; a leitura de alguém não se apaga para acomodar uma edição
  de plano.
- **`handleDomainError` é o único tradutor**, e `error.message` só sai na classe **400**.
- **Nenhum acesso a banco fora de um Repository.**
- **O port cresce com a implementação Prisma na mesma unidade** (§6.9): medido na Tarefa 26a
  — 16 erros em 9 arquivos, sete deles em rotas alheias.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **Um método próprio no port — `planItemIdsWithAnyReadingLog(ids)` — e NÃO `find({bookId})` filtrado em memória** | O relatório da Tarefa 32 sugeriu o `find`. Recuso: carregar **todos** os logs do livro para descartar quase todos é o §7.3 na letra (*"em vez de carregar tudo e filtrar em memória — o mesmo bug com uma fatura de banco maior"*). E o método próprio é o **espelho exato** do `planItemIdsWithAnyNote`, incluindo o contrato `[] → []` **sem ida ao banco**, que é o que deixa o caminho "não remove nada" de graça. |
| B | ⚠️ **Duas guardas com mensagens DISTINTAS, não uma mensagem combinada** | A mensagem de hoje diz *"…that already have notes"*. Se um dia tem só leitura e a guarda reaproveitar essa frase, **a resposta mente** — e ela é a única publicada. Combinar numa frase só ("notes or readings") não mente, mas obriga o admin a adivinhar qual dos dois é. São ações mentais diferentes ("alguém escreveu ali" × "alguém já leu aquilo"). |
| C | **Só a CONTAGEM na mensagem**, como a guarda de nota já faz | Nem autor, nem título, nem id: `error.message` vai para a resposta, e o admin não precisa saber **quem** leu para entender que não pode remover o dia. É a decisão que o docblock da guarda de nota já registra. |
| D | ⚠️ **As duas guardas rodam ANTES de qualquer escrita, e a de nota continua primeiro** | Manter a ordem existente evita que a fatia mude o comportamento observável de um caso que já funciona (dia com nota **e** leitura continua dando a mensagem de nota). Ordem estável é menos churn de teste e menos surpresa. |
| E | ⚠️ **O teste que a Tarefa 32 pinou para provar a lacuna deixa de descrever a verdade e é TROCADO** | `lets a day with only a reading log through the note guard, and then the FK refuses it` (`…contract.integration.test.ts:687`) documenta o **defeito**. Depois desta fatia ele estaria provando que o defeito continua — e ele passaria, porque o repositório de fato deixa passar; quem passa a recusar é o UseCase. A substituta pina a verdade nova, **no lugar certo**: a FK continua sendo a rede embaixo (contrato), e a **recusa educada** é do UseCase (unitário). Nenhuma das duas se apaga. |
| F | **A FK `Restrict` continua, e o docblock diz que ela é a rede** | É a mesma relação que o `Note` tem: a guarda de domínio dá a mensagem decente, o `Restrict` é a rede embaixo dela. Tirar a FK porque "agora tem guarda" é trocar uma proteção estrutural por uma que alguém pode esquecer de chamar. |

## Regras (o que os testes provam)

### O port e o repositório

1. `ReadingLogRepository` ganha `planItemIdsWithAnyReadingLog(planItemIds)`, espelhando o
   `planItemIdsWithAnyNote`: recebe ids do plano, devolve os que **têm** log.
2. ⚠️ **`[]` de entrada devolve `[]` SEM ida ao banco** — o mesmo contrato do irmão. Provado
   por **contagem** no fake (§7.3), não por resultado: o resultado é igual nos dois casos.
3. O fake cresce junto, com contador próprio, e mantém a enumeração invertida (§7.2).
4. ⚠️ **Teste de contrato contra o Postgres:** devolve só os ids que têm log, **sem duplicar**
   quando duas pessoas leram o mesmo dia, e **não** devolve id de dia sem log.
5. ⚠️ **A implementação Prisma vem na MESMA unidade que o port** (§6.9).

### A guarda

6. Dia do plano com **só leitura** → **`InvalidBookError`** (400), com mensagem que fala de
   **leitura**, e o plano **não** é tocado.
7. ⚠️ Dia com **nota** continua dando a mensagem de **nota** (D) — o comportamento que já
   existe não muda.
8. ⚠️ A recusa vem **antes de qualquer escrita**: provado por **contagem** (`replaceForBook`
   não foi chamado), não pela ausência de erro.
9. Dia sem nota e sem leitura é removido normalmente — o par positivo, sem o qual uma guarda
   que recusa tudo passaria.
10. ⚠️ **A mensagem não mente em nenhum dos três casos** (só nota · só leitura · os dois), e o
    teste asserta a **mensagem**, não só a classe do erro.

### Transversais

11. ⚠️ **O teste da Tarefa 32 que pina a lacuna é TROCADO** (decisão E), com o nome antigo e o
    novo colados no relatório. **Não apague sem substituir.**
12. Nenhuma classe de erro nova — `InvalidBookError` já existe e já está mapeada em 400.
    `NOT_YET_MAPPED` continua `[]`.
13. ⚠️ **`packages/app`, `packages/ui` e `prisma/` INTOCADOS** — `git status` vazio, colado.
    Chunk de entrada continua **418.320 B**.
14. ⚠️ **A integração roda, e é você quem a roda.** Baseline **436**. Cole o número novo, a
    prova por consulta de que nenhum fixture sobrou, e o super-admin intacto.

## Arquivos a tocar

```
packages/backend/src/usecases/ports/reading-log-repository.ts        + o método
packages/backend/src/usecases/_fakes/reading-log-repository-fake.ts  + o método e o contador
packages/backend/src/usecases/_fakes/__tests__/                      crescer
packages/backend/src/repositories/prisma-reading-log-repository.ts   + a implementação
packages/backend/src/repositories/__tests__/*.contract.integration.test.ts  crescer + a TROCA (11)
packages/backend/src/usecases/replace-plan-items.ts                  + a segunda guarda
packages/backend/src/usecases/__tests__/replace-plan-items.test.ts   crescer
packages/backend/src/routes/book-routes.ts                           a instanciação (5ª dependência)
packages/backend/src/routes/__tests__/book-routes.integration.test.ts  só se o caminho de 400 merecer
```

**Não tocar:** `prisma/**` (**a FK e o índice já existem**) · `packages/app/**` ·
`packages/ui/**` · `packages/shared/**` (nenhum schema muda) · `docs/**` ·
`src/domain/**` (nenhuma entidade muda).

## Definição de pronto

- [x] `planItemIdsWithAnyReadingLog` no port + Prisma **na mesma unidade** (1, 5).
- [x] ⚠️ `[] → []` **sem ida ao banco**, provado por **contagem** (2).
- [x] Contrato contra o Postgres: sem duplicar, sem id sem log (4).
- [x] Dia com só leitura → **400** com mensagem de **leitura**, plano intacto (6).
- [x] ⚠️ Dia com nota continua com a mensagem de **nota** (7); recusa **antes da escrita**,
      por contagem (8); dia livre é removido (9).
- [x] ⚠️ A mensagem **não mente** nos três casos, assertada por texto (10).
- [x] ⚠️ O teste da Tarefa 32 **TROCADO**, nome antigo e novo colados (11).
- [x] `pnpm -r test`, `typecheck`, `lint`, `prettier --check .`, `build` limpos — baseline
      **428** shared · **195** ui · **1399** backend · **641** app.
- [x] ⚠️ **Integração rodada por você** (era **436**) + banco limpo + super-admin intacto (14).
- [x] ⚠️ `git status -- packages/app packages/ui packages/backend/prisma` **vazio** (13).
- [x] **Linhas coladas** (contador canônico — o comando do docblock de `acervo.tsx`) dos
      arquivos que mudaram de tamanho.
- [x] ⚠️ O **vermelho colado** das regras 2, 6, 8 e 11.
