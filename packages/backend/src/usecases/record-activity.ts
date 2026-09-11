import { randomUUID } from 'node:crypto';

import type { ActivityType } from '@clube/shared';

import type { ActivityEvent } from '../domain/activity-event';
import { assertActivityType } from '../domain/activity-event';
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
 * - **Não manda push.** O ADR 0006 diz que o `GROUP_ACTIVITY` *"sai no mesmo
 *   UseCase que grava o `ActivityEvent`"* — ou seja, **este** UseCase é a casa
 *   dele. Mas o envio só nasce com o port de push, na Tarefa 38: aqui fica o
 *   lugar, não o efeito. O debounce de 60 s (`docs/NOTIFICACOES.md` §6; o ADR
 *   0006 diz só "debounce curto") é do **envio**, não do registro — registrar é
 *   barato e o feed quer o histórico.
 * - **Não denormaliza nada.** Nem título do dia, nem nome do livro: o título
 *   muda, e um evento com título velho é uma tela que mente. O feed resolve na
 *   leitura (Tarefa 34).
 */
export class RecordActivity {
  constructor(private readonly events: ActivityEventRepository) {}

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
    console.error({
      event: 'activity_event_not_recorded',
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
}
