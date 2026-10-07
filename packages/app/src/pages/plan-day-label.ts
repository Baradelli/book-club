/**
 * O RÓTULO DO DIA DO PLANO NO GRIFO — Tarefa 48a, decisões E, F e O.
 *
 * Um dono só para o formato `DD/MM · tema`, que três lugares desenham: o
 * `<select>` da "Referência" no formulário de grifo, a linha do acervo e a
 * margem de prévia do formulário. Três cópias do formato divergiriam no
 * primeiro retoque, e a prévia — que promete "como vai aparecer no acervo" —
 * mentiria sem nenhum vermelho.
 *
 * ⚠️ **A DATA É FATIADA DA STRING, NUNCA LIDA COM `Date`** (decisão O, e a
 * regra de datas do `CLAUDE.md`). `"YYYY-MM-DD"` é um dia de CALENDÁRIO, não
 * um instante: `new Date('2026-10-01')` é meia-noite UTC, que em
 * `America/Sao_Paulo` ainda é **30/09** — o rótulo erraria o dia em todo
 * primeiro do mês. O acusador é
 * `plan-day-label.test.ts › keeps the first day of the month on the first`.
 *
 * ⚠️ **"06/10" TEM A FORMA DE PLACAR ("3/30") para a varredura anti-culpa, e
 * passa por ela por DECISÃO DO DONO (2026-10-07, perguntado diretamente):**
 * manter o formato e isentá-lo, em vez de "7 out · tema". A isenção é
 * estreita — forma exata e só em elemento marcado com `data-plan-day-label`
 * —, e quem a define é `PLAN_DAY_LABEL_SHAPE`, em
 * `__tests__/anti-guilt-dom.ts`. Quem renderiza o rótulo MARCA o elemento
 * (o `<option>`, a linha do acervo e a prévia); texto que não é dia do plano
 * (o "Sem dia", a referência antiga) não leva a marca.
 */

/** O que o rótulo precisa de um dia do plano — e nada mais. */
export interface LabelledPlanDay {
  id: string;
  /** `"YYYY-MM-DD"` — o `CalendarDay` do contrato. */
  date: string;
  title: string;
}

/** `"2026-10-07"` + `"Cap. 3"` → `"07/10 · Cap. 3"`. */
export function planDayLabel(
  day: Pick<LabelledPlanDay, 'date' | 'title'>,
): string {
  return `${day.date.slice(8, 10)}/${day.date.slice(5, 7)} · ${day.title}`;
}

/** O que a linha e a prévia desenham: o texto, e se ele é um DIA do plano. */
export interface PlaceLabel {
  text: string;
  /** `true` = é `DD/MM · tema`, e o elemento leva `data-plan-day-label`. */
  planDay: boolean;
}

/**
 * ⚠️ **A PRECEDÊNCIA DA DECISÃO F, num dono só para a linha e a prévia.**
 *
 * O dia do plano, quando o grifo tem um **e a tela o conhece**; senão o texto
 * antigo de `reference` (decisão C: ele fica no banco, só leitura); senão
 * nada — sem rótulo órfão, como a página.
 *
 * "A tela o conhece" é a ressalva honesta: o acervo carrega o plano numa
 * requisição separada, e se ela falhou o grifo continua tendo dia mas a tela
 * não tem como escrevê-lo. Cai no texto antigo — nunca no id cru.
 */
export function highlightPlaceLabel(
  highlight: { planItemId: string | null; reference: string | null },
  days: readonly LabelledPlanDay[],
): PlaceLabel | null {
  const day =
    highlight.planItemId === null
      ? undefined
      : days.find((candidate) => candidate.id === highlight.planItemId);
  if (day !== undefined) return { text: planDayLabel(day), planDay: true };
  return highlight.reference === null
    ? null
    : { text: highlight.reference, planDay: false };
}
