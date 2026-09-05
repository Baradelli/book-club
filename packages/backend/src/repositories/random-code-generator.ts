import { randomInt } from 'node:crypto';

import type { CodeGenerator } from '../usecases/ports/code-generator';

// Base32 sem os caracteres ambíguos (0/O, 1/I/l): o código é digitável à mão
// quando o link quebra no WhatsApp.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 12;

export class RandomCodeGenerator implements CodeGenerator {
  generate(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      // randomInt (CSPRNG), não Math.random: o code é o segredo do convite.
      const char = CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
      // Inalcançável por construção (randomInt limita ao length), mas tratado
      // explicitamente: sob noUncheckedIndexedAccess o acesso é
      // `string | undefined`, e um `+=` silencioso viraria a substring
      // literal "undefined" dentro do código do convite.
      if (char === undefined) {
        throw new Error('unreachable: index outside CODE_ALPHABET');
      }
      code += char;
    }
    return code;
  }
}
