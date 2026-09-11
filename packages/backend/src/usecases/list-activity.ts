import type { ActivityEvent } from '../domain/activity-event';
import type { AssertMembership } from './assert-membership';
import type { ActivityEventRepository } from './ports/activity-event-repository';

export interface ListActivityInput {
  actorUserId: string;
  /** OBRIGATÓRIO: é a âncora de tenant, como no `listNotes` e no `listBooks`. */
  clubId: string;
  /**
   * Quantos eventos a TELA quer. Ausente = o padrão documentado do port
   * (`ACTIVITY_FEED_DEFAULT_LIMIT`), aplicado pelo repositório — nunca aqui.
   */
  limit?: number;
}

export type ListActivityOutput = ActivityEvent[];

/**
 * "O que aconteceu por aqui" — o feed do clube.
 *
 * É o primeiro leitor do `ActivityEvent`, que a Tarefa 33 só escrevia. A tela
 * do feed é a **Tarefa 35** e o push `GROUP_ACTIVITY` é a **38**; os dois leem
 * daqui.
 *
 * **Não exige papel**, e isso é ADR 0002: dentro do clube não existe conteúdo
 * privado, e o evento **não cria visibilidade nova** — ele aponta para o que
 * todo membro ativo já podia ver (a nota, o grifo, o "li"). Quem corta é o
 * `assertMembership`: clube em que o ator não é membro ativo é 404, exista ele
 * ou não.
 *
 * ## O que ele NÃO faz, e cada ausência é decisão
 *
 * - **Não resolve nome de pessoa, título do dia nem nome do livro.** O evento
 *   guarda REFERÊNCIA, nunca conteúdo (decisão G da Tarefa 33), e a tela já
 *   sabe resolver nome pelo `GET /clubs/:clubId/members` (usa isso desde a
 *   26a) e já tem o livro. Fazer o backend juntar tudo seria um segundo
 *   `getBookWithPlan` com outra forma — e um evento com título velho é uma tela
 *   que mente, porque o `editBook` ressincroniza os títulos do plano.
 * - **Não ordena.** É a diferença deliberada em relação ao `listNotes`: lá o
 *   port declara não prometer ordem, então o UseCase é o dono dela; aqui o port
 *   **promete** `createdAt desc` com desempate por `id` (decisão C), porque num
 *   feed a ordem É o produto. Um `sort` aqui seria um segundo dono da mesma
 *   regra.
 * - **Não tem padrão de `limit` próprio.** Chave ausente não viaja no filtro, e
 *   quem aplica o `ACTIVITY_FEED_DEFAULT_LIMIT` é o repositório — pelo mesmo
 *   motivo de cima: uma regra, um dono.
 * - **Não conta nada.** Sem total, sem "e mais N" (decisão F): `COUNTER_SHAPE`
 *   proíbe, e progresso é presença.
 */
export class ListActivity {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly events: ActivityEventRepository,
  ) {}

  async execute(input: ListActivityInput): Promise<ListActivityOutput> {
    // ANTES da consulta, sempre: um ator de fora não pode gerar nem uma
    // leitura — senão a rota vira oráculo de existência (e conta de banco) para
    // quem não é do clube. A prova é o contador `findCalls === 0` (§7.3), não
    // o erro, que sai igual nas duas ordens.
    await this.assertMembership.execute({
      userId: input.actorUserId,
      clubId: input.clubId,
    });

    return await this.events.find({
      // Primeiro e não-negociável: o corte de tenant. Não há outro filtro —
      // o feed não é listagem de acervo (ver o `ActivityEventFilter`).
      clubId: input.clubId,
      // A chave só viaja quando a tela pediu: assim o padrão do port é o que
      // roda, e ele tem um dono só.
      ...(input.limit === undefined ? {} : { limit: input.limit }),
    });
  }
}
