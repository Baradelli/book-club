import type { CalendarDay } from './calendar-day';

/**
 * "Que dia é hoje" **do lado de quem olha a tela** — o helper que o
 * `CLAUDE.md` promete desde a Tarefa 12 e que nunca havia sido criado:
 * *"O front calcula 'que dia é hoje' com `Intl.DateTimeFormat` (helper
 * `local-day.ts` em `shared/`) para não empacotar Luxon no PWA."*
 *
 * ⚠️ **`Intl`, NUNCA `getFullYear`/`getMonth`/`getDate`** (regra 2).
 *
 * Os getters locais de `Date` respondem no fuso do PROCESSO, não no fuso
 * pedido: usá-los aqui reintroduz, no front, exatamente o bug que o
 * `calendar-day-mapper` do backend aprendeu por teste de mutação — "o plano do
 * dia 5 aparece no dia 4" em todo fuso negativo. E a rede estática do projeto
 * (o `no-restricted-syntax` do `eslint.config.js`) cobre só
 * `packages/backend/src/repositories`; aqui quem guarda a porta é
 * `__tests__/local-day.test.ts`, que arranca os getters do protótipo e exige
 * que a função continue respondendo.
 *
 * ⚠️ E o par com o BACKEND, que é a outra metade da regra do `CLAUDE.md`
 * ("nunca a hora do servidor"): no navegador, o fuso do ambiente **é** o fuso
 * de quem está lendo, e é isso que "hoje para mim" significa. No servidor não
 * há ninguém olhando, e é lá que o `Settings.timezone` é indispensável (o
 * lembrete da Tarefa 37). Este helper é do front; o backend continua com Luxon
 * e com o fuso guardado.
 *
 * Quando o `Settings` for exposto (Tarefa 36/46), a escolha explícita da pessoa
 * passa a ser o `timeZone` que chega aqui, e vence o do ambiente — é o caso de
 * quem viaja e quer continuar no fuso de casa. Até então, quem chama passa
 * `localTimeZone()`.
 */

/**
 * A locale FIXA do formatador, e cada subtag é uma decisão:
 *
 * - `-u-ca-gregory`: sem ela, a locale do ambiente pode resolver um calendário
 *   não-gregoriano (`th-TH` usa o budista, e o ano sairia 2569) — e o
 *   `ReadingPlanItem.date` é gregoriano por definição;
 * - `-u-nu-latn`: sem ela, um ambiente `ar-EG`/`bn-BD` formata os dígitos em
 *   numeral árabe-índico ou bengali, e `isCalendarDay` recusaria o resultado.
 *
 * É por isso que a montagem é por `formatToParts` e não por `format()`: o
 * separador e a ORDEM dos campos são propriedade da locale, e "YYYY-MM-DD" é
 * propriedade do nosso domínio.
 *
 * ⚠️ **EXPORTADA PARA SER ASSERTADA, e o mutante que ela fecha é o pior dos
 * cinco desta função.** MEDIDO: trocar esta constante por `undefined` (a locale
 * do ambiente) sobrevivia aos 12 testes originais, e em `th-TH` sai
 * **`2569-03-10`** — o ano budista. O `isCalendarDay` **aceita** aquilo (o
 * formato está certo, o ano está no intervalo), e então "hoje" **nunca casa**
 * nenhum `planItem.date`: o atalho da leitura de hoje desaparece em silêncio
 * para quem tem o navegador em tailandês. Nada na tela indica o motivo.
 */
export const FORMAT_LOCALE = 'en-US-u-ca-gregory-nu-latn';

/**
 * ⚠️ `month`/`day` em `'2-digit'` é o que garante os dois dígitos — e é a ÚNICA
 * garantia deles.
 *
 * Havia um `padStart(2, '0')` em cada um, e ele era **código morto que mascarava
 * o mutante**: com `'2-digit'` pedido, o `Intl` já devolve `"01"`, então apagar
 * o `padStart` sobrevivia; e com o `padStart` presente, trocar `'2-digit'` por
 * `'numeric'` também sobrevivia. Duas metades redundantes, e nenhum teste capaz
 * de distinguir qual delas trabalha. O `padStart` saiu, e agora
 * `zero-pads the month and the day via '2-digit'` mata a mutação de `PARTS`.
 *
 * O `year` é outro caso e o `padStart(4)` dele FICA: `'numeric'` não promete
 * quatro dígitos — ano 999 sai `"999"` (medido) —, e não existe opção de
 * `Intl` que o force.
 */
const PARTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

/**
 * O fuso do AMBIENTE que está rodando este código. No PWA é o do navegador —
 * o de quem está olhando a tela.
 *
 * Não lê `navigator` nem nada de navegador (`shared` é dependência do backend,
 * e `packages/shared/tsconfig.json` não tem `DOM` na `lib`): `Intl` resolve
 * isso sozinho, nos dois ambientes.
 */
export function localTimeZone(): string {
  return new Intl.DateTimeFormat(FORMAT_LOCALE).resolvedOptions().timeZone;
}

/**
 * O formatador do fuso pedido, ou `undefined` se o nome não for um fuso IANA.
 *
 * O `try` é estreito de propósito (regra 4): só a CONSTRUÇÃO do formatador
 * lança `RangeError` para um `timeZone` inválido, e é só isso que ele engole.
 * Um `catch` em volta da formatação inteira esconderia bug nosso.
 *
 * ⚠️ **O QUE O `Intl` ACEITA NÃO É "SÓ NOME IANA", e quem validar o
 * `Settings.timezone` um dia precisa saber disto.** MEDIDO neste Node:
 *
 * - `'UTC+3'` → **`RangeError`** (cai no fallback);
 * - `'+03:00'` → **ACEITO**, e desloca de verdade (`2026-03-10T23:00Z` sai
 *   `2026-03-11`).
 *
 * Ou seja: **"tem sinal ⇒ inválido" é falso.** Um validador de `Settings`
 * escrito com essa suposição recusaria um deslocamento legítimo, e um escrito
 * com a suposição oposta ("é string ⇒ o `Intl` resolve") aceitaria `'UTC+3'`.
 * A única checagem fiel é tentar construir o formatador — que é o que esta
 * função faz.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat | undefined {
  try {
    return new Intl.DateTimeFormat(FORMAT_LOCALE, { ...PARTS, timeZone });
  } catch {
    return undefined;
  }
}

/**
 * `Intl.DateTimeFormat` sem fuso nenhum: o do ambiente.
 *
 * É a última rede — o caso em que **também** o fuso de fallback é inválido.
 */
function environmentFormatter(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(FORMAT_LOCALE, PARTS);
}

function partOf(
  parts: readonly Intl.DateTimeFormatPart[],
  type: string,
): string {
  return parts.find((part) => part.type === type)?.value ?? '';
}

/**
 * O dia de calendário (`"YYYY-MM-DD"`) do `instant`, no `timeZone` dado.
 *
 * `timeZone` que não é um fuso IANA **não estoura**: cai no `fallbackTimeZone`
 * (regra 4). Um `Settings.timezone` corrompido, ou o erro de digitação clássico
 * (`'America/Sao Paulo'`, com espaço), não pode derrubar a primeira tela que o
 * app abre.
 *
 * ⚠️ **O FUSO DE FALLBACK É PARÂMETRO, e ele existe por causa de um mutante que
 * sobrevivia.** MEDIDO: fixar o fallback em `'UTC'` passava nos 12 testes
 * originais, porque o teste da regra 4 calculava o esperado com
 * `localTimeZone()` — os dois lados se autoajustavam e a asserção não escolhia
 * nada. Com o fuso injetável, o teste dá **dois** fusos diferentes e exige
 * **dois** dias diferentes, o que é indistinguível de qualquer constante.
 *
 * O padrão continua sendo o fuso do ambiente, que é o de quem está olhando a
 * tela. Quem chama de dentro do app não passa o terceiro argumento.
 *
 * ⚠️ **O QUE O TIPO DE RETORNO NÃO PROMETE.** `CalendarDay` é alias puro
 * (`type CalendarDay = string`, sem marca), então ele não valida nada — e a
 * saída daqui **pode** ser um dia que o `isCalendarDay` recusa. Dois casos
 * medidos, os dois fora da faixa que o projeto trata (`1583..9999`):
 *
 * - **ano < 1583:** `new Date('0999-01-05T12:00:00Z')` → `"0999-01-05"`, que o
 *   `isCalendarDay` **recusa** (ele exige ≥ 1583, o começo do calendário
 *   gregoriano);
 * - **antes de Cristo:** `new Date(-8.64e15)` (o menor `Date` possível) →
 *   `"271822-04-20"`, com o **sinal perdido** — o `Intl` formata a era à parte,
 *   e este helper não a lê. Um `-271821` viraria `"271822"`, um ano futuro.
 *
 * Nenhum dos dois é alcançável por `new Date()` num navegador, que é a única
 * chamada real: são bordas registradas para quem for reusar a função com um
 * instante vindo de fora.
 */
export function localDay(
  instant: Date,
  timeZone: string,
  fallbackTimeZone: string = localTimeZone(),
): CalendarDay {
  const formatter =
    formatterFor(timeZone) ??
    formatterFor(fallbackTimeZone) ??
    environmentFormatter();
  const parts = formatter.formatToParts(instant);

  // O `padStart` do ANO, e só dele: `year: 'numeric'` NÃO promete quatro
  // dígitos (ano 999 sai `"999"`, medido), e o formato canônico é o que
  // `isCalendarDay` — e a comparação por string com `ReadingPlanItem.date` —
  // exigem. `month`/`day` vêm de `'2-digit'` (ver `PARTS`).
  const year = partOf(parts, 'year').padStart(4, '0');
  const month = partOf(parts, 'month');
  const day = partOf(parts, 'day');

  return `${year}-${month}-${day}`;
}
