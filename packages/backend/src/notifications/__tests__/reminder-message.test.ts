import { GUILT_TERMS } from '@clube/shared/anti-culpa';
import { pt } from '@clube/shared/locales';
import { describe, expect, it } from 'vitest';

import { aPlanItem } from '../../test-support/builders';
import { buildReadingReminder } from '../reminder-message';

/**
 * ⚠️ **REGRA 15 DA TAREFA 37 — A MENSAGEM NÃO COBRA.**
 *
 * Esta é a única frase do sistema que chega **sem a pessoa abrir a tela**:
 * nenhuma varredura de DOM a alcança. Por isso o texto vem do **catálogo
 * compartilhado** (`CLAUDE.md`: não se escreve português cru no backend), e é
 * ele que a varredura anti-culpa de
 * `packages/shared/src/locales/__tests__/anti-guilt.test.ts` percorre.
 *
 * ⚠️ **A DECISÃO H da Tarefa 37 — "o idioma é o `Settings.locale` da pessoa,
 * e não o do servidor" — morreu na Tarefa 38d**, junto com o segundo catálogo.
 * Ela continua escrita aqui porque era metade da razão de este arquivo existir:
 * quem a reabrir reabre também a pergunta 7 do MVP 1.
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
  /*
    ⚠️ **SAÍRAM AQUI NA TAREFA 38d:** `speaks the language of the person, not
    of the server` (a decisão H da Tarefa 37) e o
    `it.each(['fr', '', 'PT', 'pt-BR'])` que provava a queda no `pt` para um
    locale desconhecido. Os dois mediam a escolha de idioma a partir do
    `Settings.locale` — coluna `String` livre, daí os quatro casos esquisitos.

    Com um catálogo só, `buildReadingReminder` deixou de RECEBER locale: um
    parâmetro que chega e não muda nada é pior que um parâmetro que não existe,
    porque quem chama continua achando que escolhe. A coluna fica no banco,
    vestigial e com a nota escrita no `schema.prisma` (não há migration nesta
    fatia).
  */

  it('says the topic of the day, and the title comes from the catalogue', () => {
    const payload = buildReadingReminder({
      bookId: 'book-1',
      planItem: aPlanItem({ title: 'Cap. 3 — A promessa' }),
    });

    expect(payload.title).toBe(pt.notifications.readingReminder.title);
    expect(payload.body).toBe('Cap. 3 — A promessa');
  });

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
        bookId: 'b',
        planItem: aPlanItem(),
      }).tag,
    ).toBe('reading_reminder');
  });

  /**
   * ⚠️ **REGRA 15 — A MENSAGEM PRONTA NÃO COBRA.**
   *
   * A varredura do catálogo já guarda as frases; esta guarda o **resultado da
   * interpolação**, que é outra coisa: é aqui que uma moldura ("não se esqueça
   * de", "faltam N páginas") apareceria se alguém a escrevesse em código, fora
   * do catálogo, onde varredura nenhuma a veria.
   */
  it('never nags, in pt', () => {
    const payload = buildReadingReminder({
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
    const payload = buildReadingReminder({
      bookId: 'b',
      planItem: aPlanItem({ title: 'Cap. 1' }),
    });

    expect(payload.body).not.toContain('{{');
    expect(payload.body).not.toContain('}}');
    // E a precondição: o catálogo REALMENTE tem um placeholder para interpolar
    // — senão este teste passaria sobre uma string constante.
    expect(pt.notifications.readingReminder.body).toContain('{{title}}');
  });
});

/**
 * A MOLDURA DE PERDA NO LEMBRETE — o "foguinho" (ADR 0010).
 *
 * ⚠️ Estas frases são as únicas do backend isentas da varredura anti-culpa, e o
 * ADR registra a reversão: o dono pediu o mecanismo do Duolingo depois de a
 * objeção ser levantada e medida.
 */
describe('buildReadingReminder com a corrente', () => {
  const planItem = aPlanItem({ title: 'Cap. 3 — A promessa' });

  /**
   * ⚠️ **QUEM ESTÁ EM ZERO NÃO É COBRADO.** Não há o que perder, e a frase de
   * perda ali seria o app cobrando quem ainda não começou. É o caso mais fácil
   * de deixar passar, porque a cobrança "funciona" nos dois.
   */
  it.each([[0], [undefined]])(
    '⚠️ NÃO cobra quem está em zero (streak %s)',
    (streak) => {
      const payload = buildReadingReminder({
        bookId: 'b',
        planItem,
        ...(streak === undefined ? {} : { streak }),
      });

      expect(payload.body).toBe('Cap. 3 — A promessa');
      expect(payload.body).not.toContain('perder');
    },
  );

  it('⚠️ diz "1 dia" no singular — o primeiro dia de alguém', () => {
    const payload = buildReadingReminder({
      bookId: 'b',
      planItem,
      streak: 1,
    });

    expect(payload.body).toContain('sequência de 1 dia.');
    expect(payload.body).not.toContain('1 dias');
  });

  it('cobra quem tem corrente, e ainda diz O QUE ler', () => {
    const payload = buildReadingReminder({
      bookId: 'b',
      planItem,
      streak: 12,
    });

    expect(payload.body).toContain('12');
    // ⚠️ O tema do dia continua lá: mesmo cobrando, o lembrete tem de dizer o
    // que ler — senão vira só a cobrança.
    expect(payload.body).toContain('Cap. 3 — A promessa');
  });

  /** O antídoto do §7.4: as chaves têm os dois marcadores, senão os testes acima
   * passariam sobre uma string constante. */
  it('o catálogo interpola a contagem E o tema', () => {
    for (const key of ['streakBody_one', 'streakBody_other'] as const) {
      expect(pt.notifications.readingReminder[key]).toContain('{{count}}');
      expect(pt.notifications.readingReminder[key]).toContain('{{title}}');
    }
  });
});
