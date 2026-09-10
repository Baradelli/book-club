/**
 * O `text` de um filtro como um padrão de `LIKE`/`ILIKE` que casa **substring
 * literal** — **uma implementação só, para os dois repositórios Prisma.**
 *
 * ## O que esta função É
 *
 * A codificação de **uma regra do Postgres**: `%` e `_` dentro do parâmetro de
 * um `LIKE`/`ILIKE` são **curinga**, e o `Prisma.contains` passa o valor como
 * parâmetro. Medido no Postgres 16 deste projeto, e o teste de contrato do
 * `PrismaNoteRepository` mantém a medição viva
 * (`states the precondition: % and _ are wildcards inside an ILIKE parameter`):
 *
 * ```
 * SELECT 'axb' ILIKE '%a_b%'             →  true
 *        '100% garantido' ILIKE '%100%%' →  true
 * ```
 *
 * Sem escape, quem digitasse `p. 100%` receberia toda nota que contém `p. 100`,
 * **em silêncio**: nada na tela anuncia sintaxe de padrão.
 *
 * Um `replace` só, e é por isso que a ordem funciona: um `replace` único nunca
 * revisita o que inseriu, então a `\` que ele escapa não é re-escapada.
 *
 * O Postgres honra `\` como escape default de `LIKE`/`ILIKE` sem cláusula
 * `ESCAPE`, que é exatamente o SQL que o Prisma gera.
 *
 * ## Por que é COMPARTILHADA, e não uma cópia por repositório
 *
 * Ela nasceu dentro do `prisma-note-repository.ts` (Tarefa 11, quando havia um
 * chamador só) e a busca de grifo da Tarefa 29 trouxe o segundo. Copiá-la seria
 * a **lição nº 3 do MVP 1** pela quarta vez nesta sessão — e a saída medida da
 * Tarefa 23, para o caso gêmeo (`matches`, a igualdade contra coluna anulável),
 * foi **extrair**: o que está duplicado não é política de repositório nenhum, é
 * uma regra do **banco**, e os dois repositórios delegam essa regra ao **mesmo**
 * Postgres. Este arquivo não acopla `Note` a `Highlight`; acopla os dois ao
 * `LIKE` do Postgres, que é onde o acoplamento verdadeiramente está.
 * → `docs/CONVENCOES-CODIGO.md` §7.1 (a saída da 4ª aparição) e o docblock de
 * `usecases/_fakes/sql-equality.ts`, que é o mesmo padrão do lado dos fakes.
 *
 * ## Onde a propriedade é PROVADA
 *
 * Não há suíte própria, de propósito — e é o mesmo argumento do
 * `sql-equality.ts`: uma suíte aqui compraria **zero** acusador novo, porque
 * `%`, `_` e `\` como literais **só são decidíveis contra o Postgres** (para o
 * fake eles já são literais, então o bug é invisível em memória). A prova mora
 * nos dois testes de contrato:
 *
 * - `prisma-note-repository.contract.integration.test.ts` —
 *   `treats % and _ in the query as literal characters` e
 *   `treats a backslash in the query as a literal character`;
 * - `prisma-highlight-repository.contract.integration.test.ts` —
 *   `treats % and _ in the text query as literal characters` e
 *   `treats a backslash in the text query as a literal character`.
 *
 * **O fake não muda por causa daqui**: depois do escape, o contrato do port é
 * "substring literal, case-insensitive, accent-sensitive" — o que o
 * `matchesText` de `usecases/_fakes/sql-equality.ts` já faz. Emular curinga no
 * fake seria modelar um detalhe de uma camada **abaixo** do port.
 */
export function toLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
