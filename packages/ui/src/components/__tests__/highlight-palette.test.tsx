import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichEditor } from '../RichEditor';

/**
 * ⚠️ **O PINO DA PALETA DE GRIFO DO EDITOR — a dívida da Tarefa 22, paga aqui
 * (decisão G da Tarefa 25).**
 *
 * O ADR 0004 (`docs/adr/0004-grifo-entidade-propria.md`) exige que os hex das
 * DUAS paletas fiquem espelhados: a marca colorida do editor (formatação dentro
 * de uma anotação) e a entidade `Highlight` (o registro de um grifo feito no
 * livro de papel) usam as mesmas cores de propósito, "para não parecer bug".
 *
 * ⚠️ **E ATÉ AGORA O ÚNICO GUARDA MORAVA EM `packages/shared`** — o espelho de
 * `shared/src/__tests__/highlight-color.test.ts`, que lê o `RichEditor.tsx` do
 * DISCO pelo caminho do monorepo (`packages/shared` não depende de
 * `packages/ui`, e não pode: é o pacote sem deps internas). Consequência
 * **medida nesta fatia**: com o verde do editor trocado de
 * `rgba(34, 197, 94, 0.35)` para `rgba(16, 185, 129, 0.35)`,
 * `pnpm --filter @clube/ui test` ficava **175/175 verde** e só o `shared`
 * acusava. Quem corrige uma cor e roda a suíte do pacote que ele acabou de
 * mexer vê verde — e é assim que a divergência entra.
 *
 * ⚠️ **E ELE NÃO IMPORTA DE `@clube/shared`, DE PROPÓSITO.** As duas paletas
 * têm valores DIFERENTES por decisão: `shared` guarda o hex de 6 dígitos
 * (identidade da cor, e é o que o Postgres compara byte a byte) e o editor usa
 * `rgba` com **alpha**, que é decisão de RENDERIZAÇÃO (o texto tem de continuar
 * legível atrás do grifo, no tema claro E no escuro) e **varia por cor** —
 * 0.40 no amarelo e no laranja, 0.35 nos outros três. Um teste que comparasse
 * as duas listas teria de reimplementar a conversão, que é justamente o que o
 * espelho de `shared` faz. Aqui a lista é **pinada**, e o docblock aponta para
 * o espelho: os dois juntos fecham as duas direções.
 *
 * ⚠️ **E A LEITURA É DO DOM, NÃO DO ARQUIVO-FONTE.** `HIGHLIGHT_COLORS` do
 * `RichEditor` é constante de módulo e **não é exportada** (`docs/EDITOR.md`
 * §6) — mas ela chega ao DOM: cada amostra é um `<span>` com a cor numa
 * variável CSS (`style={{ '--swatch': cor }}`, a única exceção ao "sem CSS
 * inline"), e o `--swatch` é uma propriedade CUSTOMIZADA, que o jsdom **não
 * normaliza** — então o valor volta com a grafia exata do código, alpha
 * incluído. Ler o DOM prova a paleta que de fato chega à barra; ler o fonte
 * provaria apenas que a lista está escrita.
 */

/** Fixture é factory (§7.7) — o `doc` é uma árvore MUTÁVEL por dentro. */
function aDoc(text = 'o trecho grifado'): Record<string, unknown> {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

/**
 * As cinco canetas da barra, na ordem em que a tela de grifos as desenha
 * (amarelo, verde, laranja, azul, rosa — a mesma ordem de
 * `HIGHLIGHT_COLORS` em `@clube/shared`).
 *
 * Escritas à mão: é o PINO. Uma lista derivada do próprio componente seria a
 * asserção auto-ajustável do §7.8 — os dois lados mudariam juntos.
 */
const EXPECTED_PALETTE = [
  ['Grifo amarelo', 'rgba(250, 204, 21, 0.40)'],
  ['Grifo verde', 'rgba(34, 197, 94, 0.35)'],
  ['Grifo laranja', 'rgba(249, 115, 22, 0.40)'],
  ['Grifo azul', 'rgba(59, 130, 246, 0.35)'],
  ['Grifo rosa', 'rgba(236, 72, 153, 0.35)'],
] as const;

/** A cor que a amostra daquele botão realmente pinta. */
function swatchColorOf(label: string): string {
  const button = screen.getByLabelText(label);
  const swatch = button.querySelector<HTMLElement>('.clube-editor-swatch');
  if (swatch === null) {
    throw new Error(`o botão "${label}" não tem amostra de cor`);
  }
  return swatch.style.getPropertyValue('--swatch');
}

describe('⚠️ the highlight palette of the editor (ADR 0004, task 25 decision G)', () => {
  it.each(EXPECTED_PALETTE)('paints %s with %s', (label, color) => {
    render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

    expect(swatchColorOf(label)).toBe(color);
  });

  it('has exactly FIVE pens, in the order the highlight screen draws them', () => {
    /*
      A precondição do pino, e ela é o §7.4 escrito para paleta: sem a
      contagem, apagar uma cor do `RichEditor` deixaria os cinco testes acima
      passando pelos quatro que sobraram — e o `it.each` do que sumiu
      **lançaria** no `getByLabelText`, o que é um acusador; mas ACRESCENTAR uma
      sexta cor não acusaria nada, e a tela de grifos (que enumera a paleta de
      `shared`) ficaria com uma cor a menos que a barra do editor.
    */
    render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

    const swatches = Array.from(
      document.querySelectorAll<HTMLElement>('.clube-editor-swatch'),
    );
    expect(swatches).toHaveLength(EXPECTED_PALETTE.length);
    expect(
      swatches.map((swatch) => swatch.style.getPropertyValue('--swatch')),
    ).toEqual(EXPECTED_PALETTE.map(([, color]) => color));
  });

  it('paints every colour in the rgba form, with an alpha below 1', () => {
    /*
      ⚠️ A PROPRIEDADE, e não só os valores: a paleta do editor é
      deliberadamente TRANSLÚCIDA — cor sólida esconderia a palavra grifada num
      dos dois temas (`docs/EDITOR.md` §6). Trocar um `rgba(…, 0.40)` pelo hex
      sólido correspondente seria exatamente o "conserto" que alguém faria para
      espelhar `@clube/shared`, e é o que esta asserção recusa.

      ⚠️ **E ELA LÊ O DOM, NÃO A CONSTANTE — a versão anterior era a asserção
      auto-ajustável do §7.8.** O laço percorria o `EXPECTED_PALETTE` escrito à
      mão logo acima, não renderizava nada e não lia o `--swatch`: os dois lados
      vinham da mesma constante, então NENHUM mutante do `RichEditor` sobrevivia
      — porque nenhum era alcançado. Era decoração com nome de guarda, e a
      auditoria a nomeou. Agora ela renderiza, lê as cinco amostras e aplica o
      regex sobre o que o componente de fato pinta.
    */
    render(<RichEditor doc={aDoc()} onChange={() => undefined} />);

    const painted = Array.from(
      document.querySelectorAll<HTMLElement>('.clube-editor-swatch'),
    ).map((swatch) => swatch.style.getPropertyValue('--swatch'));

    // A precondição: sem ela, zero amostras deixaria o laço vazio e a guarda
    // verde provando nada (§7.4).
    expect(painted).toHaveLength(EXPECTED_PALETTE.length);

    for (const color of painted) {
      const alpha = /^rgba\(\d+, \d+, \d+, (0\.\d+)\)$/u.exec(color);
      expect(alpha).not.toBeNull();
      expect(Number(alpha?.[1])).toBeGreaterThan(0);
      expect(Number(alpha?.[1])).toBeLessThan(1);
    }
  });
});
