import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Eyebrow } from '../eyebrow';

/**
 * TAREFA 41b — o RÓTULO DE SEÇÃO, que no §A.6 do `docs/new-ui.md` substitui
 * todo `h2`/`h3`.
 *
 * ⚠️ QUEM CONSOME (a lição da nota nº 10 da Tarefa 41a: parta do consumidor,
 * nunca do artboard que "parece" ter a coisa). Este componente é o rótulo que
 * hoje está cravado em quase toda tela do app como um `<span>` solto: a home
 * (`pages/home.tsx`), a tela do livro (`pages/book.tsx`), a do dia
 * (`pages/day-note.tsx`), o acervo, a busca e os dois formulários de grifo. As
 * fatias que o consomem são as Tarefas 42 a 48; aqui ele só nasce.
 *
 * As medidas, dos artboards dessas telas:
 *
 * | tinta | onde, no canvas | valor |
 * | --- | --- | --- |
 * | muted | `Inicio.dc.html:40,66,93`, `Livro.dc.html:67`, `Dia.dc.html:44,55,87`, `NovoGrifo.dc.html:58,81` | `'Geist Mono'` 10px, `letter-spacing:0.12em`, `text-transform:uppercase`, `color:var(--text-muted)` |
 * | ouro | `Inicio.dc.html:41,50`, `NovaAnotacao.dc.html:46`, `NovoGrifo.dc.html:48` | tudo igual, `color:var(--gold)` |
 */
describe('Eyebrow', () => {
  it('draws the section label in the mono eyebrow step, upper case (canvas)', () => {
    render(<Eyebrow>O que o clube está lendo</Eyebrow>);

    const label = screen.getByText('O que o clube está lendo');
    const classes = label.className.split(/\s+/u);

    // `--size-eyebrow` é 10px e o token se chama assim justamente por ser
    // ESTE rótulo (`theme.css`, "mono: o RÓTULO DE SEÇÃO").
    expect(classes).toContain('font-mono');
    expect(classes).toContain('text-eyebrow');
    expect(classes).toContain('uppercase');
    expect(classes).toContain('tracking-[0.12em]');
  });

  it('paints the plain label muted and the one that is TODAY in gold (decision I)', () => {
    const { rerender } = render(<Eyebrow>O que o clube está lendo</Eyebrow>);

    expect(
      screen.getByText('O que o clube está lendo').className.split(/\s+/u),
    ).toContain('text-muted');

    rerender(<Eyebrow tone="gold">A leitura de hoje</Eyebrow>);

    const gold = screen.getByText('A leitura de hoje').className.split(/\s+/u);
    expect(gold).toContain('text-gold-strong');
    expect(gold).not.toContain('text-muted');
  });

  it('⚠️ refuses --gold for the gold tone, because at 10px it FAILS contrast', () => {
    /*
      ⚠️ DIVERGÊNCIA CANVAS × CONTRASTE, medida, e a mesma espécie da nota nº 5
      da Tarefa 41a (o `--text-faint` do dia futuro).

      O canvas pinta este rótulo com `var(--gold)` (`Inicio.dc.html:50`), e
      `--gold` no tema CLARO é `#946d2c`. Contraste contra as três superfícies,
      pela fórmula de luminância relativa da WCAG 2.1 (3.2.2):

      | tinta | vs `--bg` | vs `--surface` | vs `--surface-2` |
      | --- | --- | --- | --- |
      | `--gold` `#946d2c` | **4,16** | **4,31** | **3,97** |
      | `--gold-strong` `#785822` | 5,79 | 6,00 | 5,53 |

      O rótulo tem 10px — muito abaixo dos 24px que autorizariam o piso de
      3:1 —, então o piso é 4,5:1 e `--gold` REPROVA nas três. O mesmo número
      já está escrito no `theme.css`, no registro de por que o anel de foco
      deixou de ser `--gold` ("4,16:1 contra a página").

      `--gold-strong` passa nas três, nos dois temas (escuro: 8,54 / 7,92 /
      7,11), e ele não é uma cor inventada para tapar o buraco: é a tinta que o
      PRÓPRIO canvas usa quando o dourado precisa carregar texto — o número do
      selo de sequência (`Inicio.dc.html:99`, `color:var(--gold-strong)`) e a
      data do dia de hoje no sumário (`Livro.dc.html:146`).

      Esta asserção é o pino: trocar de volta para `text-gold` fica vermelho
      aqui, e quem quiser trocar reabre a decisão com o dono em vez de apagar a
      medição.
    */
    render(<Eyebrow tone="gold">Trecho grifado</Eyebrow>);

    expect(
      screen.getByText('Trecho grifado').className.split(/\s+/u),
    ).not.toContain('text-gold');
  });

  it('is a span, not a heading — the mono label REPLACES h2/h3 (§A.6)', () => {
    render(<Eyebrow>Plano de leitura</Eyebrow>);

    const label = screen.getByText('Plano de leitura');
    expect(label.tagName).toBe('SPAN');
    // E não um `role="heading"` fingido: um rótulo que se anuncia como título
    // sem estar na ÁRVORE de títulos da página é pior que nenhum.
    expect(label.hasAttribute('role')).toBe(false);
  });

  it('carries no text of its own — every word comes from the screen (decision A)', () => {
    // A guarda do pacote é `src/__tests__/no-hardcoded-ui-text.test.ts`, e o
    // teto dela só pode CAIR. Aqui o que se pina é a forma: sem `children`,
    // não sobra palavra nenhuma.
    const { container } = render(<Eyebrow>{null}</Eyebrow>);

    expect(container.textContent).toBe('');
  });

  it('lets the screen add classes without losing its own (className)', () => {
    render(<Eyebrow className="self-start">Sua anotação</Eyebrow>);

    const classes = screen.getByText('Sua anotação').className.split(/\s+/u);
    expect(classes).toContain('self-start');
    expect(classes).toContain('font-mono');
  });
});
