import type { Book, ReadingPlanItem } from '../domain/book';
import type { Highlight } from '../domain/highlight';
import type { PlanItemReaders } from '../domain/plan-item-readers';
import { groupReadersByPlanItem } from '../domain/plan-item-readers';
import type { PlanItemWriters } from '../domain/plan-item-writers';
import { groupWritersByPlanItem } from '../domain/plan-item-writers';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { HighlightRepository } from './ports/highlight-repository';
import type { NoteRepository } from './ports/note-repository';
import type { ReadingLogRepository } from './ports/reading-log-repository';
import type { ReadingPlanItemRepository } from './ports/reading-plan-item-repository';

/**
 * O TAMANHO DO ACERVO DO LIVRO — quantas anotações e quantos grifos o clube
 * escreveu nele.
 *
 * ⚠️ **É INVENTÁRIO, NÃO PLACAR** (decisão F da Tarefa 44b), e a distinção não
 * é de estilo:
 *
 * - não há **total** contra o qual comparar — "18" não é "18 de 30";
 * - o número **não muda quando alguém deixa de escrever**, então ele não pode
 *   virar dívida;
 * - ele **não é por pessoa**, então não há com quem se comparar.
 *
 * É o que o §1 do plano proíbe (comparação e cobrança) medido contra o que
 * ele não proíbe (o tamanho do que o clube fez junto). O rótulo ao lado, no
 * `pt.ts`, diz a mesma coisa para quem for auditar a tela.
 */
export interface BookInventory {
  /** Anotações `ACTIVE` do livro — **a avulsa incluída**. */
  notes: number;
  /** Grifos `ACTIVE` do livro — **o avulso incluído**. */
  highlights: number;
}

export interface GetBookWithPlanInput {
  actorUserId: string;
  bookId: string;
}

export interface GetBookWithPlanOutput {
  book: Book;
  planItems: ReadingPlanItem[];
  /**
   * "Quem já escreveu em cada dia" — só os dias que têm nota, na ordem do
   * plano. Lista vazia é resposta legítima: ninguém escreveu ainda.
   */
  writers: PlanItemWriters[];
  /**
   * "Quem já leu cada dia" — só os dias que têm leitura, na ordem do plano.
   * Lista vazia é resposta legítima: ninguém marcou ainda.
   *
   * Tipo PRÓPRIO, e não o `PlanItemWriters` de cima (decisão D da Tarefa 31):
   * o formato é o mesmo e o significado não é, e é este campo que viaja para o
   * `shared` e para a tela.
   *
   * ⚠️ **Nenhum contador, nenhum total e nenhum percentual** — nem aqui nem em
   * lugar nenhum desta resposta. Progresso é **presença** (decisão do dono,
   * `docs/ACEITE-MVP.md` MVP 3, pergunta 1) e é **calculado** a partir dos
   * logs, nunca guardado. É o contrato que torna o número irrenderizável.
   *
   * ⚠️ **A JUSTIFICATIVA LARGA CAIU NA TAREFA 38c** — o dono reverteu a
   * pergunta 1 e pediu a corrente de leitura, que **é** um número por pessoa
   * (→ `docs/adr/0010-corrente-de-leitura-visivel.md`). ✅ **A afirmação
   * estreita daqui continua inteira e continua testada:** esta resposta continua sem
   * contagem. ⚠️ **A pergunta 1 foi revertida pelo dono**, mas a reversão não
   * passou por aqui: a corrente nasceu em `GetClubStreaks`, um caso de uso
   * próprio, e "calculado, nunca guardado" continua valendo para as duas.
   */
  readers: PlanItemReaders[];
  /**
   * ⚠️ **O INVENTÁRIO DO ACERVO — TAREFA 44b, e é a TERCEIRA aplicação do
   * argumento do docblock da classe.**
   *
   * "Uma abertura de livro é UM corte de tenant, não três." O `writers` entrou
   * assim na Tarefa 11, o `readers` na 32, e as contagens entram aqui — **sem
   * rota de contagem e sem envelope com total nas listagens**. Buscar
   * `GET /clubs/:clubId/notes` e `/highlights` só para somar seria uma
   * TERCEIRA requisição nesta tela, contra a regra 1 da Tarefa 28 — a fatia
   * que tirou o acervo daqui justamente por isso.
   *
   * ⚠️ **ISTO NÃO REABRE "nenhum contador" — leia o campo `readers` acima.** O
   * que aquele parágrafo afirma, e continua afirmando, é que **o progresso**
   * não vira número: nenhum `readDays`, nenhum total de dias, nenhum
   * percentual, nada por pessoa. O inventário é outra coisa (→ `BookInventory`),
   * e o dono abriu a exceção por escrito em 2026-09-22.
   */
  inventory: BookInventory;
  /**
   * O grifo `ACTIVE` mais recente do livro, ou `null` — o bloco "Último grifo"
   * da margem (decisão D da Tarefa 44b).
   *
   * `null` é resposta legítima, e é o caso comum de um livro recém-cadastrado:
   * a margem simplesmente não desenha o bloco. Um placeholder ali seria o
   * vazio anunciado que o §1 do plano proíbe.
   *
   * ⚠️ **A ENTIDADE INTEIRA, e a rota é que projeta.** É **uma** linha, então
   * não há o que economizar — e o port já devolve `Highlight` no `byId`, o que
   * mantém o vocabulário uniforme. Quem escolhe o que viaja para o cliente é o
   * `bookWithPlanResponseSchema`, que declara só o que a margem desenha (cor,
   * página, trecho e autor) — o `commentDoc` fica no servidor.
   */
  lastHighlight: Highlight | null;
}

/**
 * Abrir o livro: o cadastro, o plano ordenado, **quem já escreveu** e **quem
 * já leu** cada dia, **o tamanho do acervo** e **o último grifo**.
 *
 * **Não** exige papel — o livro é do grupo, e todo membro ativo abre.
 *
 * ⚠️⚠️ **TERCEIRA APLICAÇÃO DO MESMO ARGUMENTO (Tarefa 44b, 2026-09-23).** O
 * `inventory` e o `lastHighlight` entraram aqui — e **não** como rota de
 * contagem nem como envelope com total nas listagens — porque a frase de dois
 * parágrafos abaixo já valia para eles: uma abertura de livro é UM corte de
 * tenant, não cinco. O `writers` entrou assim na Tarefa 11, o `readers` na 32.
 * Buscar `GET /clubs/:clubId/notes` e `/highlights` só para somar seria ainda
 * uma TERCEIRA requisição nesta tela, contra a regra 1 da Tarefa 28.
 *
 * ⚠️ **O `readers` entrou na Tarefa 32 pelo mesmo argumento do `writers`, e é
 * por isso que NÃO existe `GET /books/:bookId/readers`.** Uma abertura de
 * livro é UM corte de tenant, não três, e a `/writers` gêmea que existe desde
 * a Tarefa 11 **nunca teve cliente** (medido: o app lê o `writers` daqui,
 * `packages/app/src/pages/book.tsx:289`). A 32b atualiza as duas sobreposições
 * rebuscando o livro.
 *
 * O `writers` entrou na Tarefa 11, e é o "o Fastify agrega para o front" do
 * `CLAUDE.md`: uma abertura de livro é UM corte de tenant, não dois. Compor
 * este UseCase com o `listPlanItemWriters` na rota faria o `bookForActor` rodar
 * duas vezes por tela aberta. Na Tarefa 07 o campo não existia porque `Note`
 * ainda não existia, e um `writers` permanentemente vazio seria pior que a
 * ausência dele — a tela mostraria "ninguém escreveu" com convicção.
 *
 * A leitura é o `planItemWritersByBook`, e não um `find`: o `doc` é a maior
 * coluna da tabela, e carregar as ~60 notas de um livro inteiras para desenhar
 * bolinhas de autoria é trafegar o acervo do clube. O agrupamento é a função
 * pura `groupWritersByPlanItem`, a MESMA que o `listPlanItemWriters` chama —
 * duas cópias divergiriam, e a divergência apareceria como uma bolinha que
 * muda ao recarregar.
 */
export class GetBookWithPlan {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly planItems: ReadingPlanItemRepository,
    private readonly notes: NoteRepository,
    private readonly logs: ReadingLogRepository,
    private readonly highlights: HighlightRepository,
  ) {}

  async execute(input: GetBookWithPlanInput): Promise<GetBookWithPlanOutput> {
    // O corte de tenant, ANTES de qualquer leitura de conteúdo: nem o plano
    // (os temas de cada dia são conteúdo do clube) nem as notas são lidos por
    // quem não é membro ativo.
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
    });

    /*
      ⚠️⚠️ **AS SEIS LEITURAS DE CONTEÚDO PARTEM JUNTAS — e elas eram SEIS
      `await` EM FILA até a rodada de correção da Tarefa 44b.**

      Elas são independentes entre si: nenhuma usa o resultado da outra, todas
      recebem o MESMO `book.id` já resolvido. Em fila, uma abertura de livro
      somava seis idas ao banco em série para montar UMA tela.

      ⚠️ **Medido contra o Postgres de desenvolvimento** (200 amostras, 20 de
      aquecimento, no livro real do banco do dono): a sequência tem **mediana
      3,68 ms** e o `Promise.all`, **1,03 ms** — **−2,64 ms, 71,9% do tempo de
      banco desta requisição**. Só as três que a 44b acrescentou custavam
      **0,97 ms** delas. Em localhost a ida de rede é quase zero; com RTT de
      verdade a conta piora linearmente, porque o que se paga são **seis**
      viagens em vez de uma. A fatia que acrescentou três `await` à fila é a
      que tinha de medir a fila.

      ⚠️⚠️ **O `bookForActor` FICA FORA DO `Promise.all`, e isso é a regra de
      tenant, não estilo.** Quem não é membro não pode descobrir nem o TAMANHO
      do acervo do clube: a autorização vem ANTES, sozinha, e só o que ela
      libera parte em paralelo. Pôr o corte dentro do lote dispararia as seis
      leituras junto com a pergunta "esta pessoa pode?" — e a resposta
      chegaria depois de o banco já ter respondido. O acusador é
      `never counts anything when the actor is not a member`.

      ⚠️ **E o paralelismo TEM acusador, sem cronômetro** (§7.3): é
      `fires the six content reads TOGETHER, not one after the other`, que
      prende a primeira leitura numa promessa do teste e exige que as outras
      cinco já estejam CONTADAS enquanto ela não respondeu. Um `expect` de
      duração seria a asserção que se autoajusta do §7.8 com roupa de
      performance — verde ou vermelha conforme a máquina.

      As seis, uma a uma:

      1. **o plano** — o port promete `order` crescente, e o UseCase ordena de
         novo mais abaixo (regra 19);
      2. **a sobreposição de autoria** — método de PROJEÇÃO, porque carregar as
         ~60 notas inteiras com o `doc` é trafegar o acervo do clube;
      3. **os logs de leitura** — UM filtro só, com o `bookId` RESOLVIDO e
         nenhuma chave à toa; não um `find` por dia, que daria a mesma
         sobreposição e N idas ao banco (é o par que só o `findFilters`
         separa, §7.3). Aqui NÃO há a economia que o `planItemWritersByBook`
         faz: uma linha de `ReadingLog` tem seis colunas curtas e nenhum JSON,
         então um método `planItemReadersByBook` seria um segundo endereço
         para a mesma leitura, sem nada a economizar;
      4 e 5. **o inventário** — `activeCountByBook` é `count()` no banco, e
         nunca `(await find({ clubId, bookId })).length`: o `find` dos dois
         repositórios Prisma tem `take: FIND_ROW_LIMIT = 500` — válvula de
         segurança, não paginação —, então o `length` seria **500** para todo
         livro com mais linhas que isso. Um número plausível, estável e
         ERRADO, publicado como fato. *Lista truncada é registro; contagem
         truncada é mentira.*
         ⚠️ E o atalho que parecia existir e está errado: somar os
         `writers[].userIds` do item 2 daria a contagem EXATA das anotações do
         plano (o `@@unique([planItemId, userId])` garante isso) e **cegaria as
         avulsas**, porque índice único não compara `NULL` com `NULL` e o
         `planItemWritersByBook` filtra `planItemId IS NOT NULL`. O erro sairia
         plausível e ninguém o veria. → nota nº 2 de `docs/tasks/44-o-livro.md`;
      6. **o último grifo** — UMA linha ordenada no banco, não o primeiro item
         de um `find` de 500 — e o `find` do port nem promete ordem. → o
         docblock do `lastActiveByBook`.

      Em todas, o `bookId` sai de `book.id` e não do input: o mesmo motivo pelo
      qual o `ReadingLogFilter` não tem `clubId` — quem corta o tenant é o
      `bookForActor` acima, e uma segunda regra de tenant é uma regra a mais
      para ficar para trás.
    */
    const [found, writers, logs, noteCount, highlightCount, lastHighlight] =
      await Promise.all([
        this.planItems.findByBook(book.id),
        this.notes.planItemWritersByBook(book.id),
        this.logs.find({ bookId: book.id }),
        this.notes.activeCountByBook(book.id),
        this.highlights.activeCountByBook(book.id),
        this.highlights.lastActiveByBook(book.id),
      ]);

    // O port já promete ordem de `order`, e ordenar aqui de novo é barato: a
    // tela do livro não pode virar um plano fora de ordem porque alguém
    // perdeu o `orderBy` no repositório Prisma.
    const planItems = [...found].sort((a, b) => a.order - b.order);

    return {
      book,
      planItems,
      // O agrupamento recebe o plano JÁ ordenado, mas ordena de novo por dentro
      // — a função é pura e não confia no chamador, e é o que a torna reusável
      // pelo `listPlanItemWriters` sem uma pré-condição escondida.
      writers: groupWritersByPlanItem(planItems, writers),
      // A MESMA conta por dentro (`groupUsersByPlanItem`), com o nome honesto:
      // chamar `groupWritersByPlanItem(planItems, logs)` compilaria — a
      // tipagem é estrutural e o `ReadingLog` tem os dois campos —, e é
      // exatamente por isso que a decisão B da Tarefa 31 recusou o reuso do
      // NOME. O teste `keeps the reading overlay independent from the writing
      // one` é o que acusa a troca.
      readers: groupReadersByPlanItem(planItems, logs),
      inventory: { notes: noteCount, highlights: highlightCount },
      lastHighlight,
    };
  }
}
