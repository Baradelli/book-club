import { describe, expect, it } from 'vitest';

import { CodeGeneratorFake } from '../code-generator-fake';

// A regra 6 (colisão de código, até 5 tentativas) só é testável se a sequência
// for previsível.
describe('CodeGeneratorFake', () => {
  it('returns a predictable sequence by default', () => {
    const codes = new CodeGeneratorFake();

    expect(codes.generate()).toBe('code-1');
    expect(codes.generate()).toBe('code-2');
    expect(codes.generate()).toBe('code-3');
  });

  it('returns the scripted codes in order', () => {
    const codes = new CodeGeneratorFake(['AAA', 'BBB']);

    expect(codes.generate()).toBe('AAA');
    expect(codes.generate()).toBe('BBB');
  });

  it('falls back to the default sequence after the script runs out', () => {
    const codes = new CodeGeneratorFake(['AAA']);
    codes.generate();

    expect(codes.generate()).toBe('code-2');
  });

  it('counts how many codes it generated', () => {
    const codes = new CodeGeneratorFake();
    codes.generate();
    codes.generate();

    expect(codes.calls).toBe(2);
  });
});
