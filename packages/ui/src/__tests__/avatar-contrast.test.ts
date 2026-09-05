import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AVATAR_PALETTE_SIZE } from '../components/avatar-color';

/**
 * REGRA 32 — o contraste do avatar, NOS DOIS TEMAS.
 *
 * "O gerador não pode sortear amarelo com texto branco." Ele não sorteia: as
 * seis cores são escolhidas à mão em `theme.css`. Mas escolhidas à mão é
 * exatamente o que muda sem ninguém medir — alguém acha o verde apagado, clareia
 * dois tons, e as iniciais de metade do clube ficam ilegíveis à noite.
 *
 * Isto NÃO é "teste de cor exata" (a spec proíbe, e com razão): nenhuma
 * asserção aqui diz qual cor é. O que se afirma é uma PROPRIEDADE — a razão de
 * contraste entre o par de cada slot passa 4.5:1, o mínimo do WCAG 2.1 AA para
 * texto normal. Trocar o verde por outro verde legível continua verde.
 *
 * E é aqui que o `light-dark()` paga a conta: os dois valores de cada token
 * estão na MESMA declaração, então dá para medir claro e escuro sem simular
 * navegador nenhum.
 */
const cssPath = resolve(process.cwd(), 'src', 'theme.css');
const css = readFileSync(cssPath, 'utf8');

/** O mínimo do WCAG 2.1 AA para texto normal. */
const MIN_CONTRAST_RATIO = 4.5;

/**
 * `--clube-avatar-2: light-dark(#2c6a56, #265d4b);`
 * → `{ light: '#2c6a56', dark: '#265d4b' }`
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

const foreground = lightDarkPair('clube-avatar-fg');

const slots = Array.from(
  { length: AVATAR_PALETTE_SIZE },
  (_, index) => index + 1,
);

describe('avatar palette (rule 32)', () => {
  it('declares one background token per palette slot', () => {
    // Sem esta linha o `it.each` abaixo é asserção vazia (§7.4): uma paleta
    // reduzida a zero slots não rodaria caso nenhum e a suíte ficaria verde.
    expect(slots).toHaveLength(AVATAR_PALETTE_SIZE);
    expect(AVATAR_PALETTE_SIZE).toBeGreaterThan(1);
    for (const slot of slots) {
      expect(() => lightDarkPair(`clube-avatar-${slot}`)).not.toThrow();
    }
  });

  it.each(slots)(
    'keeps slot %i readable against the avatar foreground in LIGHT theme',
    (slot) => {
      const background = lightDarkPair(`clube-avatar-${slot}`);

      expect(
        contrastRatio(background.light, foreground.light),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
    },
  );

  it.each(slots)(
    'keeps slot %i readable against the avatar foreground in DARK theme',
    (slot) => {
      // O tema escuro é o modo de uso PROVÁVEL ("à noite, na cama"), não um
      // caso de borda. Ele é medido com o mesmo rigor do claro, e separado —
      // um par que passa no claro e falha no escuro tem de acusar qual.
      const background = lightDarkPair(`clube-avatar-${slot}`);

      expect(
        contrastRatio(background.dark, foreground.dark),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
    },
  );

  it('measures contrast the way WCAG does, not by eye', () => {
    // Pino do próprio medidor: preto sobre branco é 21:1 e branco sobre branco
    // é 1:1. Sem isto, um `contrastRatio` que devolvesse sempre 21 deixaria
    // todas as asserções acima verdes — e o amarelo com texto branco passaria.
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ffff00', '#ffffff')).toBeLessThan(
      MIN_CONTRAST_RATIO,
    );
  });
});
