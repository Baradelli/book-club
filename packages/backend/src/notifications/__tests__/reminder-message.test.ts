import { GUILT_TERMS } from '@clube/shared/anti-culpa';
import { en, pt } from '@clube/shared/locales';
import { describe, expect, it } from 'vitest';

import { aPlanItem } from '../../test-support/builders';
import { buildReadingReminder } from '../reminder-message';

/**
 * ⚠️ **REGRAS 15 e H DA TAREFA 37 — A MENSAGEM NÃO COBRA, E O IDIOMA É O DELA.**
 *
 * Esta é a única frase do sistema que chega **sem a pessoa abrir a tela**:
 * nenhuma varredura de DOM a alcança, e o i18n do navegador não está lá para
 * ser perguntado. Por isso as duas metades:
 *
 * - o texto vem do **catálogo compartilhado** (`CLAUDE.md`: não se escreve
 *   português cru no backend), e é ele que a varredura anti-culpa de
 *   `packages/shared/src/locales/__tests__/anti-guilt.test.ts` percorre nos
 *   DOIS idiomas;
 * - o idioma é o **`Settings.locale` da pessoa** (decisão H), porque não há
 *   navegador aberto quando o lembrete sai.
 *
 * ⚠️ **E o payload sai PRONTO daqui** (decisão I): o dispatcher decide, o
 * `PushSender` entrega. Se o sender montasse a frase, a regra anti-culpa ficaria
 * dentro do adaptador de rede, onde nenhum teste de UseCase a alcança.
 */

/** `"você não"` → `"voce nao"`: a varredura não pode depender do acento. */
function withoutDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function guiltTermsIn(text: string): string[] {
  const normalized = withoutDiacritics(text);
  return GUILT_TERMS.filter((term) => normalized.includes(term));
}

describe('buildReadingReminder', () => {
  it('says the topic of the day, and the title comes from the catalogue', () => {
    const payload = buildReadingReminder({
      locale: 'pt',
      bookId: 'book-1',
      planItem: aPlanItem({ title: 'Cap. 3 — A promessa' }),
    });

    expect(payload.title).toBe(pt.notifications.readingReminder.title);
    expect(payload.body).toBe('Cap. 3 — A promessa');
  });

  /** ⚠️ Decisão H: o idioma é o da PESSOA, e o `en` é um idioma de verdade aqui. */
  it('speaks the language of the person, not of the server', () => {
    const planItem = aPlanItem({ title: 'Ch. 3 — The promise' });

    expect(
      buildReadingReminder({ locale: 'en', bookId: 'b', planItem }).title,
    ).toBe(en.notifications.readingReminder.title);
    // E o par que impede "sempre o mesmo texto": os dois títulos DIFEREM.
    expect(en.notifications.readingReminder.title).not.toBe(
      pt.notifications.readingReminder.title,
    );
  });

  /**
   * ⚠️ **Locale desconhecido cai no `pt`, o `FALLBACK_LOCALE` do projeto** — e
   * não estoura. A coluna `Settings.locale` é `String` livre (não há
   * `z.enum(SUPPORTED_LOCALES)` no `updateSettingsSchema`), então um valor
   * inesperado é alcançável — e um lembrete que não sai por causa disso seria a
   * pior forma de falhar: silenciosa e permanente.
   */
  it.each(['fr', '', 'PT', 'pt-BR'])(
    'falls back to pt for the unknown locale %p',
    (locale) => {
      const payload = buildReadingReminder({
        locale,
        bookId: 'b',
        planItem: aPlanItem({ title: 'Cap. 1' }),
      });

      expect(payload.title).toBe(pt.notifications.readingReminder.title);
    },
  );

  /**
   * ⚠️ **O CLIQUE CAI NA TELA CERTA** (`NOTIFICACOES.md` §2: *"o clique tem de
   * cair na tela certa, senão a notificação não converte em leitura"*).
   *
   * O endereço é o do LIVRO, que é onde o plano e o atalho da leitura de hoje
   * estão — e o `encodeURIComponent` está lá pelo mesmo motivo do `bookPath` do
   * app: hoje os ids são `randomUUID()` e não há o que escapar, mas um id com
   * `/` deixaria de ser um segmento.
   */
  it('points at the book, with the id escaped', () => {
    expect(
      buildReadingReminder({
        locale: 'pt',
        bookId: 'a/b',
        planItem: aPlanItem(),
      }).url,
    ).toBe('/books/a%2Fb');
  });

  /**
   * O `tag` agrupa notificações do mesmo tipo (`NOTIFICACOES.md` §2): uma nova
   * substitui a anterior no aparelho em vez de empilhar. É o `kind` em
   * minúsculas, que é o que o §5 usa como `topic`.
   */
  it('tags the notification by kind, so a new one replaces the old', () => {
    expect(
      buildReadingReminder({
        locale: 'pt',
        bookId: 'b',
        planItem: aPlanItem(),
      }).tag,
    ).toBe('reading_reminder');
  });

  /**
   * ⚠️ **REGRA 15 — A MENSAGEM PRONTA NÃO COBRA, NOS DOIS IDIOMAS.**
   *
   * A varredura do catálogo já guarda as frases; esta guarda o **resultado da
   * interpolação**, que é outra coisa: é aqui que uma moldura ("não se esqueça
   * de", "faltam N páginas") apareceria se alguém a escrevesse em código, fora
   * do catálogo, onde varredura nenhuma a veria.
   */
  it.each(['pt', 'en'])('never nags, in %s', (locale) => {
    const payload = buildReadingReminder({
      locale,
      bookId: 'b',
      planItem: aPlanItem({ title: 'Cap. 3 — A promessa' }),
    });

    expect(guiltTermsIn(`${payload.title} ${payload.body}`)).toEqual([]);
  });

  /**
   * ⚠️ **O ANTÍDOTO (§7.4): a varredura acima TEM DE ACUSAR uma cobrança.**
   *
   * Sem ele, um `GUILT_TERMS` esvaziado — ou um `includes` invertido — deixaria
   * o teste de cima verde para sempre, e ele é o único que olha a frase que
   * chega ao celular.
   */
  it.each([
    'Você deixou 3 dias para trás',
    "You're 3 days behind",
    'Sua leitura está em atraso',
  ])('would accuse the nagging phrase %p', (phrase) => {
    expect(guiltTermsIn(phrase).length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **NENHUM NÚMERO NA MENSAGEM** — nem de dias, nem de páginas, nem de
   * percentual. O §1 do plano proíbe régua, e um contador é régua mesmo sem
   * uma palavra de cobrança em volta ("3 de 30" não tem termo nenhum da lista).
   *
   * O que pode aparecer é o que o admin escreveu no plano — e é por isso que o
   * fixture desta asserção tem um número **dentro do título do dia**: o teste
   * tem de reprovar a moldura, não o conteúdo do clube.
   */
  it('adds no counter of its own around what the club wrote', () => {
    const payload = buildReadingReminder({
      locale: 'pt',
      bookId: 'b',
      planItem: aPlanItem({ title: 'Cap. 3 — A promessa' }),
    });

    expect(payload.title).not.toMatch(/\d/);
    // O corpo É o título do dia, e nada mais: nada foi acrescentado em volta.
    expect(payload.body).toBe('Cap. 3 — A promessa');
  });

  /**
   * ⚠️ **O PLACEHOLDER NÃO VAZA.** Se a interpolação falhasse, o corpo chegaria
   * ao celular como `{{title}}` — e nenhum teste que só verificasse "o corpo
   * não está vazio" acusaria isso.
   */
  it('never leaks the {{title}} placeholder', () => {
    for (const locale of ['pt', 'en']) {
      const payload = buildReadingReminder({
        locale,
        bookId: 'b',
        planItem: aPlanItem({ title: 'Cap. 1' }),
      });

      expect(payload.body).not.toContain('{{');
      expect(payload.body).not.toContain('}}');
    }
    // E a precondição: o catálogo REALMENTE tem um placeholder para interpolar
    // — senão este teste passaria sobre uma string constante.
    expect(pt.notifications.readingReminder.body).toContain('{{title}}');
    expect(en.notifications.readingReminder.body).toContain('{{title}}');
  });
});
