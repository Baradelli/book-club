import { describe, expect, it } from 'vitest';

import { FOCUS_RING } from '../components/styles';

/**
 * O ANEL DE FOCO, DO LADO DO DOM — decisão do dono de 2026-09-20.
 *
 * O `theme-tokens.test.ts` do app prende os TOKENS (`--ring` segue `--accent`,
 * `--ring-halo` é derivado por `color-mix`). Esta guarda prende a outra
 * metade, que é a que chega ao elemento: a lista de classes que todo controle
 * do projeto aplica.
 *
 * ⚠️ POR QUE AS DUAS METADES PRECISAM DE GUARDA SEPARADA: um `--ring` perfeito
 * com um `FOCUS_RING` que diga `outline-none` é um app SEM foco visível, e a
 * guarda de token fica verde o tempo todo. O inverso também — e foi esse o
 * buraco: até hoje o `FOCUS_RING` não tinha acusador NENHUM.
 *
 * ⚠️ O QUE O §A.6 PEDE, NA MESMA FRASE: "`outline` nunca removido" **e** "anel
 * de 3px `color-mix(in oklch, var(--accent) 18%, transparent)`". Medido: o
 * halo de 18% sozinho dá ~1,4:1 contra o creme — ele não é visível por si. Ele
 * é halo SOBRE o contorno sólido, e é por isso que as asserções de contorno e
 * de halo andam juntas aqui: separar as duas permitiria entregar metade.
 */
const classes = FOCUS_RING.split(/\s+/u).filter((name) => name !== '');

/** As classes que só valem quando o foco é de teclado. */
const onFocusVisible = classes
  .filter((name) => name.startsWith('focus-visible:'))
  .map((name) => name.slice('focus-visible:'.length));

describe('FOCUS_RING — o contorno sólido', () => {
  it('never removes the outline outright', () => {
    /*
      `outline-none` (Tailwind v4) zera o `outline` de verdade, inclusive no
      modo de contraste forçado do Windows, onde ele deixa o controle SEM
      nenhuma indicação de foco. O que o projeto usa é `outline-hidden`, que
      esconde o anel do desenho e preserva o do modo forçado.

      Esta é a asserção que o critério "`outline` nunca removido" vira código.
    */
    expect(classes).not.toContain('outline-none');
    expect(FOCUS_RING).not.toMatch(/outline:\s*none/u);
  });

  it('draws a solid outline with a real width when the keyboard arrives', () => {
    // Largura de verdade, e só no `focus-visible`: no `focus` cru o anel pisca
    // a cada toque, que é o que faz alguém querer removê-lo por estética.
    expect(onFocusVisible).toContain('outline-2');
    expect(
      onFocusVisible.some((name) => /^outline-offset-\d+$/u.test(name)),
    ).toBe(true);
  });

  it('paints that outline with the focus token, not with an arbitrary colour', () => {
    // `outline-focus` resolve `--color-focus` → `--ring` → `--accent`. Uma cor
    // arbitrária aqui (`outline-[#143524]`) pintaria igual hoje e ficaria para
    // trás no dia em que a cor de ação mudasse.
    expect(onFocusVisible).toContain('outline-focus');
    expect(FOCUS_RING).not.toMatch(/outline-\[/u);
  });
});

describe('FOCUS_RING — o halo de 3px', () => {
  it('adds the 3px halo the §A.6 asks for', () => {
    expect(onFocusVisible).toContain('ring-3');
  });

  it('paints the halo with the halo token, never with a hex', () => {
    // O halo é `color-mix()` sobre `--accent`. Um hex aqui é a cor de ação
    // duplicada num segundo lugar — a dessincronia que o `theme.css` eliminou.
    expect(onFocusVisible).toContain('ring-focus-halo');
    expect(FOCUS_RING).not.toMatch(/ring-\[/u);
  });

  it('never ships the halo WITHOUT the solid outline', () => {
    /*
      ⚠️ ESTA É A ASSERÇÃO QUE A PRIMEIRA ENTREGA TERIA PRECISADO.

      O halo de 18% sozinho é invisível (~1,4:1 contra o creme). Alguém lendo
      só a metade "anel de 3px color-mix" do §A.6 entrega um foco que não se
      vê — e, sem esta linha, entrega com a suíte verde. As duas metades são
      uma decisão só.
    */
    const temHalo = onFocusVisible.includes('ring-3');
    const temContorno = onFocusVisible.includes('outline-2');

    expect(temHalo).toBe(temContorno);
    expect(temHalo).toBe(true);
  });
});
