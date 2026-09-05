/**
 * Remove do patch as chaves cujo valor é `undefined`.
 *
 * Fidelidade ao Prisma: lá `undefined` significa "não mexe neste campo", e
 * `null` significa "grave nulo". O spread do JS não faz essa distinção — ele
 * copia a chave com valor `undefined` e apaga o valor existente. Sem este
 * filtro o fake mentiria sobre `update(id, { campo: undefined })`.
 */
export function withoutUndefined<T extends object>(
  patch: Partial<T>,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
