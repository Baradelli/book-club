import type { NotificationConfigResponse } from '@clube/shared';

/**
 * ⚠️ **A CONFIGURAÇÃO VAPID — e o `null` que DESLIGA A FEATURE INTEIRA, LIMPO.**
 * (`docs/NOTIFICACOES.md` §3.)
 *
 * Este é o único lugar do backend que lê as chaves VAPID, e ele só **lê**:
 * nada aqui gera, grava ou imprime chave. As chaves de verdade vivem só no
 * `.env` (que o `.gitignore` cobre, com `!.env.example` como única exceção) e no
 * `.env.example` como placeholder **VAZIO** — o teste
 * `the .env.example keeps the VAPID keys empty` é o que vigia esse vazio, e ele
 * fica vermelho no dia em que alguém colar uma chave lá.
 *
 * ⚠️ **A chave PÚBLICA pode chegar ao front; a PRIVADA nunca sai do backend.**
 * A projeção que separa as duas é o `publicNotificationConfig` abaixo, e ele é o
 * ÚNICO caminho pelo qual esta configuração vira resposta HTTP. `packages/shared`
 * é empacotado no PWA, e é por isso que a privada nem tem nome lá
 * (`packages/shared/src/__tests__/no-vapid-private-key.test.ts`).
 *
 * ## Por que um arquivo em `notifications/` e não um UseCase
 *
 * Não há regra de negócio nem repositório: é leitura de ambiente, como o
 * `JWT_SECRET` e o `CORS_ORIGIN` do `http/server.ts`. Pôr isto atrás de um
 * UseCase criaria uma camada que não decide nada. O que ele tem de ter — e tem
 * — é **um dono só** e teste unitário próprio, porque as duas propriedades que
 * importam (o desligamento limpo e "a privada não sai") são decidíveis aqui,
 * sem HTTP.
 *
 * ## O que NÃO está aqui
 *
 * `sendPushToUser`, o port `PushSender` e o `web-push` são a **Tarefa 38**; o
 * `dispatchDueNotifications` e o `NOTIFICATION_WINDOW_MINUTES` são a **37**.
 * Esta fatia não produz efeito fora da máquina — é escolha de segurança, não de
 * escopo.
 */
export interface VapidConfig {
  /** 87 caracteres base64url. É a que vai no `applicationServerKey` do front. */
  publicKey: string;
  /** ⚠️ O SEGREDO. Nunca sai do backend, nunca entra em resposta, nunca em log. */
  privateKey: string;
  /** `mailto:` do responsável — o protocolo exige um contato (RFC 8292). */
  subject: string;
}

/**
 * A configuração, ou `null` quando a feature está desligada.
 *
 * ⚠️ **A guarda é de FALSIDADE, não de ausência, e a diferença é o caso real.**
 * O `.env.example` declara `VAPID_PUBLIC_KEY=` — a variável **existe** e o valor
 * é `''`. Um `=== undefined` diria "configurado" para a string vazia, e o
 * backend tentaria assinar push com chave vazia, num erro que só apareceria no
 * envio (Tarefa 38). Com `!publicKey`, o estado de hoje na máquina do dono —
 * variáveis presentes e vazias — é exatamente o caminho desligado.
 *
 * **Uma chave só não basta:** com a pública sem a privada não há como assinar, e
 * com a privada sem a pública não há o que mandar ao navegador. Meia
 * configuração é configuração nenhuma.
 *
 * Lê `process.env` **a cada chamada**, e não uma vez no boot. Não é descuido: é
 * o que faz o estado da feature ser o do ambiente **naquele request**, em vez de
 * um valor congelado dentro da instância do servidor no instante do registro das
 * rotas — e é o que torna as duas pontas (ligada e desligada) exercitáveis sem
 * subir dois servidores. Três leituras de `process.env` por request é o mesmo
 * custo que o `CORS_ORIGIN` já paga no boot.
 */
export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  if (!publicKey || !privateKey) return null;

  return {
    publicKey,
    privateKey,
    subject: process.env['VAPID_SUBJECT'] || 'mailto:admin@localhost',
  };
}

/**
 * ⚠️ **A PROJEÇÃO PÚBLICA — o único caminho da configuração para a rede.**
 *
 * Ela **enumera** os dois campos do contrato em vez de transformar o objeto:
 * um `{ ...config, privateKey: undefined }` ou um `delete` deixariam a decisão
 * na forma do objeto de entrada, e o campo novo que a Tarefa 38 acrescentar ao
 * `VapidConfig` sairia de graça. Aqui, campo novo só sai se alguém o escrever
 * nesta função — e o `response` schema do Zod é a segunda barreira (§6.1).
 *
 * O `subject` também fica de fora, e é decisão: é o e-mail do responsável, que o
 * protocolo de **envio** exige. O cliente não tem o que fazer com ele, e um
 * campo a mais aqui é PII de graça.
 *
 * `{ enabled: false, vapidPublicKey: null }` com **200** (decisão G): um 404
 * faria a tela tratar "não configurado" como erro; o 200 é o que a deixa
 * esconder o toggle sem drama.
 */
export function publicNotificationConfig(
  config: VapidConfig | null,
): NotificationConfigResponse {
  if (config === null) return { enabled: false, vapidPublicKey: null };
  return { enabled: true, vapidPublicKey: config.publicKey };
}
