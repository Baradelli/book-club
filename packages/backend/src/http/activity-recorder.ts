import { getVapidConfig } from '../notifications/vapid';
import { WebPushSender } from '../notifications/web-push-sender';
import { NotifyGroupActivity } from '../usecases/notify-group-activity';
import type { PushSender } from '../usecases/ports/push-sender';
import { RecordActivity } from '../usecases/record-activity';
import type { Repositories } from './repositories';

/**
 * ⚠️ **A FIAÇÃO DO `GROUP_ACTIVITY` — em UM lugar, para os TRÊS arquivos de
 * rota que gravam atividade** (`note`, `highlight`, `reading-log`).
 *
 * Sem isto, cada um deles montaria o mesmo trio (sender, leque, gravador), e a
 * quarta rota que gravasse atividade nasceria **sem push** sem que nada ficasse
 * vermelho — é a lição nº 3 do MVP 1 aplicada à composição, e o mesmo motivo
 * pelo qual `buildRepositories` existe (§6.6: *"não instancie repositórios
 * arquivo por arquivo de rota"*).
 *
 * Os três passam a chamar `buildRecordActivity(repos)` no lugar de
 * `new RecordActivity(repos.activityEvents)` — **uma linha cada**, e os quatro
 * UseCases de escrita não mudam nenhuma (decisão A da Tarefa 38).
 */

/**
 * O `PushSender` real, ou `null` quando não há VAPID configurado.
 *
 * `NOTIFICACOES.md` §3: *"`null` desliga a feature inteira, limpo"*. Ninguém
 * precisa de VAPID para rodar o projeto — e o `NotifyGroupActivity` com
 * `sender: null` não faz **nem uma leitura de banco** (regra 16), então uma
 * instalação sem push não paga uma consulta por anotação escrita.
 */
export function buildPushSender(repositories: Repositories): PushSender | null {
  const vapid = getVapidConfig();
  if (vapid === null) return null;
  return new WebPushSender(repositories.pushSubscriptions, vapid);
}

/**
 * O gravador de atividade **com** o leque de push pendurado.
 *
 * ⚠️ **O `getVapidConfig()` é lido no REGISTRO das rotas, e não por request** —
 * ao contrário do `GET /notifications/config`, que o lê no handler. A diferença
 * é deliberada: aquela rota **informa** o estado da feature, e por isso ele tem
 * de ser o do ambiente naquele instante; este caminho **entrega**, e um sender
 * novo por anotação escrita seria um objeto por request para ler três variáveis
 * que não mudam enquanto o processo vive. Consequência a saber: ligar o VAPID
 * exige reiniciar o servidor — que é o que uma variável de ambiente já exige.
 */
export function buildRecordActivity(
  repositories: Repositories,
): RecordActivity {
  return new RecordActivity(
    repositories.activityEvents,
    new NotifyGroupActivity({
      memberships: repositories.memberships,
      settings: repositories.settings,
      sender: buildPushSender(repositories),
    }),
  );
}
