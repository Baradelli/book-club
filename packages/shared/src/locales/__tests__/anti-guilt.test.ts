import { describe, expect, it } from 'vitest';

import { en, pt } from '../index';
import { GUILT_TERMS } from './guilt-terms';

/**
 * ⚠️ **O PRINCÍPIO ANTI-CULPA, GUARDADO NO CATÁLOGO** —
 * `docs/plano-clube-do-livro.md` §1: *"o sistema **não pune ausência de
 * registro**; valoriza qualquer registro útil. Quem está atrasado não vê dívida
 * vermelha nem 'você falhou 3 dias' — vê a leitura de hoje e um convite para
 * escrever."*
 *
 * ⚠️ **POR QUE AQUI, E NÃO SÓ NA TELA.** A primeira guarda deste princípio foi
 * uma varredura de DOM na home (`pages/__tests__/home.test.tsx`), e a auditoria
 * mediu que ela era em boa parte teatral: **três de quatro** cobranças plantadas
 * sobreviveram aos 192 testes. Duas das três falhas eram do LUGAR, não da lista:
 *
 * 1. **estado.** A varredura rodava em 6 dos 13 estados da home, e não no estado
 *    **com atalho** — que é exatamente onde um "você deixou 3 dias para trás"
 *    nasceria, ao lado da leitura de hoje. Uma guarda que depende de alguém
 *    lembrar de chamá-la no estado novo não é guarda;
 * 2. **locale.** Todo teste de tela pina `pt` (o `navigator.language` do jsdom é
 *    `en-US`, e sem o pino as asserções mudariam com o ambiente). Então um
 *    `"You're 3 days behind"` no catálogo `en` embarcava sem uma linha vermelha
 *    — e `en` é metade dos idiomas que o app declara suportar.
 *
 * O vocabulário da cobrança é propriedade **do catálogo**: são strings, não
 * comportamento. Aqui ele é varrido inteiro, nos DOIS locales, sem renderizar
 * nada — independente de estado, independente de tela, e impossível de esquecer.
 *
 * O que continua na tela: o que **não** vem de catálogo. Um "0 de 30 dias"
 * renderizado a partir de dado, e a COR (um ponto vermelho ao lado do dia sem
 * anotação cobra sem escrever nada). Essa é a divisão.
 */

/**
 * ⚠️ **A EXCEÇÃO DECLARADA: `'voce nao'` NÃO está na lista acima.**
 *
 * `errors.forbidden` é *"Você não tem permissão para fazer isso."* — uma recusa
 * de autorização, que não tem nada a ver com ausência de registro. O termo
 * continua guardado onde ele É cobrança: a varredura de DOM da home, que só vê
 * as frases daquela tela.
 *
 * Está escrito porque a alternativa (isentar a chave) envelhece: uma isenção por
 * chave viraria uma lista de chaves que alguém amplia para calar o teste.
 */

/** `"você não"` → `"voce nao"`: a varredura não pode depender do acento. */
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

describe('the anti-guilt principle is a property of the CATALOGS (plano §1)', () => {
  it.each([
    ['pt', pt],
    ['en', en],
  ])('has no word of debt, delay or streak in %s', (_locale, catalog) => {
    const leaves = entries(catalog);

    /*
      ⚠️ A GUARDA CONTRA A VARREDURA VAZIA (§7.4): sem esta linha, um `entries`
      quebrado devolvendo `[]` deixaria o `toEqual([])` abaixo verde — o teste
      diria "o catálogo não cobra" provando "o catálogo não existe".
    */
    expect(leaves.length).toBeGreaterThan(20);

    const offenders = leaves.flatMap(([path, text]) => {
      const normalized = withoutDiacritics(text);
      return GUILT_TERMS.filter((term) => normalized.includes(term)).map(
        (term) => `${path}: "${text}" (termo "${term}")`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('would catch the phrases the audit walked through, in both languages', () => {
    /*
      ⚠️ O LADO POSITIVO DO PAR, e ele é o que impede a lista de virar decoração:
      um `GUILT_TERMS` esvaziado (ou um `includes` invertido) deixaria o teste
      acima verde para sempre. Estas são as frases MEDIDAS que passaram pela
      varredura antiga — as duas primeiras em português, e a terceira é a que
      embarcava em `en` porque nenhum teste de tela sai do `pt`.
    */
    const planted = [
      'Você deixou 3 dias para trás',
      'Suas leituras em atrazo: 3',
      "You're 3 days behind on this book",
      'Você tem 2 leituras pendentes',
      'Your streak: 0 days',
    ];

    for (const phrase of planted) {
      const normalized = withoutDiacritics(phrase);
      expect(GUILT_TERMS.some((term) => normalized.includes(term))).toBe(true);
    }
  });
});
