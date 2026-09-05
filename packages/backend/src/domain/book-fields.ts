import { isClubMonth } from '@clube/shared';

import { InvalidBookError } from './errors';

/**
 * As validações dos campos escalares do `Book`, num lugar só.
 *
 * Extraídas porque `createBook` e `editBook` aplicavam a MESMA regra com a
 * MESMA mensagem, em dois arquivos — e as tabelas `it.each` dos dois testes
 * eram cópias uma da outra, então divergiriam juntas e em silêncio. É o mesmo
 * motivo que tirou `normalizePlanDrafts` e `optionalText` do `createBook`.
 *
 * A distinção `undefined` (ausência) × `null` (limpar) NÃO mora aqui: ela é do
 * chamador, porque só ele sabe se está criando (ausente = default) ou editando
 * (ausente = não mexe).
 */

/** Título obrigatório, sem as pontas. Vazio ou só-espaços é erro. */
export function normalizeBookTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') {
    throw new InvalidBookError('book title must not be empty');
  }
  return trimmed;
}

/** Confere o "YYYY-MM" do mês do clube. Não normaliza — não há o que aparar. */
export function assertClubMonth(month: string): void {
  if (!isClubMonth(month)) {
    throw new InvalidBookError(
      `book month ${JSON.stringify(month)} is not a "YYYY-MM" club month`,
    );
  }
}

/**
 * Total de páginas: inteiro positivo ou `null`.
 *
 * `undefined` vira `null` para o `createBook` (campo ausente = sem valor); o
 * `editBook` só chega aqui quando a chave existe no input, então o `null` que
 * ele passa é o "limpar o campo" explícito.
 */
export function normalizeTotalPages(
  value: number | null | undefined,
): number | null {
  const totalPages = value ?? null;
  if (
    totalPages !== null &&
    (!Number.isInteger(totalPages) || totalPages <= 0)
  ) {
    throw new InvalidBookError('totalPages must be a positive integer');
  }
  return totalPages;
}
