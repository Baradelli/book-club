/**
 * Normaliza um campo de texto opcional: `undefined`, `null` ou só-espaços viram
 * `null`; o resto vem sem as pontas.
 *
 * Extraído de dentro do `createBook` porque três lugares precisam exatamente
 * desta semântica — `author`/`coverUrl` do livro (`createBook` e `editBook`) e
 * `reference` do item do plano (`normalizePlanDrafts`). Triplicar a regra é
 * como um deles passa a gravar `''` em vez de `null`.
 */
export function optionalText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
