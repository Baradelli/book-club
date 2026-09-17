import { pt } from '@clube/shared/locales';
import { describe, expect, it } from 'vitest';

import {
  buildTestNotification,
  TEST_NOTIFICATION_TAG,
} from '../diagnostic-message';

/**
 * A frase do botão "enviar notificação de teste" — a única do sistema que
 * responde a uma pergunta e não a um acontecimento: *"chegou?"*.
 */
describe('buildTestNotification', () => {
  /*
    ⚠️ **ATÉ A TAREFA 38d ESTE ERA UM `it.each` SOBRE `pt` E `en`, e havia um
    irmão (`falls back to pt instead of throwing`) para o valor desconhecido.**
    Os dois mediam a escolha de idioma a partir do `Settings.locale`, que era
    `String` livre — daí o caso `'klingon'`. Sem segundo catálogo,
    `buildTestNotification` deixou de RECEBER locale: parâmetro que chega e não
    muda nada é pior que parâmetro que não existe, porque quem chama continua
    achando que escolhe.
  */
  it('speaks pt, from the catalogue', () => {
    const payload = buildTestNotification();

    expect(payload.title).toBe(pt.notifications.test.title);
    expect(payload.body).toBe(pt.notifications.test.body);
  });

  /**
   * ⚠️ **DECISÃO G — o `tag` é a string `'test'`, e `TEST` NÃO entra no
   * `NOTIFICATION_KINDS`.**
   *
   * Aquela lista é o vocabulário de uma **chave de idempotência**
   * (`@@unique([userId, kind, localDate])`), e um `TEST` ali significaria "só
   * dá para testar o push uma vez por dia" — o oposto do que um botão de
   * diagnóstico serve. O `tag` é do protocolo do navegador e não precisa estar
   * lá.
   */
  it('tags the test notification with a string that is NOT a notification kind', () => {
    expect(TEST_NOTIFICATION_TAG).toBe('test');
    expect(buildTestNotification().tag).toBe('test');
  });

  /**
   * O clique do teste leva para **a raiz** — não há livro nenhum envolvido, e
   * inventar um `/books/algum` mandaria a pessoa para uma tela que não tem nada
   * a ver com o que ela apertou.
   */
  it('points the click at the root, because a test is about no book', () => {
    expect(buildTestNotification().url).toBe('/');
  });

  it('carries the four fields of the payload and nothing else', () => {
    expect(Object.keys(buildTestNotification()).sort()).toEqual([
      'body',
      'tag',
      'title',
      'url',
    ]);
  });
});
