import type { Locale } from '@clube/shared/locales';
import { en, FALLBACK_LOCALE, isLocale, pt } from '@clube/shared/locales';

import type { ReadingPlanItem } from '../domain/book';
import type { PushPayload } from '../usecases/ports/push-sender';

/**
 * ⚠️ **A FRASE QUE CHEGA AO CELULAR — montada aqui, no idioma DA PESSOA
 * (decisão H da Tarefa 37).**
 *
 * Ela é a única do produto que chega **sem a pessoa abrir a tela**, e daí as
 * duas consequências que decidem este arquivo:
 *
 * 1. **o texto vem do catálogo compartilhado**, nunca escrito em português cru
 *    aqui (`CLAUDE.md`). É o que põe a frase dentro da varredura anti-culpa de
 *    `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre os
 *    dois idiomas — uma guarda de tela **nunca** a veria, porque ela não passa
 *    por tela nenhuma (§7.9: a guarda mora onde a propriedade é decidível);
 * 2. **o idioma é o `Settings.locale`**, e não o do navegador: não há navegador
 *    aberto quando o lembrete sai.
 *
 * ⚠️ **E o payload sai PRONTO** (decisão I): o dispatcher decide, o
 * `PushSender` entrega. Montar a frase dentro do adaptador de rede poria a
 * regra anti-culpa onde nenhum teste de UseCase a alcança.
 */

/** Os catálogos por locale. `pt` é o padrão e o fallback (`CLAUDE.md`). */
const CATALOGS: Record<Locale, typeof pt> = { pt, en };

/**
 * O `kind` em minúsculas — é o `tag` do `showNotification` (§2) e o `topic` do
 * Web Push (§5), e os dois querem a mesma string.
 *
 * Uma nova notificação com o mesmo `tag` **substitui** a anterior no aparelho
 * em vez de empilhar: duas passadas do cron não podem virar duas notificações
 * na bandeja, e o `tag` é a segunda rede embaixo do claim.
 */
const READING_REMINDER_TAG = 'reading_reminder';

/**
 * O endereço do LIVRO, que é onde o plano e o atalho da leitura de hoje estão.
 *
 * ⚠️ **A rota é do `packages/app` (`BOOK_PATH` em `src/pages/paths.ts`), e este
 * é o segundo lugar do repositório que a conhece.** A duplicação é consciente e
 * está registrada aqui em vez de resolvida: subir uma tabela de rotas para
 * `@clube/shared` só por causa desta linha faria o pacote empacotado no PWA
 * passar a ser o dono da navegação do app, e o `NOTIFICACOES.md` §2 já trata o
 * `url` do payload como um dado do push, não como parte do roteador. Se um dia
 * houver um segundo endereço no push, aí a tabela se paga.
 *
 * O `encodeURIComponent` é o mesmo do `bookPath` do app, pelo mesmo motivo:
 * hoje os ids são `randomUUID()` e não há o que escapar, mas um id com `/`
 * deixaria de ser um segmento.
 *
 * ⚠️ **EXPORTADO na Tarefa 38, e é a decisão E dela:** o `GROUP_ACTIVITY` tem
 * o mesmo problema (o clique tem de cair na tela do livro) e passa a **reusar
 * este dono** em vez de escrever a segunda cópia de `/books/:bookId`. O
 * argumento do parágrafo acima não mudou: o segundo endereço de push ainda não
 * existe, e é o segundo ENDEREÇO — não o segundo chamador — que pagaria uma
 * tabela de rotas em `@clube/shared`.
 */
export function bookUrl(bookId: string): string {
  return `/books/${encodeURIComponent(bookId)}`;
}

/**
 * A interpolação, e ela é `String.replace` de propósito — não o i18next.
 *
 * O backend não tem (nem deve ter) o runtime de i18n do front: ele precisa de
 * **uma** substituição, num catálogo que ele já importa. Trazer a biblioteca
 * para cá seria dependência nova para uma linha.
 *
 * ⚠️ **Uma função (`() => value`) e não a string como substituto**: com a
 * string, um `$&` ou `$1` dentro do título que o admin escreveu viraria
 * referência de captura e o texto sairia corrompido. Com a função, o valor é
 * literal — medido como classe de bug no `String.prototype.replace`, não
 * suposto.
 */
function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{{${key}}}`, () => value),
    template,
  );
}

export interface ReadingReminderInput {
  /** O `Settings.locale` da pessoa. Valor desconhecido cai no `pt`. */
  locale: string;
  /** O livro do trecho de hoje — é para ele que o clique leva. */
  bookId: string;
  /** O trecho de hoje, como o admin o cadastrou. */
  planItem: ReadingPlanItem;
}

/**
 * "A leitura de hoje é o Cap. 3."
 *
 * ⚠️ **Locale desconhecido cai no `pt` e NÃO estoura.** A coluna
 * `Settings.locale` é `String` livre — o `updateSettingsSchema` pede
 * `z.string().min(1)`, não um `z.enum(SUPPORTED_LOCALES)` —, então um valor
 * inesperado é alcançável. E um lembrete que deixasse de sair por causa disso
 * falharia do pior jeito: em silêncio, para sempre, e só para aquela pessoa.
 */
export function buildReadingReminder(input: ReadingReminderInput): PushPayload {
  const locale: Locale = isLocale(input.locale)
    ? input.locale
    : FALLBACK_LOCALE;
  const catalog = CATALOGS[locale].notifications.readingReminder;

  return {
    title: catalog.title,
    body: interpolate(catalog.body, { title: input.planItem.title }),
    tag: READING_REMINDER_TAG,
    url: bookUrl(input.bookId),
  };
}
