import type {
  PushSubscription,
  PushSubscriptionPatch,
} from '../../domain/push-subscription';
import type { PushSubscriptionRepository } from '../ports/push-subscription-repository';

/**
 * O fake da inscrição de push.
 *
 * ⚠️ **A pergunta do §7.1, nas duas direções: "o Postgres faria isto?"** — e são
 * três fidelidades que importam aqui, cada uma com teste na suíte deste fake:
 *
 * 1. **O upsert é por `endpoint`, não por `id`** (decisão E). A tabela tem
 *    `@@unique([endpoint])`, então um `save` com id NOVO e endpoint existente
 *    **atualiza a linha** — e o id que fica é o da linha antiga. Um fake que
 *    guardasse por `id` aceitaria dois registros do mesmo endpoint, que é o que
 *    o banco recusa: a direção permissiva do §7.1.
 * 2. **`byUserId` devolve só as ATIVAS** (`disabledAt IS NULL`), porque o filtro
 *    é do repositório (`NOTIFICACOES.md` §5) — e um fake que devolvesse todas
 *    faria todo teste de envio da Tarefa 38 afirmar uma regra que o banco não
 *    tem.
 * 3. **O `update` copia CAMPO A CAMPO**, exatamente como o `toUpdateData` do
 *    Prisma, e é o §7.1.1 na letra. Espalhar o patch (`{ ...row, ...patch }`)
 *    faria o fake honrar chaves que o Prisma filtra — foi o bug do `NotePatch`,
 *    onde `update(id, { userId: 'x' })` **trocava a autoria no fake** e era
 *    **no-op silencioso no Postgres**. O compilador recusa o literal; este
 *    laço recusa o resto (a variável solta atravessa a checagem de propriedade
 *    em excesso).
 *
 * ⚠️ **A enumeração do `byUserId` é INVERTIDA de propósito** (§7.2): o port
 * **não promete ordem**, a ordem que o Postgres devolve sem `ORDER BY` é
 * indefinida de verdade, e "invertida" é a única que **falha** quando alguém
 * confia na ordem do repositório.
 *
 * ## ⚠️ A fidelidade que este fake NÃO honra — registrada, não consertada
 *
 * **(a) A divergência.** O store é indexado **só pelo `endpoint`**, então o `id`
 * não tem dono: `save({ id: 'X', endpoint: 'a' })` seguido de
 * `save({ id: 'X', endpoint: 'b' })` guarda **duas linhas com o mesmo `id`**.
 * No Postgres a segunda bateria na **chave primária** (`P2002` em `id`). É a
 * direção **permissiva** do §7.1 — o fake aceita o que o banco recusa.
 *
 * **(b) Por que é INALCANÇÁVEL hoje.** Há **um** chamador do `save`, e ele não
 * escolhe o `id` por fora: o `SavePushSubscription` usa
 * `id: existing?.id ?? randomUUID()` (`usecases/save-push-subscription.ts:87`).
 * Ou o id é o da linha que já existe **naquele endpoint** — e aí o `save`
 * sobrescreve aquela mesma chave do `Map` —, ou é um uuid sorteado na hora, que
 * por construção não colide com nenhum id guardado. Nenhuma sequência de
 * chamadas que passe por esse UseCase produz dois endpoints com o mesmo `id`.
 *
 * **(c) O que a tornaria alcançável:** um **segundo chamador** que escolha o
 * `id` por fora (um seed, uma importação, uma migração de aparelho que
 * reaproveite o id de uma inscrição antiga para um endpoint novo). No dia em que
 * ele existir, o fake ficaria **verde** com um estado que o banco recusa — e
 * quem escrever esse chamador tem de indexar o store por `id` também, ou recusar
 * o `id` repetido aqui.
 *
 * **Registro e não teste, de propósito:** comportamento inalcançável não ganha
 * rede, ganha registro — é o mesmo tratamento que a Tarefa 34b deu aos testes do
 * `planItemId` nulo, e o mesmo do corolário do §7.1.1 (a regra 9 do contrato da
 * nota, que ficou sem teste de runtime quando o `id` saiu do patch). Um teste
 * escrito aqui provaria uma regra que nenhum chamador consegue violar, e o
 * próximo leitor gastaria o tempo dele procurando quem a viola.
 */
export class PushSubscriptionRepositoryFake implements PushSubscriptionRepository {
  /** Indexado pelo `endpoint`, que é a chave única da tabela — não pelo `id`. */
  private store = new Map<string, PushSubscription>();

  /** Contadores, nunca cronômetro (§7.3). O contador conta a CHAMADA. */
  saveCalls = 0;
  byEndpointAndUserCalls = 0;
  byUserIdCalls = 0;
  updateCalls = 0;

  async save(subscription: PushSubscription): Promise<PushSubscription> {
    this.saveCalls += 1;
    const existing = this.store.get(subscription.endpoint);
    // O `id` da linha que já existe MANDA: só o CREATE do upsert leva o id que
    // chegou, exatamente como o Prisma. Sem isto, o fake trocaria a chave
    // primária numa reativação e o Postgres não.
    const stored: PushSubscription = {
      ...subscription,
      id: existing?.id ?? subscription.id,
    };
    this.store.set(stored.endpoint, this.clone(stored));
    return this.clone(stored);
  }

  async byEndpointAndUser(
    endpoint: string,
    userId: string,
  ): Promise<PushSubscription | null> {
    this.byEndpointAndUserCalls += 1;
    const found = this.store.get(endpoint);
    // O PAR: o endpoint acha a linha, e o dono é o filtro. Sem `disabledAt` na
    // conta — "desligada" não é "inexistente" (ver o port).
    if (!found || found.userId !== userId) return null;
    return this.clone(found);
  }

  async byUserId(userId: string): Promise<PushSubscription[]> {
    this.byUserIdCalls += 1;
    return [...this.store.values()]
      .filter((row) => row.userId === userId && row.disabledAt === null)
      .map((row) => this.clone(row))
      .reverse();
  }

  async update(
    id: string,
    patch: PushSubscriptionPatch,
  ): Promise<PushSubscription> {
    this.updateCalls += 1;
    const found = [...this.store.values()].find((row) => row.id === id);
    // ⚠️ **LANÇA para um id que não existe**, e é fidelidade medida: o
    // `prisma.pushSubscription.update` levanta `P2025` — provado no teste de
    // contrato `states the precondition: update on a missing id raises P2025`.
    // Um fake que devolvesse `null` aqui deixaria a assinatura do port mentir.
    if (!found) {
      throw new Error(
        `PushSubscriptionRepositoryFake: no push subscription ${id} to update`,
      );
    }

    // ⚠️ CAMPO A CAMPO, o único campo patcheável (§7.1.1) — e `undefined`
    // significa "não mexe", como o `data` do Prisma, em vez de zerar.
    const updated: PushSubscription = {
      ...found,
      disabledAt:
        patch.disabledAt === undefined ? found.disabledAt : patch.disabledAt,
    };
    this.store.set(updated.endpoint, this.clone(updated));
    return this.clone(updated);
  }

  /** Tudo o que está guardado, para os testes assertarem a LINHA GRAVADA (§7.5). */
  get saved(): PushSubscription[] {
    return [...this.store.values()].map((row) => this.clone(row));
  }

  /**
   * Cópia completa, com os `Date` também clonados: `{ ...row }` copiaria a
   * REFERÊNCIA do `disabledAt`, e um teste que mexesse nele por fora mudaria o
   * que está "guardado". É o §7.7 aplicado ao fake.
   */
  private clone(row: PushSubscription): PushSubscription {
    return {
      ...row,
      disabledAt: row.disabledAt === null ? null : new Date(row.disabledAt),
      createdAt: new Date(row.createdAt),
    };
  }
}
