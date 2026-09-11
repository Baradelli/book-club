import { ACTIVITY_FEED_DEFAULT_LIMIT } from '@clube/shared';

import type { ActivityEvent } from '../../domain/activity-event';

/**
 * O recorte do feed, e ele é do **CLUBE** para baixo — um campo de tenant e um
 * de tamanho, e nada mais.
 *
 * ⚠️ **Sem `bookId`, sem `userId` e sem `type`** (escopo da Tarefa 34): o feed
 * é "o que aconteceu por aqui", não uma listagem de acervo — e o acervo já
 * filtra por pessoa e por tipo, na tela dele. Um filtro sem tela que o peça é a
 * especulação que o `docs/WORKFLOW.md` proíbe, e cada um deles pediria também
 * um índice (decisão G).
 *
 * ⚠️ **E sem cursor.** Paginação por cursor é contrato novo, e o feed é "o que
 * aconteceu recentemente". Se um dia houver "ver mais", ele nasce com a tela
 * que o pedir.
 */
export interface ActivityEventFilter {
  /** O corte de tenant, e ele é o único obrigatório. */
  clubId: string;
  /**
   * Quantos eventos no máximo, do mais recente para trás. **Ausente = o
   * `ACTIVITY_FEED_DEFAULT_LIMIT` de `@clube/shared`.** → o docblock do `find`.
   *
   * `number` de TypeScript, então negativo, zero e fração são representáveis —
   * e quem os normaliza é o `activityFeedTake` abaixo, nas DUAS implementações.
   */
  limit?: number;
}

/**
 * ⚠️ **Quantas linhas o `find` pede, a partir do `limit` do filtro — e é a
 * única função deste arquivo, de propósito.**
 *
 * Ela existe porque **o `take` do Prisma é COM SINAL**, e isso é medido contra
 * este Postgres, não suposto (`states the precondition: a negative take asks
 * Prisma for the OPPOSITE end`, no teste de contrato): `take: -1` devolve o
 * registro **mais antigo** — a ponta oposta do feed — e `take: 0` devolve
 * nada. Nenhum dos dois lança. É a família do §7.1 que esconde melhor:
 * "vazio × resultado ERRADO", sem nem o consolo de uma exceção.
 *
 * O `min(1)` do `listActivityQuerySchema` já barra isso na BORDA, e continua
 * valendo — mas a borda **não é o único caminho previsto**: o ADR 0006 e o
 * docblock do `recordActivity` nomeiam o push `GROUP_ACTIVITY` da **Tarefa
 * 38** como o segundo leitor do feed, e ele não passa por Zod nenhum. Um
 * `limit` calculado que desse zero entregaria "não aconteceu nada" a quem
 * pergunta se aconteceu.
 *
 * **Uma função, e não duas cópias de `Math.max`**: o §7.1 chama isto de
 * "extrair, não cobrir duas vezes" — a regra é do *contrato*, e as duas
 * implementações do port (Prisma e fake) a compartilham, senão o fake diverge.
 * E a divergência seria de forma diferente em cada lado, que é o pior caso:
 * no Prisma `-1` traz o mais antigo; num `slice(0, -1)` de array, o último
 * elemento some.
 *
 * Mora no **port** porque é o port que promete "ausente = o padrão" e
 * "`createdAt` desc": o tamanho do corte é parte do contrato, não detalhe de
 * persistência.
 */
export function activityFeedTake(limit?: number): number {
  if (limit === undefined) return ACTIVITY_FEED_DEFAULT_LIMIT;
  // `Math.trunc` antes do `max`: o `take` do Prisma quer inteiro, e o `page`
  // do grifo já mostrou que fração chega ao SQL truncada em silêncio (§7.1,
  // 6ª aparição). Aqui a truncagem é explícita e tem teste nos dois lados.
  return Math.max(1, Math.trunc(limit));
}

/**
 * O port do registro de atividade: `save` e `find`.
 *
 * Nasceu com **um método só** na Tarefa 33 e ganhou o `find` na **34**, junto
 * da implementação Prisma, na **mesma unidade** — que é o que o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige de quem cresce um port: crescer sem
 * implementar no Prisma dá vermelho de compilação em arquivos de rota que não
 * têm nada a ver com a fatia, e um vermelho desses esconde o vermelho de teste
 * que a unidade deveria mostrar.
 *
 * **Sem `update`, sem `delete` e sem `NotePatch` equivalente**: o
 * `ActivityEvent` é log imutável (`CLAUDE.md`) — nada o reescreve e nada o
 * arquiva. E, ao contrário do `ReadingLog`, **nem apagar existe**: desmarcar
 * "li" apaga o log, mas o evento "a Maria leu" já aconteceu, e o feed conta o
 * que aconteceu (decisão B da Tarefa 33). Se um dia isso mudar, é decisão de
 * produto com nome próprio, não um método a mais.
 */
export interface ActivityEventRepository {
  /**
   * Upsert por `id` — a mesma convenção dos outros repos (Tarefa 03).
   *
   * Devolve o evento gravado, e o chamador da Tarefa 33 **descarta** o retorno:
   * quem grava o evento é um efeito colateral do UseCase de escrita, e nada do
   * que a pessoa escreveu depende dele.
   */
  save(event: ActivityEvent): Promise<ActivityEvent>;
  /**
   * "O que aconteceu neste clube" — a leitura do `listActivity` (Tarefa 34) e,
   * através dele, do feed da home (Tarefa 35).
   *
   * ⚠️ **ELE PROMETE ORDEM, e é o único `find` do projeto que promete** (decisão
   * C): `createdAt` **DESC**, com desempate por `id` **ASC**. Todos os outros
   * declaram não prometer ordem, e o fake enumera invertido justamente para
   * ninguém depender dela (§7.2). Aqui a ordem **é o produto** — feed é
   * cronologia invertida por definição —, então ela é contrato, tem teste
   * contra o banco e tem fixture hostil.
   *
   * O desempate por `id` não é decoração: `createdAt desc` sozinho não é ordem
   * total, e empate no mesmo milissegundo é o caso normal de um clube (duas
   * pessoas escrevendo ao mesmo tempo, o retry da fila offline). Sem ele, quem
   * cai dentro do corte na fronteira é escolhido pelo plano de execução, e duas
   * chamadas iguais trariam eventos diferentes.
   *
   * ⚠️ **O `limit` é PARÂMETRO EXPLÍCITO, e ausente significa
   * `ACTIVITY_FEED_DEFAULT_LIMIT`** — não um `FIND_ROW_LIMIT` escondido como o
   * do `NoteRepository` e o do `HighlightRepository` (decisão D da Tarefa 34).
   *
   * O `docs/BACKLOG.md` previa que "o terceiro `find` (`ReadingLog`/
   * `ActivityEvent`) extrairia a constante". **A previsão errou as duas
   * vezes**: o `ReadingLog` recusou a válvula com número (o conjunto é limitado
   * por dias × membros), e aqui a tabela de fato cresce para sempre — mas quem
   * sabe quantos itens quer é a **tela**. A diferença não é de valor, é de quem
   * manda: uma válvula escondida serviria a uma tela que mostra 20 e mentiria
   * para uma que mostrasse 1000, sem nada na resposta anunciando o corte.
   *
   * O padrão tem **um dono**, e é a implementação do `find` (aqui, e no fake
   * espelhando): a borda não declara `.default()`, senão a rota mandaria sempre
   * um número e este padrão nunca rodaria — dois donos da mesma regra, e o que
   * fica para trás é o que ninguém exercita.
   *
   * **Sem `status` a ignorar**: o evento é imutável e não se arquiva, então não
   * existe a divergência "arquivada × ativa" que o `find` da nota tem.
   */
  find(filter: ActivityEventFilter): Promise<ActivityEvent[]>;
}
