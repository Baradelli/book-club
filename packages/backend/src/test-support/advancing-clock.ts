/**
 * O RELÓGIO QUE ANDA A CADA LEITURA — e por que ele existe.
 *
 * "Estes dois campos saem de UMA leitura só do relógio" é uma propriedade que
 * `expect(a).toBe(b)` **não** prova: duas chamadas a `new Date()` no mesmo tick
 * devolvem o MESMO milissegundo, então a igualdade fica verde com um `new Date()`
 * por campo. Quem escolheu o valor esperado foi o relógio, não o código — é a
 * asserção que se autoajusta do CONVENCOES-CODIGO §7.8, e ela deixou o mutante
 * "um `new Date()` por campo" com ZERO acusadores no `createHighlight` e no
 * `archiveHighlight` (medido: 1206/1206 verdes, três rodadas).
 *
 * Este stub torna a propriedade DECIDÍVEL sem injetar port de clock em produção
 * (o port é dívida registrada, e é outra fatia): cada `new Date()` sem argumento
 * devolve um instante `CLOCK_TICK_MS` à frente do anterior, e o número de
 * leituras é observável. Com ele, um `new Date()` por campo muda DUAS coisas —
 * `reads` vira 2 e os dois campos divergem —, então os dois mutantes acusam.
 *
 * `new Date(valor)` passa intacto: o `clone` dos fakes reconstrói `Date` a partir
 * de `Date` a cada leitura, e cobrá-lo do relógio quebraria todo o resto.
 *
 * ⚠️ **O stub é global e vaza para o arquivo inteiro.** Sempre `restore()` (ou um
 * `afterEach` com `vi.unstubAllGlobals()`), senão o teste seguinte herda um
 * relógio de 2026 que não é o dele.
 */
import { vi } from 'vitest';

/** O instante ANTES da primeira leitura. Notoriamente não-hoje (§7.8). */
export const CLOCK_BASE_ISO = '2026-04-01T12:00:00.000Z';

/** O quanto o relógio anda entre duas leituras. */
export const CLOCK_TICK_MS = 1000;

export interface AdvancingClock {
  /** Quantas leituras SEM argumento (`new Date()`) o código sob teste fez. */
  readonly reads: number;
  /** O instante (epoch ms) que a n-ésima leitura devolve — `n` começa em 1. */
  at(n: number): number;
  /** Devolve o `Date` real ao global. */
  restore(): void;
}

export function installAdvancingClock(): AdvancingClock {
  const RealDate = globalThis.Date;
  const base = RealDate.parse(CLOCK_BASE_ISO);
  let reads = 0;

  class AdvancingDate extends RealDate {
    constructor(value?: number | string | Date) {
      if (value === undefined) {
        reads += 1;
        super(base + reads * CLOCK_TICK_MS);
      } else {
        super(value);
      }
    }
  }

  vi.stubGlobal('Date', AdvancingDate);

  return {
    get reads(): number {
      return reads;
    },
    at: (n: number): number => base + n * CLOCK_TICK_MS,
    restore: (): void => {
      vi.unstubAllGlobals();
    },
  };
}
