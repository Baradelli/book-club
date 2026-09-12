import type {
  PushSubscription,
  PushSubscriptionPatch,
} from '../../domain/push-subscription';

/**
 * O port da inscrição de push: `save` · `byEndpointAndUser` · `byUserId` ·
 * `update`.
 *
 * ⚠️ **Nasce com a implementação Prisma NA MESMA UNIDADE**, como o
 * `docs/CONVENCOES-CODIGO.md` §6.9 exige: crescer (ou criar) um port sem
 * implementar no repositório real dá `TS2420` na classe e `TS2345` em todo
 * arquivo de rota que passa a instância a um UseCase — 16 erros em 9 arquivos
 * na medição da Tarefa 26a —, e um vermelho de compilação em arquivo alheio
 * esconde exatamente o vermelho de teste que a unidade deveria mostrar.
 *
 * ⚠️ **NÃO tem `delete`, e é decisão** (`NOTIFICACOES.md` §4): a desativação é
 * **soft** (`disabledAt`). A inscrição que volta é o caso comum — a pessoa
 * desliga o push, muda de ideia, e o navegador devolve o MESMO endpoint —, e um
 * hard delete perderia `createdAt` e `userAgent` a cada vaivém. É o oposto do
 * `ReadingLog`, onde desmarcar é hard delete: lá o registro **afirma um fato**
 * ("eu li") e desmarcá-lo é dizer que o fato não aconteceu; aqui ele é um
 * **canal** ("mande para cá"), e um canal se desliga, não se apaga.
 *
 * ⚠️ **NÃO tem `find(filter)`**, ao contrário da nota, do grifo e do log: não
 * existe listagem de inscrição por nada além do dono. Um `PushSubscriptionFilter`
 * hoje seria uma forma sem chamador — e o `byUserId` abaixo é o recorte que os
 * dois leitores previstos realmente pedem.
 *
 * ⚠️ **NÃO tem `byId`**, e é o mesmo motivo estrutural do `ReadingLog` (decisão
 * E da Tarefa 30): nenhum UseCase recebe id de inscrição no input. A identidade
 * na API é o `endpoint`, e a busca é sempre pelo PAR com o dono — então a
 * inscrição de outra pessoa é **inalcançável**, sem nenhum `if` de autoria para
 * alguém esquecer de escrever.
 */
export interface PushSubscriptionRepository {
  /**
   * ⚠️ **Upsert por `endpoint`, e NÃO por `id`** — a divergência com todos os
   * outros repositórios do projeto, e ela é a decisão E da fatia.
   *
   * O `endpoint` **é** a identidade da inscrição no protocolo Web Push, e a
   * tabela tem `@@unique([endpoint])`. Um upsert por `id` faria dois `POST` do
   * mesmo aparelho (o retry da fila offline, ou a pessoa reativando) baterem no
   * índice único do endpoint e virarem `P2002` — que o
   * `handle-domain-error.ts` **não mapeia** (o `grep` volta vazio), então
   * sairia **500** na ativação de alguém. É o mesmo raciocínio do
   * `PrismaReadingLogRepository.save`, que aponta o upsert para
   * `(planItemId, userId)`.
   *
   * ⚠️ **E ele REATIVA:** o `disabledAt` vai no UPDATE, então um `POST` com
   * `disabledAt: null` traz a inscrição de volta (`NOTIFICACOES.md` §4 —
   * *"upsert por `endpoint`, reativando (`disabledAt = null`) se voltou"*). É
   * por isso que o `disabledAt` atravessa o `save` inteiro, e não só o
   * `update`.
   *
   * ⚠️ **O `id` vai SÓ no CREATE.** Escrevê-lo no UPDATE trocaria a chave
   * primária de uma linha existente — o mesmo `toUpsertUpdateData` da nota e do
   * log. Consequência: numa reativação o id gerado pelo UseCase é
   * **descartado**, e como o `save` devolve a linha do banco, o chamador
   * responde o id certo.
   *
   * ⚠️ **O `userId` TAMBÉM vai no UPDATE, e isso é deliberado.** O endpoint é a
   * identidade do APARELHO: se o mesmo endpoint chega para outra pessoa (um
   * aparelho compartilhado, ou um navegador que reciclou o endpoint depois de
   * uma desinscrição), o dono novo é quem está com o navegador na mão — e é
   * ele que vai receber a notificação de fato. Manter o dono antigo mandaria o
   * push da Maria para o navegador do Marcos, que é pior. O `createdAt` também
   * vai, porque a linha passa a ser desta inscrição.
   */
  save(subscription: PushSubscription): Promise<PushSubscription>;

  /**
   * "Esta pessoa tem ESTA inscrição?" — a leitura que torna a desativação
   * alcançável **e** o corte de dono estrutural.
   *
   * ⚠️ **O par `(endpoint, userId)`, nunca o endpoint sozinho**, e é a decisão
   * E da Tarefa 30 aplicada aqui: com a busca já por dono, a inscrição de outra
   * pessoa não aparece — não há linha alheia ao alcance do `update` que vem
   * depois, e portanto não há guard de autoria para alguém esquecer.
   *
   * ⚠️ **Ignora o `disabledAt`**, de propósito: a inscrição já desativada tem de
   * ser encontrada, senão desativar duas vezes deixaria de ser idempotente (e o
   * `POST` de reativação não teria como saber que a linha existe). "Desligada"
   * não é "inexistente".
   *
   * Devolve `null` quando não há — "não inscrito" não é erro em lugar nenhum
   * desta feature.
   */
  byEndpointAndUser(
    endpoint: string,
    userId: string,
  ): Promise<PushSubscription | null>;

  /**
   * "Os aparelhos ATIVOS desta pessoa" — `disabledAt IS NULL`, e o filtro é do
   * repositório, não do chamador.
   *
   * ⚠️ **Só as ativas, e isso é CONTRATO** (`NOTIFICACOES.md` §5: *"Carrega as
   * inscrições do usuário com `disabledAt IS NULL` (via repository, não
   * `$queryRaw`)"*). Deixar o filtro para quem chama seria a mesma classe do
   * `status: 'ACTIVE'` que o `listNotes` manda ao port: um chamador que
   * esquecesse mandaria push para um aparelho que pediu para não receber mais —
   * e a Tarefa 38 tem **dois** chamadores previstos (o lembrete e o
   * `GROUP_ACTIVITY`).
   *
   * **Sem promessa de ordem** (o fake enumera INVERTIDO de propósito, §7.2) e
   * **sem teto de linhas**: o conjunto é "os aparelhos de uma pessoa", que é um
   * punhado — a mesma conta que deixou o `find` do `ReadingLog` sem `take`, e
   * aqui um corte silencioso deixaria de notificar um aparelho real.
   *
   * ⚠️ **O chamador desta leitura é a Tarefa 38**, não esta fatia — e ela está
   * aqui, com teste de contrato, porque a regra 13 a pede e porque o §6.9 manda
   * o port e o Prisma nascerem juntos. O que ela NÃO é é especulação de forma:
   * o `NOTIFICACOES.md` §5 declara a assinatura que a usa.
   */
  byUserId(userId: string): Promise<PushSubscription[]>;

  /**
   * A desativação **soft**, e o patch é um **tipo próprio** (§7.1.1).
   *
   * `PushSubscriptionPatch` é `Partial<Pick<…, 'disabledAt'>>`: o `disabledAt`
   * é o único campo mutável (decisão I), e nada de trocar `endpoint`, `userId`
   * ou as chaves do aparelho por update. Um `Partial<PushSubscription>` aqui
   * prometeria o que o repositório Prisma não cumpre — foi exatamente o bug do
   * `NotePatch` que o §7.1.1 registra.
   *
   * Devolve a linha atualizada, como o `update` da nota e do grifo. **Lança**
   * para um id que não existe (`P2025` do Prisma): ao contrário do `delete` do
   * `ReadingLog`, não há corrida a absorver aqui — nada no produto faz hard
   * delete de inscrição, então a linha que o UseCase acabou de ler não
   * desaparece. Dois `DELETE` simultâneos apenas gravam o mesmo `disabledAt`
   * duas vezes.
   */
  update(id: string, patch: PushSubscriptionPatch): Promise<PushSubscription>;
}
