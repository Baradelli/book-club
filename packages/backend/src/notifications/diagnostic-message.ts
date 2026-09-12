import type { Locale } from '@clube/shared/locales';
import { en, FALLBACK_LOCALE, isLocale, pt } from '@clube/shared/locales';

import type { PushPayload } from '../usecases/ports/push-sender';

/**
 * A frase do **botão de teste** (`POST /notifications/test`) — a única do
 * produto que responde a uma pergunta em vez de contar um acontecimento:
 * *"chegou?"*.
 *
 * Ela vem do catálogo pelos mesmos dois motivos das irmãs (o backend não
 * escreve português cru, e a varredura anti-culpa mora no catálogo), e no
 * `Settings.locale` de quem apertou o botão — que aqui é também quem recebe,
 * porque **o teste só manda para os aparelhos de quem chamou** (decisão F).
 */

const CATALOGS: Record<Locale, typeof pt> = { pt, en };

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

export interface TestNotificationInput {
  /** O `Settings.locale` de quem apertou o botão. Desconhecido cai no `pt`. */
  locale: string;
}

export function buildTestNotification(
  input: TestNotificationInput,
): PushPayload {
  const locale: Locale = isLocale(input.locale)
    ? input.locale
    : FALLBACK_LOCALE;
  const catalog = CATALOGS[locale].notifications.test;

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
