import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BookSpine } from '../book-spine';

/**
 * TAREFA 41b — A LOMBADA TIPOGRÁFICA: o livro sem capa vira lombada.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). A estante
 * da home (`pages/home.tsx`, Tarefa 42) e o cabeçalho da tela do livro
 * (`pages/book.tsx`, Tarefa 44) — as duas listas que hoje mostram um livro sem
 * nenhum desenho.
 *
 * As medidas, dos artboards dessas duas telas:
 *
 * | tamanho | artboard | caixa | raio | canto | recuo | corpo |
 * | --- | --- | --- | --- | --- | --- | --- |
 * | `sm` | `Inicio.dc.html:71-72` | 42×60 | `1px 3px 3px 1px` | `border-left:3px` | `5px 3px` | 7,5px |
 * | `md` | `Livro.dc.html:44-45` | 58×84 | `1px 4px 4px 1px` | `border-left:4px` | `7px 4px` | 9px |
 * | `lg` | `LivroDesktop.dc.html:47-48` | 88×128 | `1px 5px 5px 1px` | `border-left:5px` | `10px 6px` | 12px |
 *
 * E as duas paletas, que existem para que dois livros lado a lado não sejam o
 * mesmo retângulo: `--spine-*` (`Inicio.dc.html:71`) e `--spine2-*`
 * (`Inicio.dc.html:81`). Quem escolhe é a TELA.
 */
describe('BookSpine', () => {
  it('draws the title vertically, the way a spine on a shelf reads', () => {
    render(<BookSpine title="A Coragem de Ser Imperfeito" />);

    const text = screen.getByText('A Coragem de Ser Imperfeito');
    const classes = text.className.split(/\s+/u);
    // `writing-mode:vertical-rl` + `rotate(180deg)` é o par do canvas: sem a
    // rotação o texto sobe de cima para baixo com as letras deitadas para o
    // lado errado.
    expect(classes).toContain('[writing-mode:vertical-rl]');
    expect(classes).toContain('rotate-180');
    // Fraunces, como todo título do desenho.
    expect(classes).toContain('font-reading');
    // Uma lombada não quebra linha: o título que não cabe é cortado pela
    // altura da lombada, como a impressão faz.
    expect(classes).toContain('whitespace-nowrap');
  });

  it('carries the three sizes of the canvas, each one a LITERAL (decision C)', () => {
    const { container, rerender } = render(<BookSpine title="Mindset" />);

    const spine = () => container.firstElementChild as HTMLElement;

    // `md` é o padrão: 58×84 (`Livro.dc.html:44`).
    expect(spine().className.split(/\s+/u)).toContain('w-14.5');
    expect(spine().className.split(/\s+/u)).toContain('h-21');

    rerender(<BookSpine size="sm" title="Mindset" />);
    // 42×60 (`Inicio.dc.html:71`).
    expect(spine().className.split(/\s+/u)).toContain('w-10.5');
    expect(spine().className.split(/\s+/u)).toContain('h-15');

    rerender(<BookSpine size="lg" title="Mindset" />);
    // 88×128 (`LivroDesktop.dc.html:47`).
    expect(spine().className.split(/\s+/u)).toContain('w-22');
    expect(spine().className.split(/\s+/u)).toContain('h-32');
  });

  it('keeps the asymmetric radius and the thick left edge — that IS the spine', () => {
    const { container } = render(<BookSpine title="Mindset" />);

    const classes = (
      container.firstElementChild as HTMLElement
    ).className.split(/\s+/u);
    // `border-radius:1px 4px 4px 1px`: quadrado do lado da costura, redondo do
    // lado das páginas. Sem a assimetria o desenho vira um retângulo colorido.
    expect(classes).toContain('rounded-[1px_4px_4px_1px]');
    expect(classes).toContain('border-l-4');
    expect(classes).toContain('border-spine-edge');
  });

  it('switches to the SECOND palette when the screen asks (canvas draws two)', () => {
    const { container, rerender } = render(<BookSpine title="Mindset" />);

    const classes = () =>
      (container.firstElementChild as HTMLElement).className.split(/\s+/u);

    expect(classes()).toContain('bg-spine');
    expect(classes()).toContain('border-spine-edge');

    rerender(<BookSpine palette="secondary" title="Mindset" />);

    expect(classes()).toContain('bg-spine2');
    expect(classes()).toContain('border-spine2-edge');
    expect(classes()).not.toContain('bg-spine');
  });

  it('⚠️ stays OUT of the screen reader path unless the screen says otherwise', () => {
    /*
      Regra 6: "o título tem de estar legível para o leitor de tela, SEM
      duplicar quando a tela já o escreve ao lado".

      Medido no canvas: nos três artboards a lombada aparece **sempre** com o
      título escrito ao lado dela (`Inicio.dc.html:75`, `Livro.dc.html:48`,
      `LivroDesktop.dc.html:51`). Então o caso comum é a duplicação, e o padrão
      é `aria-hidden` — é o mesmo desenho e a mesma decisão do `PersonAvatar`,
      que também é uma marca ao lado de um nome já escrito.

      Quando a lombada aparecer SOZINHA (uma estante só de lombadas, por
      exemplo), a tela passa `label` e ela vira `role="img"` com aquele nome.
    */
    const { container, rerender } = render(<BookSpine title="Mindset" />);

    const spine = () => container.firstElementChild as HTMLElement;
    expect(spine().getAttribute('aria-hidden')).toBe('true');
    expect(spine().hasAttribute('role')).toBe(false);

    rerender(<BookSpine label="Livro: Mindset" title="Mindset" />);

    expect(spine().hasAttribute('aria-hidden')).toBe(false);
    expect(screen.getByRole('img', { name: 'Livro: Mindset' })).toBe(spine());
  });

  it('draws with div and border — no hand-made svg (rule 8)', () => {
    const { container } = render(<BookSpine title="Mindset" />);

    // A guarda do pacote inteiro é `adr-0002-iconography.test.ts`; aqui o que
    // se pina é que ESTE desenho não precisou de um.
    expect(container.querySelector('svg')).toBeNull();
  });
});
