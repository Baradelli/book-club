import type { CodeGenerator } from '../ports/code-generator';

// Sequência previsível: `code-1`, `code-2`, ... ou os códigos roteirizados no
// construtor, que é como a regra 6 (colisão) fica determinística.
export class CodeGeneratorFake implements CodeGenerator {
  private index = 0;

  constructor(private readonly scripted: readonly string[] = []) {}

  generate(): string {
    const code = this.scripted[this.index] ?? `code-${this.index + 1}`;
    this.index += 1;
    return code;
  }

  get calls(): number {
    return this.index;
  }
}
