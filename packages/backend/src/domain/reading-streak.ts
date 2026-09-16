import type { CalendarDay } from '@clube/shared';

export interface ReadingStreakInput {
  /** Os dias do PLANO do clube, em qualquer ordem. Podem repetir. */
  planDays: readonly CalendarDay[];
  /** Os dias que a pessoa marcou como lidos, em qualquer ordem. */
  readDays: readonly CalendarDay[];
  /** O dia de hoje **no fuso da pessoa** — já resolvido pelo chamador. */
  today: CalendarDay;
}

/**
 * A CORRENTE DE LEITURA — quantos dias do plano, seguidos, a pessoa leu
 * (ADR 0010, o "foguinho").
 *
 * ⚠️ **PURA.** Não vai ao banco, não lê relógio e não sabe o que é fuso: o
 * `today` chega resolvido. Toda a correção da feature está aqui, e é aqui que
 * ela é barata de testar — o resto é encanamento.
 *
 * ## As quatro regras, e por que cada uma existe
 *
 * 1. ⚠️ **DIAS DO PLANO, não do calendário.** Um plano que pula domingo é
 *    normal; contar por calendário quebraria a corrente de quem fez tudo certo.
 *    Um dia que o plano não tem não existe para esta conta.
 * 2. ⚠️ **O FUTURO NÃO CONTA.** O plano do mês inteiro é cadastrado no dia 1 —
 *    sem este corte, os vinte dias por vir contariam como "não lidos" e a
 *    corrente seria sempre **zero**. A feature nasceria morta, e verde.
 * 3. ⚠️ **HOJE AINDA NÃO LIDO NÃO QUEBRA.** A pessoa ainda tem o dia. Sem isto
 *    o fogo apagaria toda manhã, e a primeira coisa que o app faria ao abrir
 *    seria dar uma má notícia **falsa**.
 * 4. **Leitura de dia que saiu do plano é ignorada**, não contada: contá-la
 *    inflaria a corrente com um dia que ninguém vê na tela.
 *
 * ⚠️ **Comparação de `CalendarDay` é comparação de STRING**, e é assim de
 * propósito em todo o projeto (decisão A da Tarefa 37): `"YYYY-MM-DD"` ordena
 * lexicograficamente igual à data. Nenhum `new Date` aqui — a Tarefa 37 mediu o
 * preço de esquecer isso, e o `CLAUDE.md` proíbe aritmética de data fora dos
 * dois helpers.
 */
export function computeReadingStreak(input: ReadingStreakInput): number {
  const read = new Set(input.readDays);

  // Ordenados e sem repetição: o chamador não promete ordem, e um dia repetido
  // no plano contaria duas vezes.
  const days = [...new Set(input.planDays)]
    .filter((day) => day <= input.today)
    .sort();

  let streak = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i];
    if (day === undefined) break;

    if (read.has(day)) {
      streak += 1;
      continue;
    }

    // Regra 3: o único dia que pode estar sem leitura sem apagar o fogo é HOJE,
    // e só porque ele ainda não acabou.
    if (day === input.today) continue;

    break;
  }

  return streak;
}
