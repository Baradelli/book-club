import type { ActivityType } from '@clube/shared';
import { ACTIVITY_TYPES } from '@clube/shared';
import { en, pt } from '@clube/shared/locales';
import { describe, expect, it } from 'vitest';

import {
  buildGroupActivityMessage,
  GROUP_ACTIVITY_TAG,
} from '../group-activity-message';

/**
 * ⚠️ **A FRASE DO AVISO DE ATIVIDADE — o irmão do `reminder-message.ts`, e com
 * as MESMAS duas propriedades** (decisão H da Tarefa 37, regra 13 da 38):
 *
 * 1. o texto vem do **catálogo compartilhado**, e é isso que o põe dentro da
 *    varredura anti-culpa dos dois idiomas;
 * 2. o idioma é o `Settings.locale` **de quem recebe** — não há navegador
 *    aberto quando o aviso sai.
 *
 * ⚠️ **E a propriedade que é só dela: NADA DE CONTEÚDO** (`NOTIFICACOES.md`
 * §1). O `ReadingPlanItem` do lembrete entra na frase porque o trecho de hoje
 * é público do clube e é o que a pessoa precisa saber para ler. Aqui não há
 * assunto nenhum a levar: a notificação aparece em tela bloqueada, e o que
 * alguém escreveu se lê no app.
 */
describe('buildGroupActivityMessage', () => {
  it('speaks pt by default', () => {
    const payload = buildGroupActivityMessage({
      locale: 'pt',
      bookId: 'book-1',
      type: 'PLAN_NOTE',
    });

    expect(payload.title).toBe(pt.notifications.groupActivity.title);
    expect(payload.body).toBe(pt.notifications.groupActivity.planNote);
  });

  it('speaks en for who chose en', () => {
    const payload = buildGroupActivityMessage({
      locale: 'en',
      bookId: 'book-1',
      type: 'HIGHLIGHT',
    });

    expect(payload.title).toBe(en.notifications.groupActivity.title);
    expect(payload.body).toBe(en.notifications.groupActivity.highlight);
  });

  /**
   * ⚠️ **Locale desconhecido cai no `pt` e NÃO estoura** — o mesmo do
   * `buildReadingReminder`, e pelo mesmo motivo: `Settings.locale` é `String`
   * livre, então um valor inesperado é alcançável, e um aviso que deixasse de
   * sair por causa disso falharia em silêncio, para sempre, só para aquela
   * pessoa.
   */
  it.each([['klingon'], [''], ['pt-BR']])(
    'falls back to pt for the unknown locale %j, instead of throwing',
    (locale) => {
      const payload = buildGroupActivityMessage({
        locale,
        bookId: 'book-1',
        type: 'READ',
      });

      expect(payload.title).toBe(pt.notifications.groupActivity.title);
      expect(payload.body).toBe(pt.notifications.groupActivity.read);
    },
  );

  /**
   * ⚠️ **Decisão E — o `tag` é o `kind` em MINÚSCULAS**, a mesma string que o
   * §5 usa como `topic` do Web Push. É ele que faz um aviso novo **substituir**
   * o anterior no aparelho, e é ele — e não um debounce de servidor (decisão
   * D) — que impede três atividades juntas de virarem três notificações.
   */
  it('tags every message with the kind in lower case', () => {
    expect(GROUP_ACTIVITY_TAG).toBe('group_activity');

    for (const type of ACTIVITY_TYPES) {
      const payload = buildGroupActivityMessage({
        locale: 'pt',
        bookId: 'book-1',
        type,
      });
      expect(payload.tag).toBe(GROUP_ACTIVITY_TAG);
    }
  });

  /**
   * ⚠️ **Decisão E — o clique cai na tela do LIVRO, pelo MESMO dono que o
   * lembrete usa** (`bookUrl`, em `reminder-message.ts`). Um segundo lugar que
   * soubesse escrever `/books/:bookId` seria a lição nº 3 do MVP 1 outra vez —
   * e o §2 é explícito: cair na tela errada não converte em leitura.
   */
  it('points the click at the book, escaping the id like the app does', () => {
    expect(
      buildGroupActivityMessage({
        locale: 'pt',
        bookId: 'book-99',
        type: 'FREE_NOTE',
      }).url,
    ).toBe('/books/book-99');

    expect(
      buildGroupActivityMessage({
        locale: 'pt',
        bookId: 'a/b',
        type: 'FREE_NOTE',
      }).url,
    ).toBe('/books/a%2Fb');
  });

  /**
   * ⚠️ **OS QUATRO NASCIMENTOS TÊM FRASES DIFERENTES, e a asserção é sobre a
   * DIFERENÇA** — não sobre "tem alguma coisa escrita".
   *
   * Um `Record<ActivityType, …>` com a mesma chave repetida quatro vezes
   * compilaria e passaria em qualquer teste que só olhasse `body.length > 0`:
   * o clube receberia "escreveu uma anotação" quando alguém grifou.
   */
  it('says something different for each of the four births', () => {
    const bodies = ACTIVITY_TYPES.map(
      (type: ActivityType) =>
        buildGroupActivityMessage({ locale: 'pt', bookId: 'book-1', type })
          .body,
    );

    expect(new Set(bodies).size).toBe(ACTIVITY_TYPES.length);
  });

  /**
   * ⚠️ **NADA DE CONTEÚDO NO PAYLOAD** (`NOTIFICACOES.md` §1), e a asserção é
   * sobre as CHAVES: o `PushPayload` tem quatro campos, e um quinto — um
   * `excerpt`, um `noteTitle` — é exatamente o que não pode nascer aqui.
   */
  it('carries the four fields of the payload and nothing else', () => {
    const payload = buildGroupActivityMessage({
      locale: 'pt',
      bookId: 'book-1',
      type: 'PLAN_NOTE',
    });

    expect(Object.keys(payload).sort()).toEqual([
      'body',
      'tag',
      'title',
      'url',
    ]);
  });

  /**
   * ⚠️ **A frase fala de OUTRA PESSOA, nunca de quem recebe** — é o que separa
   * um incentivo de uma cobrança (§1 do plano).
   *
   * A varredura anti-culpa do catálogo pega o vocabulário da dívida
   * ("atrasado", "pendente", "behind"); esta pega o outro lado, que é gramatical
   * e que nenhuma lista de radicais veria: um "você" no sujeito. "Você ainda não
   * escreveu hoje" não tem um único termo da lista.
   */
  it.each([
    ['pt', pt],
    ['en', en],
  ])(
    'never addresses the person who receives it, in %s',
    (_locale, catalog) => {
      const notice = catalog.notifications.groupActivity;
      // As QUATRO frases, sem o `title`: o título em inglês é "**Your** club is
      // reading", e ali o "your" fala do clube da pessoa, não dela.
      const bodies = [
        notice.planNote,
        notice.freeNote,
        notice.highlight,
        notice.read,
      ];

      for (const body of bodies) {
        for (const word of ['você', 'voce', 'you ', 'your ']) {
          expect(body.toLowerCase()).not.toContain(word);
        }
      }
    },
  );
});
