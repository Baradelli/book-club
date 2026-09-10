import type { ReadingLog } from '../../domain/reading-log';

/**
 * O recorte de "quem leu o quê", e ele é do **LIVRO** para baixo.
 *
 * ⚠️ **`bookId` é obrigatório e `clubId` NÃO existe aqui** (decisão F da
 * Tarefa 32), ao contrário do `NoteFilter` e do `HighlightFilter`, onde o
 * `clubId` é o campo obrigatório e é o corte de tenant. A razão é que os dois
 * únicos chamadores (`getBookWithPlan` e, na 32b, a tela do livro) já
 * resolveram o clube pelo **livro**, via `bookForActor` — e é ele que corta o
 * tenant. Pôr `clubId` aqui criaria uma **segunda** regra de tenant para manter
 * em dia com aquela, e duas regras de tenant é como uma delas fica para trás.
 *
 * Não há filtro por instante nem por intervalo: "que dia é hoje" não passa por
 * esta feature (o log ancora no dia do PLANO, não numa data de calendário — ver
 * `domain/reading-log.ts`). Se um dia o lembrete anti-culpa precisar de
 * "li hoje", o filtro que ele pede é outro, e nasce com ele.
 */
export interface ReadingLogFilter {
  bookId: string;
  /** O leitor — "as minhas leituras neste livro". */
  userId?: string;
  /** O dia do plano — "quem leu este dia". */
  planItemId?: string;
}

/**
 * O port do log de leitura: `save` · `byPlanItemAndUser` · `find` · `delete`.
 *
 * Nasceu com três métodos na Tarefa 30 e ganhou o `find` na **32**, junto da
 * implementação Prisma, na **mesma unidade** — que é o que o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige de quem cresce um port: crescer sem
 * implementar no Prisma dá 16 erros de `typecheck` em 9 arquivos alheios, e um
 * vermelho de compilação em arquivo alheio esconde o vermelho de teste que a
 * unidade deveria mostrar.
 *
 * **Sem `update`, e sem `NotePatch` equivalente**: o log é **imutável** por
 * decisão fechada do MVP 3. Nada reescreve uma linha destas — desmarcar apaga.
 */
export interface ReadingLogRepository {
  /** Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03). */
  save(log: ReadingLog): Promise<ReadingLog>;
  /**
   * "Esta pessoa já marcou este dia?" — a leitura que torna o `markRead`
   * idempotente e o `unmarkRead` alcançável.
   *
   * O par `(planItemId, userId)` **é a identidade** do registro: é o
   * `@@unique` que a Tarefa 32 declara, e é por isso que nenhum dos dois
   * UseCases recebe id de log no input. Consequência estrutural, e não um
   * `if`: o log de outra pessoa é **inalcançável** — a busca já é por autor,
   * então não há o que um guard de autoria guardasse.
   *
   * Devolve `null` quando não há — "não marcado" não é erro em lugar nenhum
   * desta feature.
   */
  byPlanItemAndUser(
    planItemId: string,
    userId: string,
  ): Promise<ReadingLog | null>;
  /**
   * "Quem leu o quê neste livro" — a leitura que serve a sobreposição da tela
   * do livro (o `readers` do `GET /books/:bookId`) e o `computeBookProgress`.
   *
   * **Não promete ordem**, como todos os `find` do projeto: quem ordena é o
   * `groupUsersByPlanItem`, pela ordem do plano. O fake enumera INVERTIDO de
   * propósito, para ninguém depender da ordem sem perceber
   * (`docs/CONVENCOES-CODIGO.md` §7.2).
   *
   * ⚠️ **SEM teto de linhas (`take`), e a divergência com o `find` da nota e
   * o do grifo é deliberada — medida na Tarefa 32.** O `docs/BACKLOG.md`
   * previa que "quando o terceiro `find` precisar da válvula (`ReadingLog`/
   * `ActivityEvent`), extraia constante + docblock" — e a medição diz que ele
   * **não precisa**, por dois motivos:
   *
   * 1. **A conta não é a mesma, e ela cabe numa linha.** O
   *    `FIND_ROW_LIMIT = 500` da nota existe porque o `doc` é a maior coluna
   *    da tabela: **~6,8 KiB de heap por nota** (medido na Tarefa 10), então
   *    o teto que aquele `take` permite é `500 × 6,8 KiB ≈ **3,4 MB**`. Uma
   *    linha daqui tem **seis colunas escalares e nenhum JSON** — **~17× mais
   *    barata**, ~0,4 KiB —, e o conjunto é limitado por construção:
   *
   *    ```
   *    realista    ~30 dias de plano × 2 a 10 membros  =  60 a 300 linhas
   *    patológico  ~365 dias × 8 membros ≈ 3.000 linhas × 0,4 KiB ≈ 1,2 MB
   *    ```
   *
   *    Ou seja: o **pior caso imaginável** desta tabela ainda é **um terço**
   *    do que o `take: 500` da nota deixa passar no caso comum dela. A
   *    válvula não tem o que segurar.
   * 2. **Um `take` aqui seria a FALHA, não a válvula.** O resultado alimenta
   *    uma sobreposição de presença: cortar em N faria a tela **perder
   *    leitores em silêncio** e o progresso do grupo encolher sem motivo.
   *    É exatamente o argumento do `planItemIdsWithAnyNote`, que também não
   *    tem `take` e diz isso no docblock — lá o corte liberaria uma remoção
   *    que a FK depois recusa; aqui apagaria gente que leu.
   *
   * Se um dia existir listagem cronológica de leitura (não existe: nem o
   * índice `@@index([clubId, createdAt])` das outras tabelas foi criado), ela
   * pede paginação por cursor, não um `take` sem ordem.
   */
  find(filter: ReadingLogFilter): Promise<ReadingLog[]>;
  /**
   * Hard delete de verdade: a linha some.
   *
   * **É a exceção documentada ao soft delete do projeto** (`CLAUDE.md`):
   * `ReadingLog` e `ActivityEvent` são logs imutáveis, não se arquivam, e
   * desmarcar "li" apaga. Nenhum `status`, nenhum `archivedAt` — eles nem
   * existem na entidade.
   *
   * ⚠️ **É IDEMPOTENTE: id inexistente NÃO é erro**, e isso é contrato, não
   * detalhe do fake. A Tarefa 32 tem de implementá-lo com
   * `deleteMany({ where: { id } })`. O motivo é uma corrida real: entre o
   * `byPlanItemAndUser` do `unmarkRead` e este `delete` cabem o segundo toque
   * da pessoa e o retry da fila offline, e transformar isso em 500 é o oposto
   * exato da decisão C da Tarefa 30, que diz que desmarcar duas vezes é
   * inofensivo.
   *
   * ⚠️ **As duas metades da frase acima nasceram com pesos de evidência
   * DIFERENTES, e a Tarefa 32 mediu a que faltava.** O `docs/CONVENCOES-CODIGO`
   * §7.1 registra por quê o rótulo importava: afirmação sobre o comportamento
   * do banco escrita em comentário e não medida é suposição com cara de fato, e
   * das cinco que a auditoria da Tarefa 24 conferiu, **duas caíram — as duas
   * dizendo "medido"**. Esta sobreviveu.
   *
   * - ✅ **`deleteMany` é idempotente: MEDIDO, e com precedente no projeto.**
   *   `PrismaReadingPlanItemRepository.replaceForBook` já depende disso
   *   (`repositories/prisma-reading-plan-item-repository.ts`, docblock do
   *   método), e tem teste de contrato contra o Postgres. Confirmado outra vez
   *   aqui: `deleteMany` de id inexistente devolve `{ count: 0 }`.
   * - ✅ **`delete({ where: { id } })` levanta `P2025`: MEDIDO na Tarefa 32,
   *   contra ESTE Postgres** (Prisma 5.22, Postgres do `docker-compose`):
   *
   *   ```
   *   PrismaClientKnownRequestError | code = P2025
   *   meta = {"modelName":"ReadingLog","cause":"Record to delete does not exist."}
   *   ```
   *
   *   O rótulo "NÃO MEDIDO" que estava aqui foi trocado pelo fato, e a medição
   *   **não é só do relatório**: ela é um teste permanente —
   *   `states the precondition: prisma.delete on a missing id raises P2025`, em
   *   `repositories/__tests__/prisma-reading-log-repository.contract.integration.test.ts`.
   *   Sem ele, "escolhemos `deleteMany`" e "`delete` também serviria" dariam o
   *   mesmo resultado observável no teste do no-op, e esta prescrição seria
   *   superstição. Se um dia o Prisma mudar, é ele que acusa.
   *
   * Este docblock é o **dono** da decisão: o fake e a suíte dele apontam para
   * cá em vez de repetir a afirmação — uma verdade, um lugar.
   *
   * Não devolve nada: "quantas linhas apagou" não muda decisão nenhuma do
   * domínio, e a única pergunta que alguém faria com esse número
   * ("estava marcado?") já foi respondida pelo `byPlanItemAndUser`.
   */
  delete(id: string): Promise<void>;
}
