import type { ReadingLog } from '../../domain/reading-log';

/**
 * O MÍNIMO da Tarefa 30 — três métodos, e a interface cresce com quem a usa.
 *
 * **Não há `find(filter)`, e a ausência é medida.** Ele chega na **Tarefa 32**,
 * junto da implementação Prisma e do `computeBookProgress` que o consome, na
 * **mesma unidade**: método de port sem chamador é a especulação que o
 * `docs/WORKFLOW.md` proíbe, e aqui ele ficaria **duas fatias sem teste de
 * contrato**. É a mesma disciplina com que o `find` do `HighlightRepository`
 * esperou pelo `listHighlights` (Tarefa 23).
 *
 * ⚠️ **E é por o port ser NOVO que a restrição do `docs/CONVENCOES-CODIGO.md`
 * §6.9 não morde nesta fatia.** Aquele §6.9 mediu que **crescer** um port sem
 * implementá-lo no Prisma dá 16 erros de `typecheck` em 9 arquivos alheios
 * (`TS2420` na classe Prisma, `TS2345` em sete rotas). Aqui não existe classe
 * Prisma prometendo satisfazer esta interface, nem rota que a receba, nem
 * `buildRepositories` que a componha — então o disco fica verde com só o fake,
 * e o TDD mantém o sinal. A contrapartida é exatamente o parágrafo acima: o
 * port nasce mínimo, e quem o crescer entrega o Prisma na mesma unidade.
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
   * As duas metades da frase acima **não têm o mesmo peso de evidência**, e a
   * diferença fica escrita aqui de propósito — `docs/CONVENCOES-CODIGO.md`
   * §7.1: afirmação sobre o comportamento do banco escrita em comentário e não
   * medida é suposição com cara de fato, e das cinco que a auditoria da Tarefa
   * 24 conferiu, **duas caíram — as duas dizendo "medido"**.
   *
   * - ✅ **`deleteMany` é idempotente: MEDIDO, e com precedente no projeto.**
   *   `PrismaReadingPlanItemRepository.replaceForBook` já depende disso
   *   (`repositories/prisma-reading-plan-item-repository.ts`, docblock do
   *   método), e tem teste de contrato contra o Postgres.
   * - ⚠️ **`delete({ where: { id } })` levantar `P2025`: NÃO MEDIDO contra o
   *   banco deste projeto.** É o comportamento documentado do Prisma, e é a
   *   razão pela qual a recomendação acima é `deleteMany` — mas não há
   *   precedente aqui nem medição colada, e a Tarefa 30 não roda integração
   *   (ela não toca repositório). **Quem confirma é o teste de contrato da
   *   Tarefa 32**, e é lá que esta linha vira fato ou cai.
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
