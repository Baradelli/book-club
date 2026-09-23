import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * REGRA 32 — o contraste do avatar, NOS DOIS TEMAS.
 *
 * ============================================================================
 * TAREFA 41a: ESTA GUARDA TROCOU DE ALVO, E NÃO AFROUXOU
 * ============================================================================
 *
 * Até aqui ela media SEIS pares (`--avatar-1`…`-6` contra `--avatar-fg`), que
 * eram a paleta de cores de avatar. A decisão F do MVP 3.5 matou a paleta: ficou
 * o par único do canvas, e é ele que a tela pinta —
 * `--person-fg` sobre `--person-bg`.
 *
 * ⚠️ O RISCO DA TROCA, ESCRITO AQUI PARA NÃO SE REPETIR: trocar seis pares por
 * um é o movimento típico que transforma uma guarda em asserção vazia (§7.4).
 * Foi por isso que o rigor ficou IGUAL — mesmo piso do WCAG 2.1 AA, mesmos dois
 * temas, medidos por fórmula e não por olho — e por isso o medidor continua
 * pinado contra preto-sobre-branco e branco-sobre-branco: um `contrastRatio`
 * que devolvesse sempre 21 deixaria a única asserção que sobrou verde para
 * sempre.
 *
 * Isto NÃO é "teste de cor exata" (a spec proíbe, e com razão): nenhuma
 * asserção aqui diz qual cor é. O que se afirma é uma PROPRIEDADE — a razão de
 * contraste do par passa 4.5:1, o mínimo do WCAG 2.1 AA para texto normal, que
 * é o que a inicial de 9–11px é. Trocar o verde por outro verde legível
 * continua verde.
 *
 * E é aqui que o `light-dark()` paga a conta: os dois valores do token estão na
 * MESMA declaração, então dá para medir claro e escuro sem simular navegador
 * nenhum.
 */
const cssPath = resolve(process.cwd(), 'src', 'theme.css');
const css = readFileSync(cssPath, 'utf8');

/**
 * COMENTÁRIO NÃO É DECLARAÇÃO — e aqui isso decide o teste.
 *
 * O `theme.css` **explica em prosa** por que a paleta de seis morreu, e a
 * explicação cita os nomes (`--avatar-fg`, `--avatar-1`…). A guarda contra a
 * ressurreição procura `--avatar-` cru (a versão estreita
 * `(?:fg|\d)` deixava passar `--avatar-10` e `--avatar-bg`), então sem remover
 * os comentários ela acusaria o arquivo por DOCUMENTAR a decisão — e o
 * conserto óbvio seria apagar a documentação, que é o pior resultado possível.
 *
 * Molde: o `stripComments` de `packages/app/src/__tests__/theme-css.test.ts`,
 * que existe pela mesma razão.
 */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//gu, ' ');

/** O mínimo do WCAG 2.1 AA para texto normal. */
const MIN_CONTRAST_RATIO = 4.5;

/**
 * `--person-bg: light-dark(#dde9e2, #24312a);`
 * → `{ light: '#dde9e2', dark: '#24312a' }`
 */
function lightDarkPair(token: string): { light: string; dark: string } {
  const pattern = new RegExp(
    `--${token}:\\s*light-dark\\(\\s*(#[0-9a-fA-F]{6})\\s*,\\s*(#[0-9a-fA-F]{6})\\s*\\)`,
    'u',
  );
  const match = pattern.exec(css);
  if (match === null) {
    throw new Error(
      `theme.css não declara \`--${token}\` como light-dark(#claro, #escuro)`,
    );
  }

  const [, light, dark] = match;
  if (light === undefined || dark === undefined) {
    throw new Error(`\`--${token}\` tem light-dark() sem os dois valores`);
  }

  return { light, dark };
}

/** sRGB → luminância relativa (WCAG 2.1, 3.2.2). */
function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`\`${hex}\` não é um #rrggbb`);
  }

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

const THEMES = ['light', 'dark'] as const;

describe('the person avatar pair (rule 32, decision F of MVP 3.5)', () => {
  it('declares the three person tokens the avatar is painted with', () => {
    /*
      Sem esta linha o resto é asserção vazia (§7.4): um `theme.css` sem os
      tokens faria `lightDarkPair` estourar dentro de um `expect` que ninguém
      escreveu, ou — pior — um `describe` que não roda caso nenhum ficaria
      verde. É o mesmo pino que a versão de seis slots tinha.

      São TRÊS e não dois porque o filete faz parte da marca: o avatar aparece
      sobre chip e linha que também são claros, e sem `--person-border` ele se
      dissolve na superfície. Só o par TINTA × PAPEL entra na conta de
      contraste de texto.
    */
    for (const token of ['person-bg', 'person-border', 'person-fg']) {
      expect(() => lightDarkPair(token)).not.toThrow();
    }
  });

  it.each(THEMES)(
    'keeps the initial readable on the person paper in the %s theme',
    (theme) => {
      /*
        A inicial é texto de 9–11px (`Acervo.dc.html:92` usa 9px,
        `Dia.dc.html:90` usa 11px), então o piso é o de TEXTO NORMAL (4,5:1) e
        não o de componente não textual (3:1).

        O tema escuro é o modo de uso PROVÁVEL ("à noite, na cama"), não caso de
        borda: ele é medido com o mesmo rigor e SEPARADO, porque um par que
        passa no claro e falha no escuro tem de acusar qual dos dois.
      */
      const paper = lightDarkPair('person-bg')[theme];
      const ink = lightDarkPair('person-fg')[theme];

      expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(
        MIN_CONTRAST_RATIO,
      );
    },
  );

  it('measures contrast the way WCAG does, not by eye', () => {
    // Pino do próprio medidor: preto sobre branco é 21:1 e branco sobre branco
    // é 1:1. Sem isto, um `contrastRatio` que devolvesse sempre 21 deixaria a
    // asserção acima verde — e com UM par só, essa é a única asserção que
    // existe. O pino vale mais agora do que valia com seis.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ffff00', '#ffffff')).toBeLessThan(
      MIN_CONTRAST_RATIO,
    );
  });

  it('⚠️ refuses a person pair where the ink equals the paper', () => {
    /*
      O PAR POSITIVO DA TROCA, e ele é o que impede esta suíte de virar teatro.

      Medido na fatia: com `--person-fg` igual a `--person-bg`, a asserção de
      cima acusa (1:1 contra 4,5:1) — mas se alguém "simplificar" o medidor, ou
      trocar o piso por um número que sempre passa, a suíte fica verde com uma
      inicial INVISÍVEL na tela. Esta linha mede o mecanismo, não a cor: ela
      afirma que o mesmo hex nos dois lados reprova.
    */
    for (const theme of THEMES) {
      const paper = lightDarkPair('person-bg')[theme];
      expect(contrastRatio(paper, paper)).toBeLessThan(MIN_CONTRAST_RATIO);
    }
  });

  it('⚠️ keeps the six-colour palette from coming back by the side door', () => {
    /*
      A decisão F matou `--avatar-fg` e `--avatar-1`…`-6`. Uma paleta que volte
      é uma decisão do dono — e uma decisão do dono chega a este arquivo, porque
      é aqui que o contraste dos pares é medido.

      ⚠️ SEM ESTA LINHA o caminho de volta é silencioso: os seis tokens podem
      renascer no `theme.css` com utilitário no `@theme inline` e a bijeção
      continua fechando; nada mais neste repositório pergunta por que eles
      existem. Quem os devolver tem de vir aqui, apagar esta asserção e escrever
      os seis pares — que é o custo que a decisão F comprou.

      ⚠️ O PADRÃO É `--avatar-` CRU, E ISSO FOI CORRIGIDO NA AUDITORIA. A
      primeira versão era `/--avatar-(?:fg|\d)\s*:/`, que **não pega**
      `--avatar-10:` nem `--avatar-bg:` — ou seja, a paleta voltava com o nome
      de um décimo slot, ou com um nome novo, e a guarda ficava verde. Um
      prefixo estreito numa guarda de RESSURREIÇÃO é o mesmo defeito que o
      `DANGER_STYLE` da Tarefa 39 teve: continuar verde e parar de guardar.
    */
    expect(cssWithoutComments).not.toMatch(/--avatar-/u);

    // ⚠️ O par positivo, senão a linha acima passa com um `stripComments` que
    // devolva string vazia — e a guarda vira asserção vazia (§7.4) exatamente
    // enquanto fica com o padrão mais largo. Ele confere que as DECLARAÇÕES
    // sobreviveram à remoção dos comentários, e que a prosa NÃO.
    expect(cssWithoutComments).toMatch(/--person-bg:\s*light-dark\(/u);
    // `--avatar-fg` está citado em PROSA no `theme.css` (o docblock que explica
    // a morte da paleta). A declaração morreu; a explicação ficou — e é ela que
    // o `stripComments` tem de remover. As duas linhas provam os dois lados.
    expect(css).toMatch(/`--avatar-fg`/u);
    expect(cssWithoutComments).not.toMatch(/`--avatar-fg`/u);
  });
});
