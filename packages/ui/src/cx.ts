/**
 * Junta classes, ignorando o que não é classe.
 *
 * Decisão A da Tarefa 13: `clsx` + `class-variance-authority` resolvem melhor
 * em projeto grande, mas o `CLAUDE.md` fixa a stack e seis componentes não
 * justificam duas dependências de runtime. Isto é o subconjunto que os seis
 * usam: strings condicionais.
 *
 * ⚠️ Ele NÃO resolve conflito de utilitário (não é `tailwind-merge`): passar
 * `p-2` e `p-4` deixa os dois no atributo e quem decide é a ordem no CSS
 * compilado, não a ordem aqui. Por isso todo componente monta a lista base
 * ANTES do `className` de fora — o de fora vem por último, mas continua
 * valendo só quando não briga com nada.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...values: ClassValue[]): string {
  return values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value !== '')
    .join(' ');
}
