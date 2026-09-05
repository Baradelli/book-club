import { describe, expect, it } from 'vitest';

import { isCalendarDay } from '../calendar-day';
import { FORMAT_LOCALE, localDay, localTimeZone } from '../local-day';

/**
 * `localDay` — REGRAS 1 A 5 DA TAREFA 16.
 *
 * É o helper que o `CLAUDE.md` promete desde a Tarefa 12 ("o front calcula
 * 'que dia é hoje' com `Intl.DateTimeFormat` — helper `local-day.ts` em
 * `shared/`") e que nunca havia sido criado. Ele é puro: nenhum teste daqui
 * precisa de DOM, e o pacote não tem `DOM` na `lib` (o `Intl` está em `ES2022`).
 */

/**
 * ⚠️ **OS DOIS SENTIDOS DA MEIA-NOITE PRECISAM DE DOIS INSTANTES**, e a conta
 * que prova isso vale ficar escrita: `Asia/Tokyo` é UTC+9 e
 * `America/Sao_Paulo` é UTC−3 (sem horário de verão desde 2019), doze horas de
 * distância. Para o MESMO instante ser "já amanhã" em Tóquio a hora UTC tem de
 * ser ≥ 15h, e para ser "ainda ontem" em São Paulo tem de ser < 3h — não existe
 * instante que satisfaça as duas. A primeira versão desta fixture tentou, e o
 * vermelho foi o que denunciou a aritmética.
 *
 * Então são dois, escolhidos para a implementação errada FALHAR (§7.2) — em
 * particular a que ignora o `timeZone` e responde no fuso do processo, que é a
 * forma que o `getFullYear`/`getMonth`/`getDate` da regra 2 produz:
 *
 * - `AHEAD` (16h UTC): Tóquio já **virou** (dia +1), São Paulo e UTC não;
 * - `BEHIND` (2h UTC): São Paulo **ainda não virou** (dia −1), Tóquio e UTC já.
 *
 * Nenhum dos dois é meio-dia de propósito: às 12:00Z os três fusos concordam, e
 * um teste escrito ali passaria com o fuso jogado fora.
 */
const AHEAD = new Date('2026-03-10T16:00:00.000Z');
const BEHIND = new Date('2026-03-10T02:00:00.000Z');

const TOKYO = 'Asia/Tokyo';
const SAO_PAULO = 'America/Sao_Paulo';

describe('localDay (rules 1, 2, 3, 5)', () => {
  it('gives the calendar day of the instant in the zone it was given (rule 1)', () => {
    expect(localDay(new Date('2026-09-04T15:00:00.000Z'), SAO_PAULO)).toBe(
      '2026-09-04',
    );
  });

  it('crosses midnight FORWARD: 16:00Z is already tomorrow in Tokyo (rule 3)', () => {
    expect(localDay(AHEAD, TOKYO)).toBe('2026-03-11');
    // A precondição pinada (§7.2): o fuso positivo empurra o dia, e os dois
    // fusos DISCORDAM neste instante. Se um dia coincidirem, esta fixture
    // perdeu o poder de acusar e o vermelho apontaria para o lugar errado.
    expect(localDay(AHEAD, SAO_PAULO)).toBe('2026-03-10');
  });

  it('crosses midnight BACKWARD: 02:00Z is still yesterday in São Paulo (rule 3)', () => {
    /*
      O outro sentido, e ele é a metade que decide: com só o de cima, um
      `localDay` que somasse um dia fixo passaria. Aqui o fuso NEGATIVO tem de
      puxar o dia para trás.
    */
    expect(localDay(BEHIND, SAO_PAULO)).toBe('2026-03-09');
    expect(localDay(BEHIND, TOKYO)).toBe('2026-03-10');
  });

  it('answers in the zone it was given, not in the zone of the process (rule 2)', () => {
    /*
      A prova de que o parâmetro MANDA — e é ela que mata o mutante que troca
      `Intl` pelos getters locais: nos dois instantes, `UTC` é o `2026-03-10` do
      meio, e os dois fusos do projeto caem um para cada lado.

      A suíte roda em fuso desconhecido (o CI está em UTC, a máquina do dono em
      UTC−3), então nenhuma asserção daqui pode depender do fuso do ambiente.
    */
    expect(localDay(AHEAD, 'UTC')).toBe('2026-03-10');
    expect(localDay(BEHIND, 'UTC')).toBe('2026-03-10');
    expect(localDay(AHEAD, TOKYO)).not.toBe(localDay(AHEAD, 'UTC'));
    expect(localDay(BEHIND, SAO_PAULO)).not.toBe(localDay(BEHIND, 'UTC'));
  });

  it("zero-pads the month and the day via '2-digit' (rule 1)", () => {
    /*
      O formato é canônico ou não serve: `2026-1-5` não casa `isCalendarDay`, e
      a comparação com `ReadingPlanItem.date` é por STRING.

      ⚠️ O NOME ANTERIOR ERA "zero-pads month and day", e ele prometia mais do
      que provava: havia um `padStart(2, '0')` no mês, um no dia, E o
      `'2-digit'` no `PARTS` — três metades redundantes para duas posições.
      MEDIDO: apagar um `padStart` sobrevivia (o `'2-digit'` já dava dois
      dígitos), e trocar `'2-digit'` por `'numeric'` também (o `padStart`
      cobria). O teste provava a COMPOSIÇÃO, não as metades — e "prova a
      composição" é outro nome para "não sei qual das duas funciona".

      Os dois `padStart` saíram do `local-day.ts`. Agora esta asserção mata a
      mutação de `PARTS`, que é a única que sobrou.
    */
    expect(localDay(new Date('2026-01-05T12:00:00.000Z'), 'UTC')).toBe(
      '2026-01-05',
    );
  });

  it('zero-pads the YEAR to four digits, which no Intl option promises (rule 1)', () => {
    /*
      A outra metade, e ela é a que o `Intl` NÃO dá: `year: 'numeric'` devolve
      `"999"` para o ano 999 (medido), e não existe opção que force quatro
      dígitos. É por isso que o `padStart(4, '0')` do ano fica, e é este teste
      que o pina — sem ele, apagá-lo sobrevive.

      ⚠️ E note que a saída **não** é um `CalendarDay` válido: o
      `isCalendarDay` exige ano ≥ 1583. O tipo de retorno é alias puro e não
      promete nada; a faixa que o projeto trata está registrada no docblock de
      `localDay`. Aqui o assunto é a FORMA.
    */
    expect(localDay(new Date('0999-01-05T12:00:00.000Z'), 'UTC')).toBe(
      '0999-01-05',
    );
    expect(isCalendarDay('0999-01-05')).toBe(false);
  });

  it('pins the calendar and the numbering system in the LOCALE itself', () => {
    /*
      ⚠️ **O MUTANTE MAIS PERIGOSO DESTA FUNÇÃO** (medido): trocar
      `FORMAT_LOCALE` por `undefined` — a locale do ambiente — sobrevivia aos 12
      testes originais. Em `th-TH` o resultado é `2569-03-10`, o ano budista: o
      `isCalendarDay` ACEITA (a forma está certa, o ano está na faixa) e "hoje"
      nunca casa nenhum `planItem.date`. O atalho da leitura de hoje desaparece
      em silêncio para quem tem o navegador em tailandês.

      A asserção é sobre a STRING da locale, e não só sobre o `resolvedOptions`,
      e a razão é medida: numa máquina `en-US` (o CI) `new
      Intl.DateTimeFormat(undefined).resolvedOptions()` já responde
      `gregory`/`latn`, então o mutante passaria por um teste que só olhasse o
      resolvido. O que precisa estar certo é o PINO.
    */
    const resolved = new Intl.DateTimeFormat(FORMAT_LOCALE).resolvedOptions();
    expect(resolved.calendar).toBe('gregory');
    expect(resolved.numberingSystem).toBe('latn');
    expect(FORMAT_LOCALE).toContain('ca-gregory');
    expect(FORMAT_LOCALE).toContain('nu-latn');
  });

  it('is what keeps a Buddhist calendar and Arabic-Indic digits out (rule 1)', () => {
    /*
      O lado POSITIVO do par, e sem ele o teste acima é uma constante conferindo
      a si mesma: as duas subtags existem porque SEM elas o ambiente decide, e
      estas são as duas decisões erradas que existem de verdade.
    */
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    };
    const instant = new Date('2026-03-10T12:00:00.000Z');

    // O ano budista: 2026 + 543.
    expect(new Intl.DateTimeFormat('th-TH', options).format(instant)).toContain(
      '2569',
    );
    // E os dígitos árabe-índicos, que o `isCalendarDay` recusaria.
    expect(
      new Intl.DateTimeFormat('ar-EG', options).format(instant),
    ).not.toContain('2026');

    // Com o pino, os dois ambientes respondem o mesmo que o nosso.
    expect(localDay(instant, 'UTC')).toBe('2026-03-10');
  });

  it('never uses the local Date getters (rule 2)', () => {
    /*
      A regra 2 é sobre o MECANISMO, e ela é a lição que o
      `calendar-day-mapper` do backend aprendeu por teste de mutação. Aqui a
      prova é direta: os getters locais são arrancados do protótipo, e a função
      continua respondendo.

      (O guard de ESLint do projeto cobre só `packages/backend/src/repositories`
      — `shared` não tem rede estática nenhuma, e é por isso que este teste
      existe.)
    */
    const prototype = Date.prototype;
    // Tipado, e não `unknown` + `as` na volta: `CLAUDE.md` proíbe `as`, e o
    // `getOwnPropertyDescriptor` já devolve exatamente este tipo.
    const removed: Array<[string, PropertyDescriptor | undefined]> = [];
    for (const name of [
      'getFullYear',
      'getMonth',
      'getDate',
      'getDay',
      'getHours',
      'toLocaleDateString',
      'toDateString',
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      removed.push([name, descriptor]);
      Reflect.deleteProperty(prototype, name);
    }

    try {
      expect(localDay(AHEAD, TOKYO)).toBe('2026-03-11');
    } finally {
      for (const [name, descriptor] of removed) {
        if (descriptor !== undefined) {
          Object.defineProperty(prototype, name, descriptor);
        }
      }
    }

    // E os getters voltaram: sem isto, um `finally` quebrado deixaria o resto
    // da suíte vermelho por um motivo que não tem nada a ver com o nome dela.
    expect(typeof new Date().getFullYear).toBe('function');
  });

  it('produces a value that isCalendarDay accepts (rule 5)', () => {
    /*
      A regra 5 reusa o `isCalendarDay` que já existe — não um regex novo
      (`CLAUDE.md` proíbe duplicar validação de data). Vários instantes,
      inclusive 29 de fevereiro de um ano bissexto e a virada do ano em fuso
      positivo, porque um `padStart` errado só aparece nas bordas.
    */
    const instants = [
      '2024-02-29T23:00:00.000Z',
      '2026-12-31T15:00:00.000Z',
      '2026-01-01T02:00:00.000Z',
      '2026-06-15T12:00:00.000Z',
    ];

    for (const iso of instants) {
      for (const zone of [TOKYO, SAO_PAULO, 'UTC', 'Pacific/Kiritimati']) {
        const day = localDay(new Date(iso), zone);
        expect(isCalendarDay(day)).toBe(true);
      }
    }

    // O lado positivo do par: a virada do ano em UTC+14 é 1º de janeiro para
    // quem está lá, e é o `Intl` que sabe disso.
    expect(
      localDay(new Date('2026-12-31T15:00:00.000Z'), 'Pacific/Kiritimati'),
    ).toBe('2027-01-01');
  });
});

describe('localDay survives a corrupt zone (rule 4)', () => {
  it('does not throw on a zone that is not an IANA name', () => {
    /*
      ⚠️ ESTA É A REGRA QUE PROTEGE A HOME. Um `Settings.timezone` corrompido
      (ou um `'America/Sao Paulo'` com espaço, que é o erro de digitação real)
      faz o `Intl.DateTimeFormat` lançar `RangeError` — e um throw aqui derruba
      a home inteira, na primeira tela que o app abre.

      A saída é o fuso do AMBIENTE, que no navegador é o de quem está olhando a
      tela: é a resolução ⚠️ 1 da spec, e é o mais próximo da verdade que existe
      sem o `Settings` exposto.
    */
    const fallback = localDay(AHEAD, localTimeZone());

    for (const broken of [
      'Nem/Existe',
      'America/Sao Paulo',
      '',
      'UTC+3',
      'Not a zone at all',
    ]) {
      expect(localDay(AHEAD, broken)).toBe(fallback);
    }
  });

  it('falls back to the zone it was GIVEN as fallback, not to a hardcoded one (rule 4)', () => {
    /*
      ⚠️ **O MUTANTE QUE ESTE TESTE EXISTE PARA MATAR** (medido): fixar o
      fallback em `'UTC'` sobrevivia aos 12 testes originais. O teste da regra 4
      calculava o esperado com `localTimeZone()` — os dois lados usavam o mesmo
      fuso, se autoajustavam, e a asserção não escolhia nada. Uma igualdade em
      que ninguém escolheu os dois lados não é asserção (§7.4 escrito para
      fixture).

      Com o fuso de fallback INJETÁVEL, o teste dá dois fusos e exige dois dias
      diferentes. Nenhuma constante passa por isto — nem `'UTC'`, nem o fuso do
      ambiente.
    */
    expect(localDay(AHEAD, 'Nem/Existe', TOKYO)).toBe('2026-03-11');
    expect(localDay(AHEAD, 'Nem/Existe', SAO_PAULO)).toBe('2026-03-10');
    expect(localDay(BEHIND, 'Nem/Existe', SAO_PAULO)).toBe('2026-03-09');

    // E o fuso PEDIDO continua vencendo o de fallback quando ele é válido —
    // senão o parâmetro novo seria um jeito de ignorar o primeiro.
    expect(localDay(AHEAD, TOKYO, SAO_PAULO)).toBe('2026-03-11');
  });

  it('uses the ENVIRONMENT zone as the default fallback, not a constant (rule 4)', () => {
    /*
      ⚠️ A METADE QUE O PARÂMETRO SOZINHO NÃO FECHA: com o fuso de fallback
      injetável, o mutante que fixa o PADRÃO em `'UTC'` continuava vivo — todo
      teste passa o terceiro argumento, e quem não passa comparava com
      `localTimeZone()` nos dois lados.

      O jeito de decidir isso é mexer no fuso do PROCESSO. `process.env.TZ` é
      relido pelo `Intl` a cada formatador novo (medido neste Node), então aqui
      o ambiente é escolhido pelo teste e o esperado é escrito à mão: em Tóquio
      as 16:00Z já são dia 11, e em `'UTC'` (o mutante) seriam dia 10.

      Restaurado no `finally`: sem isso, o fuso vazaria para os outros arquivos
      que rodam no mesmo worker e o vermelho apontaria para o lugar errado.
    */
    const previous = process.env['TZ'];
    try {
      process.env['TZ'] = TOKYO;
      // A precondição pinada (§7.2): se um dia a plataforma ignorar o `TZ`,
      // este teste falha ALTO em vez de virar tautologia.
      expect(localTimeZone()).toBe(TOKYO);
      expect(localDay(AHEAD, 'Nem/Existe')).toBe('2026-03-11');

      process.env['TZ'] = SAO_PAULO;
      expect(localTimeZone()).toBe(SAO_PAULO);
      expect(localDay(AHEAD, 'Nem/Existe')).toBe('2026-03-10');
      expect(localDay(BEHIND, 'Nem/Existe')).toBe('2026-03-09');
    } finally {
      if (previous === undefined) delete process.env['TZ'];
      else process.env['TZ'] = previous;
    }
  });

  it('survives a fallback zone that is ALSO broken (rule 4)', () => {
    // A última rede: os dois nomes podres. Um `RangeError` aqui derrubaria a
    // home do mesmo jeito que o primeiro derrubaria.
    expect(isCalendarDay(localDay(AHEAD, 'Nem/Existe', 'Nem/Isso'))).toBe(true);
    expect(localDay(AHEAD, 'Nem/Existe', 'Nem/Isso')).toBe(
      localDay(AHEAD, localTimeZone()),
    );
  });

  it('accepts an offset with a sign, and rejects the UTC+N spelling (rule 4)', () => {
    /*
      ⚠️ REGISTRADO PORQUE QUEM VALIDAR `Settings.timezone` VAI SUPOR ERRADO
      (Tarefa 36/46). MEDIDO: `'UTC+3'` estoura e cai no fallback; `'+03:00'`
      **não** estoura e desloca de verdade. Então "tem sinal ⇒ inválido" é
      falso, e "é string ⇒ o Intl resolve" também. A única checagem fiel é
      tentar construir o formatador.
    */
    expect(localDay(new Date('2026-03-10T23:00:00.000Z'), '+03:00')).toBe(
      '2026-03-11',
    );
    expect(localDay(AHEAD, 'UTC+3', TOKYO)).toBe('2026-03-11');
  });

  it('still produces a valid calendar day when it falls back (rules 4, 5)', () => {
    // Sem esta linha, um fallback que devolvesse `''` passaria no teste acima
    // (os dois lados seriam `''`) — a asserção vazia do §7.4 escrita com um
    // laço.
    expect(isCalendarDay(localDay(AHEAD, 'Nem/Existe'))).toBe(true);
  });

  it('does NOT fall back for a zone that is merely unusual', () => {
    /*
      O lado negativo: um `catch` largo demais engoliria fusos legítimos e a
      pessoa em Kiritimati veria o dia de quem escreveu o código. `Etc/GMT-14`
      e `Pacific/Kiritimati` são nomes IANA de verdade, e os dois têm de passar
      pelo caminho normal.
    */
    expect(localDay(new Date('2026-12-31T15:00:00.000Z'), 'Etc/GMT-14')).toBe(
      '2027-01-01',
    );
  });
});

describe('localTimeZone', () => {
  it('resolves an IANA zone name that localDay accepts', () => {
    const zone = localTimeZone();

    expect(zone.length).toBeGreaterThan(0);
    // O contrato: o que `localTimeZone` devolve serve de entrada para
    // `localDay` SEM cair no fallback — senão a resolução ⚠️ 1 da spec seria
    // circular.
    expect(isCalendarDay(localDay(AHEAD, zone))).toBe(true);
  });

  it('is stable between calls', () => {
    // O fuso do ambiente não muda no meio de uma sessão, e a home o lê a cada
    // render: um valor instável faria "hoje" piscar.
    expect(localTimeZone()).toBe(localTimeZone());
  });
});
