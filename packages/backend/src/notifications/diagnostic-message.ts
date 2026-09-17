import { pt } from '@clube/shared/locales';

import type { PushPayload } from '../usecases/ports/push-sender';

/**
 * A frase do **botão de teste** (`POST /notifications/test`) — a única do
 * produto que responde a uma pergunta em vez de contar um acontecimento:
 * *"chegou?"*.
 *
 * Ela vem do catálogo pelos mesmos dois motivos das irmãs: o backend não
 * escreve português cru, e a varredura anti-culpa mora no catálogo. E ela só
 * vai para os aparelhos de quem chamou (decisão F).
 */

/**
 * ⚠️ **DECISÃO G — o `tag` é a string `'test'`, e `TEST` NÃO entra no
 * `NOTIFICATION_KINDS`.**
 *
 * Aquela constante é o vocabulário de uma **chave de idempotência**
 * (`@@unique([userId, kind, localDate])` — decisão 7 da Tarefa 37), e um `TEST`
 * ali significaria *"só dá para testar o push uma vez por dia"*, que é o oposto
 * do que um botão de diagnóstico serve: ele **envia**, não reserva. O `tag` é
 * do protocolo do navegador, e os dois vocabulários não são o mesmo.
 */
export const TEST_NOTIFICATION_TAG = 'test';

/**
 * ⚠️ **UM IDIOMA SÓ, e por isso esta função NÃO RECEBE locale (Tarefa 38d).**
 *
 * Até aqui ela recebia o `Settings.locale` da pessoa e escolhia entre dois
 * catálogos, caindo no `pt` para qualquer valor desconhecido (a coluna é
 * `String` livre, e o caso medido era `'klingon'`). O dono respondeu à pergunta
 * 7 do MVP 1 — *"só português"* —, o segundo catálogo saiu, e um parâmetro que
 * chega e não muda nada é pior que um parâmetro que não existe: quem chama
 * continua achando que escolhe.
 *
 * ⚠️ **A coluna `Settings.locale` fica no banco** (não há migration nesta
 * fatia) e passa a não ter leitor nenhum. A nota está escrita ao lado dela, no
 * `prisma/schema.prisma`.
 */
export function buildTestNotification(): PushPayload {
  const catalog = pt.notifications.test;

  return {
    title: catalog.title,
    body: catalog.body,
    tag: TEST_NOTIFICATION_TAG,
    // A raiz, e não um livro: não há livro nenhum envolvido num teste, e
    // inventar `/books/algum` mandaria a pessoa para uma tela que não tem nada
    // a ver com o botão que ela apertou.
    url: '/',
  };
}
