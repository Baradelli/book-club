import { NOTIFICATION_PLATFORMS } from '@clube/shared';
import { describe, expect, it } from 'vitest';

import { InvalidPushSubscriptionError } from '../errors';
import { assertNotificationPlatform } from '../push-subscription';

/**
 * O portão da plataforma no DOMÍNIO — o molde exato do `assertHighlightColor`.
 *
 * O `z.enum(NOTIFICATION_PLATFORMS)` da borda é a **primeira** barreira, não a
 * única: o valor vem de corpo de request, e o repositório Prisma também
 * atravessa esta função na LEITURA (a coluna é `String`, e o domínio quer
 * `NotificationPlatform`) — uma plataforma fora da lista no banco é erro de
 * verdade, e tem de aparecer na leitura, não na tela desenhando um estado que
 * não existe.
 */
describe('assertNotificationPlatform', () => {
  it.each(NOTIFICATION_PLATFORMS)('narrows %s', (platform) => {
    expect(assertNotificationPlatform(platform)).toBe(platform);
  });

  /**
   * Sem `trim` e sem dobrar caixa, pelo motivo do `isHighlightColor`: uma
   * segunda grafia aceita viraria uma segunda grafia gravada, e o `=` de texto
   * do Postgres é byte-sensível.
   */
  it.each([
    'WEB',
    'Web',
    ' web',
    'web ',
    'desktop',
    '',
    1,
    null,
    undefined,
    {},
  ])('refuses %s', (value) => {
    expect(() => assertNotificationPlatform(value)).toThrow(
      InvalidPushSubscriptionError,
    );
  });

  /**
   * A mensagem lista o que é aceito — é a única publicada na resposta do 400
   * (§6.2) — e **não ecoa o valor recusado**: `value` é `unknown` aqui, e ecoar
   * o que o cliente mandou é como um payload inteiro volta numa mensagem.
   */
  it('says what is accepted and never echoes what came', () => {
    let message = '';
    try {
      assertNotificationPlatform('carteiro-pombo');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('web');
    expect(message).toContain('mobile');
    expect(message).not.toContain('carteiro-pombo');
  });
});
