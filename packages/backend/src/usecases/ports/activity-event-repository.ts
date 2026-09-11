import type { ActivityEvent } from '../../domain/activity-event';

/**
 * O port do registro de atividade, e ele nasce com **um método só**: `save`.
 *
 * ⚠️ **Nada lê eventos nesta fatia, e é por isso que não há `find`.** Quem lê é
 * o `listActivity` da **Tarefa 34**, e é lá que o `find` entra **junto da
 * implementação Prisma, na mesma unidade** — que é o que o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige de quem cresce um port: crescer sem
 * implementar no Prisma dá vermelho de compilação em arquivos de rota que não
 * têm nada a ver com a fatia, e um vermelho desses esconde o vermelho de teste
 * que a unidade deveria mostrar. Declarar aqui um `find` sem chamador seria a
 * especulação que o `docs/WORKFLOW.md` proíbe.
 *
 * **Sem `update`, sem `delete` e sem `NotePatch` equivalente**: o
 * `ActivityEvent` é log imutável (`CLAUDE.md`) — nada o reescreve e nada o
 * arquiva. E, ao contrário do `ReadingLog`, **nem apagar existe**: desmarcar
 * "li" apaga o log, mas o evento "a Maria leu" já aconteceu, e o feed conta o
 * que aconteceu (decisão B da Tarefa 33). Se um dia isso mudar, é decisão de
 * produto com nome próprio, não um método a mais.
 *
 * `save` devolve o evento gravado pela convenção dos outros repositórios
 * (Tarefa 03) — e o chamador desta fatia **descarta** o retorno: quem grava o
 * evento é um efeito colateral do UseCase de escrita, e nada do que a pessoa
 * escreveu depende dele.
 */
export interface ActivityEventRepository {
  /** Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03). */
  save(event: ActivityEvent): Promise<ActivityEvent>;
}
