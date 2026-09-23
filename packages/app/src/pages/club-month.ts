import { isClubMonth } from '@clube/shared';

/**
 * ⚠️ **O MÊS DO CLUBE POR EXTENSO — UM DONO SÓ, PARA AS DUAS TELAS.**
 *
 * `"2026-09"` → "setembro de 2026", no idioma da tela.
 *
 * ⚠️ **POR QUE ELE SE MUDOU PARA CÁ, e é a lição nº 3 do MVP 1 outra vez.**
 * Ele nasceu dentro do `home.tsx` (Tarefa 16) e ficou lá até a rodada de
 * correção da Tarefa 44. A Tarefa 44 quis a mesma frase na linha de mono do
 * cabeçalho do livro — o slot que `Livro.dc.html:50` ocupa com "Setembro de
 * 2026 · 288 p." — e a execução daquela fatia afirmou, em **três** lugares,
 * que *"o mês por extenso seria chave NOVA"*, tratando-a como proibida pela
 * regra 9. **A afirmação era falsa e foi medida:** esta função já formatava o
 * mês inteiro com `Intl`, sem chave nenhuma, e `book.month` já vem no
 * `bookResponseSchema` que a tela do livro carrega.
 *
 * A saída é a que o §7.1 manda quando uma regra aparece no segundo chamador:
 * **extrair, não copiar**. Duas cópias divergiriam na primeira correção — e
 * aqui a "correção" provável é o `timeZone`, que tem um bug de um dia
 * esperando por quem esquecer.
 *
 * ⚠️ **`isClubMonth` ANTES DE FORMATAR, e não é zelo:** o `bookResponseSchema`
 * declara `month: z.string()` (não o `clubMonth` refinado), então um mês
 * malformado chegaria aqui, faria um `Invalid Date`, e o `Intl` **lançaria** —
 * apagando a tela por causa de uma linha do banco. Sem o formato canônico,
 * mostra o valor cru: feio é melhor que branco.
 *
 * ⚠️ **`timeZone: 'UTC'` porque o instante é meia-noite UTC do dia 1:** em
 * qualquer fuso negativo, formatar no fuso local devolveria o mês ANTERIOR — o
 * mesmo bug de um dia que o `localDay` existe para não cometer.
 */
export function formatClubMonth(month: string, locale: string): string {
  if (!isClubMonth(month)) return month;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00.000Z`));
}
