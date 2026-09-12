/*
  O QUE O APARELHO FAZ COM O PUSH — `docs/NOTIFICACOES.md` §2.

  Arquivo pequeno, SEM BUILD e SEM IMPORTS, de propósito: ele é injetado no
  service worker gerado pelo Workbox por `workbox.importScripts` no
  `vite.config.ts`, e não passa pelo Vite nem pelo TypeScript. Nada aqui pode
  depender de bundler: nem `import`, nem sintaxe que precise de transpilação.

  NENHUMA OUTRA REDE OLHA PARA ESTE ARQUIVO. Ele roda dentro do service
  worker, onde uma exceção não aparece no console de ninguém, não sobe para log
  nenhum, e o sintoma é "a notificação simplesmente não chegou". O `pnpm
  typecheck` não o vê (não é TypeScript e o `tsconfig` do app cobre `src/`); o
  acusador dele é `src/__tests__/push-handler.test.ts`, que LÊ este arquivo e o
  executa com um `self` de mentira.

  E ELE NÃO DECIDE NADA. O texto vem pronto do backend, no idioma de quem
  recebe (`notifications/group-activity-message.ts`): quem monta a frase é quem
  tem o catálogo e as preferências da pessoa. Aqui só se desembrulha e se
  mostra.
*/

/*
  A notificação aparece em TELA BLOQUEADA (§1), e o payload nunca leva o
  conteúdo do clube: só o título, o corpo, o `tag` que agrupa e a `url` do
  clique.
*/
self.addEventListener('push', (event) => {
  /*
    REGRA 6, caso 1: um push sem corpo. Acontece de verdade — há serviços que
    mandam push vazio para "acordar" o worker —, e um `event.data.json()` aqui
    seria `TypeError` em cima de `null`.
  */
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    // REGRA 6, caso 2: veio coisa que não é JSON. Silêncio, e não exceção: não
    // há a quem reportar de dentro de um service worker.
    return;
  }

  if (typeof payload !== 'object' || payload === null) return;

  /*
    REGRA 6, caso 3: CAMPO FALTANDO — e "nada acontecendo" aqui é mais forte
    que "não estourou".

    O esboço do §2 passa `payload.title` adiante do jeito que vier. Sem título,
    `showNotification(undefined, …)` mostra uma notificação escrita
    **"undefined"**: ela acorda a pessoa para dizer nada. Uma notificação errada
    é pior que nenhuma.

    O resto do payload é opcional de propósito: sem `body` a notificação é só o
    título, e sem `url` o clique cai na raiz (ver abaixo).
  */
  const title = payload.title;
  if (typeof title !== 'string' || title.trim() === '') return;

  /*
    `waitUntil` NÃO é decoração: sem ele o navegador pode encerrar o service
    worker antes de a notificação aparecer. O bug é intermitente e pior no
    celular, onde o sistema mata o worker mais cedo — e parece "o push não chega
    às vezes".
  */
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      /*
        O `tag` AGRUPA: uma notificação nova com o mesmo `tag` SUBSTITUI a
        anterior em vez de empilhar. É ele, e não um debounce no servidor
        (decisão D da Tarefa 38), que faz três atividades juntas virarem uma
        notificação na bandeja.
      */
      tag: payload.tag,
      // O `data` é o único lugar em que a `url` sobrevive até o clique: o
      // `notificationclick` abaixo a lê de volta daqui.
      data: { url: payload.url },
    }),
  );
});

/*
  §2: "o clique tem de cair na tela certa, senão a notificação não converte em
  leitura".
*/
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data;
  // Sem `url` — notificação antiga, payload torto — o clique ainda abre o app.
  // Cair na raiz é pior que cair na tela certa, e melhor que não fazer nada.
  const url =
    data && typeof data.url === 'string' && data.url !== '' ? data.url : '/';

  event.waitUntil(
    (async () => {
      /*
        `includeUncontrolled: true`: logo depois de uma atualização do service
        worker, as abas abertas ainda são controladas pelo worker ANTIGO — sem
        isto elas não apareceriam aqui, e o clique abriria uma segunda aba do
        app em cima da que a pessoa já tinha.
      */
      const clientList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        /*
          Nem todo `Client` sabe navegar: o `navigate` é do `WindowClient`, e
          nem todo navegador o expõe. Sem esta checagem seria um `TypeError`
          dentro do service worker — o clique não faria nada, e ninguém veria o
          erro.
        */
        if ('navigate' in client) {
          await client.navigate(url);
          return client.focus();
        }
      }

      return self.clients.openWindow(url);
    })(),
  );
});
