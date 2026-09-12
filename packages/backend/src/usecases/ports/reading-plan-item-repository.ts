import type { CalendarDay } from '@clube/shared';

import type { ReadingPlanItem } from '../../domain/book';

/**
 * "O trecho de hoje, nestes livros" — o recorte que o dispatcher da Tarefa 37
 * pede, e o único `find` deste port.
 *
 * ⚠️ **`bookIds` e NÃO `userId`, e é a decisão de camada desta fatia.**
 *
 * A pergunta do lembrete é *"o que ESTA pessoa tem para ler hoje?"*, e a
 * resposta depende de clube, de membresia ativa e de livro ativo. Nada disso é
 * conhecimento de plano de leitura: quem resolve "quais clubes são meus" é o
 * `MembershipRepository`, e quem resolve "qual é o livro do clube" é o
 * `BookRepository` — os dois já existem, os dois já são o corte de tenant do
 * projeto inteiro. Pôr a junção aqui criaria uma **segunda** regra de tenant
 * para manter em dia com aquela, que é exatamente o que o `ReadingLogFilter`
 * recusou na Tarefa 32 ("duas regras de tenant é como uma delas fica para
 * trás") — e, de quebra, obrigaria o **fake** a emular `Membership`, `Club` e
 * `Book`, três semânticas que ele não tem como reproduzir sem divergir (§7.1).
 *
 * Então o dispatcher chega aqui com os livros **já cortados por tenant**, e
 * este port responde a única pergunta que é dele: qual item do plano cai neste
 * dia.
 *
 * ⚠️ **`date` é `CalendarDay` — a string `"YYYY-MM-DD"` —, e a comparação é
 * IGUALDADE, nunca faixa** (decisão A da Tarefa 37). `localDay(instant,
 * timeZone)` devolve exatamente esta forma, então "o dia de hoje desta pessoa"
 * casa o item do plano por igualdade. Não existe `from`/`to` aqui, e não pode
 * existir: um range de instantes só faria falta para consultar coluna de
 * **instante** por dia, e esta coluna é `@db.Date`.
 */
export interface ReadingPlanItemFilter {
  /**
   * Os livros em que procurar — **já cortados por tenant** pelo chamador.
   *
   * Lista vazia devolve lista vazia **sem ida ao banco**: sem isso seria um
   * `IN ()`, uma consulta garantidamente vazia em toda passada do cron de quem
   * não tem livro ativo — que é o estado normal do clube entre dois livros.
   */
  bookIds: readonly string[];
  /** O dia de calendário, no fuso de quem vai receber o lembrete. */
  date: CalendarDay;
}

/** O diff de um plano, como o `replacePlanItems` o calcula. */
export interface PlanChange {
  /** O plano NOVO inteiro, em ordem. Upsert por `id`. */
  upsert: readonly ReadingPlanItem[];
  /** Os itens cuja data desapareceu. **Idempotente**: id inexistente não é erro. */
  removeIds: readonly string[];
}

export interface ReadingPlanItemRepository {
  // `saveMany` e não `save`: o plano nasce como unidade de ~30 linhas. Um save
  // por item seriam 30 idas ao banco e abriria a porta a escrita parcial.
  //
  // É UPSERT POR `id`, e é isso que faz o diff do `replacePlanItems`
  // funcionar sem um `update` separado: o item cuja data sobrevive volta com o
  // mesmo id, então a `Note` que aponta para ele continua apontando.
  saveMany(items: ReadingPlanItem[]): Promise<ReadingPlanItem[]>;
  /**
   * O item do plano por id. **Não confere clube**: quem faz o corte é o
   * `bookForActor`, que carrega o livro do item e tira o clube de
   * `book.clubId`. Duplicar o corte aqui criaria uma segunda regra de tenant
   * para manter em sincronia com aquela.
   */
  byId(id: string): Promise<ReadingPlanItem | null>;
  /** O plano do livro, ordenado por `order` crescente. */
  findByBook(bookId: string): Promise<ReadingPlanItem[]>;
  /**
   * "O trecho de hoje, nestes livros" — a leitura do
   * `dispatchDueNotifications` (Tarefa 37).
   *
   * **Um método, e não `findByBook` filtrado em memória**: o `findByBook`
   * traria o plano inteiro (~30 dias) de cada livro para descartar 29 — o §7.3
   * na letra (*"em vez de carregar tudo e filtrar em memória — o mesmo bug com
   * uma fatura de banco maior"*) — e faria uma ida ao banco **por livro**, numa
   * consulta que roda a cada 5 minutos para sempre.
   *
   * **Não promete ordem**, como todos os `find` do projeto menos o do feed: o
   * chamador ordena pelo que ele precisa (e o `dispatchDueNotifications`
   * precisa de uma ordem determinística para escolher **qual** trecho nomear
   * quando alguém tem dois clubes lendo no mesmo dia). O fake enumera
   * INVERTIDO de propósito, para ninguém depender da ordem sem perceber (§7.2).
   *
   * **Sem teto de linhas**: o conjunto é "os livros ativos de uma pessoa, num
   * dia só" — no máximo um item por livro, porque `@@unique([bookId, date])`.
   * Um `take` aqui não teria o que segurar, e cortaria um lembrete legítimo.
   */
  find(filter: ReadingPlanItemFilter): Promise<ReadingPlanItem[]>;
  /**
   * Aplica o diff do plano de um livro numa só operação **atômica**.
   *
   * Por que um método só, e não `deleteMany` + `saveMany` (que é o que este
   * port tinha até a Tarefa 07): em memória as duas chamadas eram atômicas de
   * graça, mas contra o Postgres um crash entre elas deixa o plano
   * **truncado** — e é esta tabela que ancora as anotações das pessoas.
   * `CLAUDE.md` proíbe o UseCase importar Prisma, então o UseCase não pode
   * abrir transação; e um "port de unit-of-work" genérico vazaria o conceito
   * de transação para dentro do domínio. A saída é esta: o port declara a
   * OPERAÇÃO, e a implementação Prisma a envolve num `$transaction`.
   *
   * Remove antes de inserir. Não é mais obrigatório pelos índices (ADR 0007
   * tirou o único de `order`, e uma data do rascunho nunca é uma data
   * removida), mas mantém a menor contagem de linhas no pico e faz a guarda do
   * Bloco C ("não remover item que já tem nota") falhar antes de escrever.
   *
   * `bookId` não é decoração: a remoção é escopada a ele, então um id de outro
   * livro no `removeIds` não apaga nada.
   *
   * Devolve os itens do `upsert` como ficaram gravados, na ordem em que
   * vieram.
   */
  replaceForBook(
    bookId: string,
    change: PlanChange,
  ): Promise<ReadingPlanItem[]>;
}
