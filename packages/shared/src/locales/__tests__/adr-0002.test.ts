import { describe, expect, it } from 'vitest';

import { en, pt } from '../index';
import { mentionsPrivacyTerm, PRIVACY_TERMS } from './privacy-terms';

/**
 * ⚠️ **O ADR 0002, GUARDADO NO CATÁLOGO** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`: *"Não existe conteúdo privado
 * dentro de um clube. (…) O filtro `Tudo · Minhas · de <pessoa>` é
 * **navegação**: uma forma de olhar o mesmo acervo. Ele nunca deve ser
 * apresentado, rotulado ou explicado como privacidade."*
 *
 * ⚠️ **POR QUE AQUI, E ELE É O IRMÃO DO `anti-guilt.test.ts`.** A Tarefa 16
 * subiu o vocabulário **anti-culpa** para o catálogo pelo motivo exato que
 * também vale aqui — e deixou a **privacidade** só no DOM. Medido nesta rodada:
 *
 * | Onde | Frase plantada | Acusadores |
 * |---|---|---|
 * | `pt` | `person: 'De {{name}} (só você vê)'` | **12** |
 * | `en` | `person: 'By {{name}} (only you can see this)'` | **0** de 1.146 |
 *
 * A causa é a do §7.9, e é de LOCALE, não de lista: **todo teste de tela pina
 * `pt`** (o `navigator.language` do jsdom é `en-US`), então a varredura de DOM
 * nunca vê o catálogo `en` — metade dos idiomas que o app declara suportar. Uma
 * guarda que depende do locale de quem escreveu o teste não é guarda.
 *
 * Aqui os dois catálogos são varridos INTEIROS, sem renderizar nada:
 * independente de estado, de tela e de locale, e impossível de esquecer num
 * estado novo.
 *
 * O que continua na tela: o que **não** vem de catálogo — a frase que entrou no
 * JSX sem passar pelo `t()`, o desenho (`<svg>` inline) e o ícone importado do
 * `lucide-react`, que não têm chave nenhuma para esta varredura ler.
 */

/** `"só você"` → `"so voce"`: a varredura não pode depender do acento. */
function withoutDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Toda folha do catálogo, com o caminho `a.b.c` que o `t()` receberia. */
function entries(value: unknown, prefix = ''): Array<[string, string]> {
  if (typeof value === 'string') return [[prefix, value]];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    entries(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('the ADR 0002 is a property of the CATALOGS, in BOTH locales', () => {
  it.each([
    ['pt', pt],
    ['en', en],
  ])('promises no restricted visibility in %s', (_locale, catalog) => {
    const leaves = entries(catalog);

    /*
      ⚠️ A GUARDA CONTRA A VARREDURA VAZIA (§7.4): sem esta linha, um `entries`
      quebrado devolvendo `[]` deixaria o `toEqual([])` abaixo verde — o teste
      diria "o catálogo não promete privacidade" provando "o catálogo não
      existe".
    */
    expect(leaves.length).toBeGreaterThan(20);

    const offenders = leaves.flatMap(([path, text]) => {
      const normalized = withoutDiacritics(text);
      return PRIVACY_TERMS.filter((term) =>
        mentionsPrivacyTerm(normalized, term),
      ).map((term) => `${path}: "${text}" (termo "${term}")`);
    });

    expect(offenders).toEqual([]);
  });

  it('would catch the phrase the audit measured, in both languages', () => {
    /*
      ⚠️ O LADO POSITIVO DO PAR (§7.3): uma lista esvaziada — ou um matcher
      invertido — deixaria o teste acima verde para sempre. A terceira frase é a
      MEDIDA desta rodada: ela dava 0 acusadores no `en` e 12 no `pt`, e é a
      mais tentadora de todas, porque "De Maria" parece pedir explicação.
    */
    const planted = [
      'Só você vê esta anotação',
      'Anotação privada',
      'Visível para: você',
      'By Maria (only you can see this)',
      'This note is private to you',
      'Hidden from the club',
    ];

    for (const phrase of planted) {
      const normalized = withoutDiacritics(phrase);
      expect(
        PRIVACY_TERMS.some((term) => mentionsPrivacyTerm(normalized, term)),
      ).toBe(true);
    }
  });

  it('⚠️ vetoes no legitimate word — the anchor is measured, not chosen by taste', () => {
    /*
      ⚠️ **A LIÇÃO DA TAREFA 19, E ELA É A RAZÃO DESTE TESTE EXISTIR.** O radical
      `tras` (largo demais) casava dentro de "ou**tras**", e a guarda passou a
      MANDAR NO TEXTO DO PRODUTO — o rótulo do filtro teve de virar outra frase
      para calar um teste que estava errado. Ampliar guarda é bom; ampliar até
      ela vetar palavra inocente é como uma guarda morre: alguém a enfraquece
      inteira, ou contorna o produto.

      Estas são as palavras legítimas que os catálogos usam (ou usariam) e que um
      radical mal escolhido acusaria — a âncora à esquerda é o que as salva.
    */
    for (const innocent of [
      'isso você escreveu ontem', // contém "so voc" no MEIO de "isso você"
      'Nada por aqui com este filtro.',
      'Toque em "Nova anotação" para escrever a primeira.',
      'Someone in the club',
      'By other people',
      'Preferências do clube',
      'Isso não é visível daqui', // "visivel" sozinho não é termo: só com "para"/"so"
    ]) {
      const normalized = withoutDiacritics(innocent);
      expect(
        PRIVACY_TERMS.some((term) => mentionsPrivacyTerm(normalized, term)),
      ).toBe(false);
    }
  });
});
