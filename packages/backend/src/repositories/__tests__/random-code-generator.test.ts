import { describe, expect, it } from 'vitest';

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  RandomCodeGenerator,
} from '../random-code-generator';

// O formato do código é decisão da spec (12 caracteres base32 sem ambíguos) e
// não tem contrato no port `CodeGenerator` — este é o único lugar onde ele
// pode ser exigido.
const AMBIGUOUS = ['0', 'O', '1', 'I', 'l'];
const SAMPLES = 200;

function sample(times = SAMPLES): string[] {
  const codes = new RandomCodeGenerator();
  return Array.from({ length: times }, () => codes.generate());
}

describe('RandomCodeGenerator', () => {
  it('declares a 12-character code', () => {
    expect(CODE_LENGTH).toBe(12);
  });

  it('uses the base32 alphabet without ambiguous characters', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
  });

  it('generates codes with exactly 12 characters', () => {
    for (const code of sample()) {
      expect(code).toHaveLength(12);
    }
  });

  it('generates codes using only the declared alphabet', () => {
    for (const code of sample()) {
      for (const char of code) {
        expect(CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('never emits an ambiguous character', () => {
    for (const code of sample()) {
      for (const ambiguous of AMBIGUOUS) {
        expect(code).not.toContain(ambiguous);
      }
    }
  });

  it('does not repeat itself across many draws', () => {
    const codes = sample();

    expect(new Set(codes).size).toBe(codes.length);
  });

  // Sanidade de entropia: com 31^12 possibilidades, um gerador que travasse
  // num caractere só (ou usasse um alfabeto degenerado) cairia aqui.
  it('draws from the whole alphabet, not a corner of it', () => {
    const used = new Set(sample().join(''));

    expect(used.size).toBeGreaterThan(CODE_ALPHABET.length / 2);
  });
});
