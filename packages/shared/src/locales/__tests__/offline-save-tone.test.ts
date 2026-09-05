import { describe, expect, it } from 'vitest';

import type { TranslationCatalog } from '../index';
import { en, pt } from '../index';

/**
 * ⚠️ **O TOM DOS DOIS ESTADOS QUE A TAREFA 21 CRIOU — GUARDADO NO CATÁLOGO.**
 *
 * Achado da auditoria: as frases de `queued` e `unconfirmed` **não tinham
 * acusador nenhum**. Reescrevê-las com tom de alarme e cobrança — literalmente
 * *"Não foi possível salvar agora. Tente salvar de novo, por favor."* — deixava
 * a suíte inteira verde, porque a única asserção era
 * `toBe(pt.pages.dayNote.save.queued)`: o esperado saía da mesma fonte que o
 * obtido, que é a asserção que se autoajusta do §7.8.
 *
 * ⚠️ **E ELE MORA AQUI, NÃO NA TELA** (§7.9: a guarda mora onde a propriedade é
 * decidível). Vocabulário é propriedade **do catálogo**: independe de estado,
 * roda nos DOIS locales — e todo teste de tela pina `pt`, então uma frase de
 * alarme em `en` embarcaria sem uma linha vermelha.
 *
 * É a mesma disciplina do `anti-guilt.test.ts` ao lado. A diferença é o
 * vocabulário proibido: lá é o da **cobrança**, aqui é o do **alarme** e o da
 * **ação exigida**. E a razão é concreta:
 *
 * - **`queued`**: a rede caiu, o texto está guardado e vai sozinho. Não houve
 *   falha, e não há nada para a pessoa fazer — pedir uma ação é dar a ela o
 *   trabalho que a fila existe para fazer;
 * - **`unconfirmed`**: o servidor **executou** (`ApiError` 2xx, §6.8). Dizer
 *   "não foi possível salvar" é falso, e "tente de novo" empurra a pessoa a
 *   gravar duas vezes a anotação que já está lá.
 */

/** `"não foi possível"` → `"nao foi possivel"`: nada aqui depende do acento. */
function withoutDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * O VOCABULÁRIO DO ALARME — a frase que afirma que deu errado.
 *
 * São radicais, não palavras (a lição do `GUILT_TERMS`): quem escrever a
 * próxima frase não leu esta lista.
 */
const ALARM_TERMS: readonly string[] = [
  // Português
  'nao foi possivel',
  'nao consegu', // não conseguimos · não conseguiu · não consegui
  'nao deu', // "não deu para salvar"
  'falh', // falha · falhou · falhando
  'erro',
  'problema',
  'perd', // perdeu · perdido
  // Inglês
  'could not',
  'couldn',
  'unable',
  'fail', // failed · failure
  'error',
  'problem',
  'lost',
];

/**
 * O VOCABULÁRIO DA AÇÃO EXIGIDA — a frase que manda a pessoa fazer algo.
 *
 * Nos dois estados não existe ação: no `queued` a fila envia sozinha, e no
 * `unconfirmed` o servidor já gravou.
 */
const DEMAND_TERMS: readonly string[] = [
  // Português (imperativos)
  'tente',
  'de novo',
  'novamente',
  'por favor',
  'salve ',
  'clique',
  'toque',
  'confira',
  'verifique',
  'atualize',
  'recarregue',
  // Inglês
  'try ',
  'again',
  'please',
  'click',
  'tap ',
  'check ',
  'refresh',
  'reload',
];

/** Os dois estados novos, nos dois locales. */
function offlinePhrases(
  catalog: TranslationCatalog,
): Array<[key: string, phrase: string]> {
  const save = catalog.pages.dayNote.save;
  return [
    ['pages.dayNote.save.queued', save.queued],
    ['pages.dayNote.save.unconfirmed', save.unconfirmed],
  ];
}

const catalogs: ReadonlyArray<readonly [string, TranslationCatalog]> = [
  ['pt', pt],
  ['en', en],
];

describe.each(catalogs)(
  '⚠️ the two offline save states never alarm and never demand — %s',
  (_locale, catalog) => {
    it('says something, in both keys', () => {
      // O lado positivo do par: sem ele, apagar as frases deixaria toda
      // varredura abaixo verde sobre a string vazia (§7.4).
      for (const [key, phrase] of offlinePhrases(catalog)) {
        expect(phrase.length, key).toBeGreaterThan(10);
      }
    });

    it('never says that something went wrong', () => {
      for (const [key, phrase] of offlinePhrases(catalog)) {
        const spoken = withoutDiacritics(phrase);
        for (const term of ALARM_TERMS) {
          expect(spoken, `${key} · ${term}`).not.toContain(term);
        }
      }
    });

    it('never asks the person to do anything', () => {
      for (const [key, phrase] of offlinePhrases(catalog)) {
        const spoken = withoutDiacritics(phrase);
        for (const term of DEMAND_TERMS) {
          expect(spoken, `${key} · ${term}`).not.toContain(term);
        }
      }
    });

    it('is NOT the phrase of the save that failed', () => {
      // O mutante mais barato de todos: copiar `failed` para as duas chaves.
      // Ele passaria pelas varreduras de vocabulário só se alguém reescrevesse
      // o `failed` — e aí este par é quem acusa.
      const { failed, queued, unavailable, unconfirmed } =
        catalog.pages.dayNote.save;
      expect(queued).not.toBe(failed);
      expect(queued).not.toBe(unavailable);
      expect(unconfirmed).not.toBe(failed);
      expect(unconfirmed).not.toBe(unavailable);
      expect(queued).not.toBe(unconfirmed);
    });
  },
);
