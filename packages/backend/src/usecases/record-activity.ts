import { randomUUID } from 'node:crypto';

import type { ActivityType } from '@clube/shared';

import type { ActivityEvent } from '../domain/activity-event';
import { assertActivityType } from '../domain/activity-event';
import type { NotifyGroupActivity } from './notify-group-activity';
import type { ActivityEventRepository } from './ports/activity-event-repository';

export interface RecordActivityInput {
  clubId: string;
  /**
   * Quem fez — e o nome é `actorUserId`, como em todos os inputs do projeto,
   * porque ele vem do JWT do request que disparou o gatilho, nunca do corpo
   * (§6.3 e §7.5). Os quatro chamadores repassam o `input.actorUserId` deles.
   */
  actorUserId: string;
  type: ActivityType;
  bookId: string;
  /** `null` na avulsa e no grifo: eles não têm dia de leitura (regra 14). */
  planItemId: string | null;
  /** O id da nota / do grifo / do log que acabou de nascer (regra 15). */
  subjectId: string;
}

/**
 * "Ficou registrado que a Maria escreveu sobre o Cap. 3."
 *
 * É o UseCase que os **quatro** UseCases de nascimento chamam depois de
 * gravarem o que a pessoa escreveu: `upsertPlanNote` · `createFreeNote` ·
 * `createHighlight` · `markRead`.
 *
 * ## Por que é um UseCase injetado em UseCase, e não um port chamado direto
 *
 * O precedente é o `AssertMembership` — uma classe com `execute`, recebida no
 * construtor de quem precisa dela. A alternativa (cada um montar o evento e
 * chamar o repositório) copiaria **quatro vezes** a construção do evento: o
 * `randomUUID()`, o `createdAt`, o portão do tipo e a lista de campos. É a
 * lição nº 3 do MVP 1, e é o que o §7.1 chama de *"extrair, não cobrir duas
 * vezes"* — a saída da 4ª aparição, que nomeia o `ActivityEvent` como o
 * próximo lugar a aplicá-la.
 *
 * ## O que ele NÃO faz, e cada ausência é decisão
 *
 * - **Não corta tenant.** Quando ele é chamado, o corte já aconteceu: os
 *   quatro chamadores passaram pelo `bookForActor`, e o `clubId` que chega aqui
 *   é o do livro, não o do input de ninguém. Um segundo guard aqui seria uma
 *   segunda regra de tenant para manter em dia com aquela — e duas regras de
 *   tenant é como uma delas fica para trás (o mesmo argumento do
 *   `ReadingLogFilter` sem `clubId`).
 * - **Não decide SE registra.** Quem decide é o chamador, e a decisão A é
 *   dele: o `upsertPlanNote` e o `markRead` só chamam no nascimento
 *   (`created === true`), senão o autosave da tela do dia — que dispara a cada
 *   1500 ms — afogaria o feed com dezenas de eventos por meia hora de escrita.
 * - **Não manda push, nem na Tarefa 38.** O ADR 0006 diz que o
 *   `GROUP_ACTIVITY` *"sai no mesmo UseCase que grava o `ActivityEvent`"* — e
 *   ele sai: pelo `recordActivitySafely` lá embaixo, que é a outra metade deste
 *   arquivo. O `execute` continua **gravando um evento e só** (decisão B da
 *   38): enfiar aqui os repositórios do leque faria o UseCase de gravar
 *   depender de metade do sistema, e o teste de "gravou o evento" passaria a
 *   montar um mundo. O `groupActivityNotifier` abaixo é **carregado**, nunca
 *   chamado daqui.
 * - **Não faz debounce.** O de 60 s que o `docs/NOTIFICACOES.md` §6 esboça não
 *   existe, e é a decisão D da Tarefa 38: quem agrupa é o `tag` do payload, no
 *   aparelho, de graça e sem estado no servidor. Registrar, de todo jeito, é
 *   barato — e o feed quer o histórico inteiro.
 * - **Não denormaliza nada.** Nem título do dia, nem nome do livro: o título
 *   muda, e um evento com título velho é uma tela que mente. O feed resolve na
 *   leitura (Tarefa 34).
 */
export class RecordActivity {
  constructor(
    private readonly events: ActivityEventRepository,
    /**
     * ⚠️ **O LEQUE DO `GROUP_ACTIVITY`, CARREGADO E NUNCA CHAMADO DAQUI** —
     * decisões A e B da Tarefa 38, e a forma é consequência das duas juntas.
     *
     * A decisão A manda o disparo entrar **dentro do `recordActivitySafely`**
     * (que é o dono único do `try/catch + log` dos quatro chamadores) e proíbe
     * que os quatro UseCases de escrita mudem uma linha. Os quatro passam
     * `this.recordActivity` e mais nada — então é por **este objeto** que a
     * função alcança o notificador. Um terceiro parâmetro em
     * `recordActivitySafely` seria a alternativa óbvia, e ela obrigaria os
     * quatro a passá-lo: exatamente o que a decisão A recusa.
     *
     * ⚠️ **`null` é o padrão, e é o que mantém os testes dos quatro UseCases
     * montando `new RecordActivity(events)`** — um clube sem push configurado,
     * ou um teste que não é sobre push, não monta mundo nenhum.
     */
    readonly groupActivityNotifier: NotifyGroupActivity | null = null,
  ) {}

  async execute(input: RecordActivityInput): Promise<ActivityEvent> {
    // O portão do tipo vem ANTES da escrita: um tipo fora da lista não deixa
    // meia linha gravada. O `z.enum` da borda (Tarefa 34) é a primeira
    // barreira, não a única — e a checagem de propriedade em excesso do
    // TypeScript só vale para literal fresco (§7.1.1), então um tipo vindo por
    // variável chega aqui sem o compilador ter dito nada.
    const type = assertActivityType(input.type);

    return this.events.save({
      // `randomUUID()` no UseCase: um id vindo de fora deixaria dois gatilhos
      // sobrescreverem o evento um do outro pelo upsert do `save`.
      id: randomUUID(),
      clubId: input.clubId,
      // O ATOR, sempre. Nenhum chamador tem como mandar outro: os quatro
      // inputs deles não declaram `userId` (§6.3).
      userId: input.actorUserId,
      type,
      bookId: input.bookId,
      planItemId: input.planItemId,
      subjectId: input.subjectId,
      // UMA leitura de relógio, e ela é a única do caminho. "Um relógio só" se
      // prova CONTANDO leituras, nunca comparando instantes: duas chamadas a
      // `new Date()` no mesmo tick devolvem o mesmo milissegundo, e na Tarefa
      // 22 esse mutante passou em 1206/1206 (§7.8). Quem conta é o
      // `test-support/advancing-clock.ts`, no teste da regra 6.
      createdAt: new Date(),
    });
  }
}

/**
 * ⚠️ **O gatilho que NÃO derruba a escrita da pessoa** — a decisão C da Tarefa
 * 33, num lugar só.
 *
 * O que a pessoa escreveu é o produto; o feed é o acessório. Se o registro
 * falhar, a nota tem de estar salva e a resposta tem de ser 201/200 — a pessoa
 * não pode perder um parágrafo porque uma segunda tabela estava indisponível.
 *
 * **Mas engolir em silêncio também é errado**, então a captura vem com `log`
 * estruturado: sem ele, o feed pararia de nascer e ninguém saberia por quê.
 *
 * ## Por que uma função, e não quatro `try/catch`
 *
 * Porque a regra é **uma**, e quatro cópias dela são quatro lugares de onde uma
 * fica para trás — o §7.1 de novo (*"extrair, não cobrir duas vezes"*). E
 * porque o `catch` é o tipo de código que ninguém relê: a diferença entre
 * `catch { }` e `catch { log }` não muda um único teste dos quatro UseCases, e
 * é exatamente por isso que ela tem teste **aqui**.
 *
 * ## Por que o `console.error`, e não um logger injetado
 *
 * Um `Logger` port com fake seria a forma do projeto, e é onde isto deve
 * chegar. Hoje ele teria **um** chamador e nenhum outro na fila, o que é a
 * especulação que o `docs/WORKFLOW.md` proíbe — e o `console.error` já é o que
 * o `http/main.ts` usa. O que a fatia compra é a propriedade ("não engole em
 * silêncio") com acusador; a forma do canal é trocável sem mexer em nenhum dos
 * quatro chamadores, porque ela está aqui dentro.
 *
 * **O log não leva conteúdo** — nem trecho, nem título: só **quem** (`userId`),
 * de qual clube e de qual livro, e sobre qual id. É o mesmo desenho do push, e
 * pelo mesmo motivo: *"o push nunca leva o conteúdo"* mora em
 * `docs/NOTIFICACOES.md` **§1** — e não no ADR 0006, que decide só de onde o
 * `GROUP_ACTIVITY` sai.
 */
export async function recordActivitySafely(
  recordActivity: RecordActivity,
  input: RecordActivityInput,
): Promise<void> {
  try {
    await recordActivity.execute(input);
  } catch (error) {
    logWithoutContent('activity_event_not_recorded', input, error);
    // ⚠️ **Sem evento, sem aviso** (Tarefa 38): avisar o clube de uma anotação
    // que não ficou registrada mandaria todo mundo abrir um livro à toa. A
    // ordem — grava, depois avisa — é a mesma decisão I da Tarefa 33 um passo
    // adiante, e a prova dela é o `sendCalls === 0` daqui.
    return;
  }

  /*
    ⚠️ **O LEQUE DO `GROUP_ACTIVITY` — A DECISÃO A DA TAREFA 38, e ela é sobre
    ONDE, não sobre o quê.**

    `docs/NOTIFICACOES.md` §6, último parágrafo: o `GROUP_ACTIVITY` **não passa
    pelo dispatcher** — é disparado no mesmo caminho que grava o
    `ActivityEvent`. E "o mesmo caminho" é **este**, e não o `execute` acima:
    aqui ele herda a rede que já existe (o `try/catch + log` que os quatro
    chamadores compartilham), em vez de nascerem quatro `catch` novos dos quais
    alguém esqueceria um.

    ⚠️ **O SEGUNDO `try`, e por que ele não é uma cópia do primeiro.** É a
    mesma regra ("a escrita da pessoa é o produto; o resto é acessório") com
    **outro nome de evento**, e o nome é o ponto: reusar o
    `activity_event_not_recorded` faria o log mentir — o evento FOI gravado, e
    quem diagnosticasse procuraria o defeito na tabela errada.
  */
  const notifier = recordActivity.groupActivityNotifier;
  if (notifier === null) return;

  try {
    await notifier.execute({
      // Enumerado, nunca espalhado: o `input` tem `planItemId` e `subjectId`,
      // que o leque não usa — e um spread os levaria para dentro do payload no
      // dia em que alguém mudasse a forma do outro lado.
      clubId: input.clubId,
      actorUserId: input.actorUserId,
      type: input.type,
      bookId: input.bookId,
    });
  } catch (error) {
    logWithoutContent('group_activity_not_notified', input, error);
  }
}

/**
 * O log estruturado das duas falhas — **um formato só**, com o nome do evento
 * como única diferença.
 *
 * ⚠️ **E ele NÃO leva conteúdo** — nem trecho, nem título, nem nome: só
 * **quem** (`userId`), de qual clube, de qual livro, e sobre qual id. É o mesmo
 * desenho do push, e pelo mesmo motivo: *"o push nunca leva o conteúdo"* mora
 * em `docs/NOTIFICACOES.md` **§1**, e um log de servidor é mais um destino para
 * o texto do clube. Quem guarda a propriedade é a asserção por **lista fechada
 * de chaves** em `record-activity.test.ts` — um `toMatchObject` ficaria verde
 * com um campo a mais.
 */
function logWithoutContent(
  event: 'activity_event_not_recorded' | 'group_activity_not_notified',
  input: RecordActivityInput,
  error: unknown,
): void {
  console.error({
    event,
    type: input.type,
    clubId: input.clubId,
    // QUEM — sem ele o log diz que "um evento se perdeu" e não de quem era,
    // que é a primeira pergunta de quem for diagnosticar. É um id, não
    // conteúdo: nenhum trecho, nenhum título, nenhum nome.
    userId: input.actorUserId,
    bookId: input.bookId,
    subjectId: input.subjectId,
    error: error instanceof Error ? error.message : String(error),
  });
}
