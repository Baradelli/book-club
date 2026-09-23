import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PresenceMark } from '../presence-mark';

/**
 * TAREFA 41b — AS MARCAS: quem leu e quem escreveu, na coluna do sumário.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). O plano de
 * leitura da tela do livro (`pages/book.tsx`, hoje via
 * `pages/reading-marks.tsx`), que a Tarefa 44 reescreve — é a única lista do
 * app que mostra, por dia, quem do clube passou por ali.
 *
 * As medidas, no artboard dessa tela:
 *
 * | estado | `Livro.dc.html` | `LivroDesktop.dc.html` |
 * | --- | --- | --- |
 * | cheio (leu **e** escreveu) | `:73` — 18×18, `background:var(--accent)`, `color:var(--accent-fg)`, mono 9px | `:72` — 19×19, idem |
 * | vazado (leu) | `:83` — 18×18, `border:1px solid var(--border-strong)`, `color:var(--text-muted)` | `:82` — 19×19, idem |
 * | ausente (não leu) | `:150,:157,:164` — **nada**: a coluna de 44px fica VAZIA | `:159,:166` — idem |
 *
 * E a legenda, que é o que ensina a forma: "Cheio = escreveu"
 * (`Livro.dc.html:68`) e "As marcas" na margem do desktop
 * (`LivroDesktop.dc.html:183-190`).
 *
 * ⚠️ A coluna de 44px que segura o alinhamento no dia sem marca é do
 * `ListItem` (`list.tsx:262-267`, `data-sumario-marks`), **não** deste
 * componente — é por isso que o terceiro estado pode ser ausência de verdade.
 */
describe('PresenceMark', () => {
  it('renders NOTHING when the person has not read — the third state is absence', () => {
    /*
      ⚠️ ESTE É O ESTADO QUE SE ESQUECE (regra 4), e ele tem de ser ausência
      DE VERDADE: nem um disco transparente, nem um `<span aria-hidden>` vazio.

      Um disco transparente ocupa largura, e a coluna do sumário é um `flex`
      com `gap:4px` — dois invisíveis empurrariam o título do dia futuro para
      longe do título do dia lido, que é exatamente o desalinhamento que a
      coluna de largura fixa do `ListItem` existe para não ter.
    */
    const { container } = render(
      <PresenceMark label="Ana não leu" name="Ana" state="unread" />,
    );

    expect(container.firstChild).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('is FILLED when the person read and wrote, HOLLOW when only read', () => {
    const { container, rerender } = render(
      <PresenceMark label="Ana leu" name="Ana" state="read" />,
    );

    const mark = () => container.firstElementChild as HTMLElement;

    // Vazado: filete e nenhum preenchimento (`Livro.dc.html:83`).
    expect(mark().className.split(/\s+/u)).toContain('border');
    expect(mark().className.split(/\s+/u)).toContain('border-line-strong');
    expect(mark().className.split(/\s+/u)).not.toContain('bg-accent');

    rerender(<PresenceMark label="Ana escreveu" name="Ana" state="wrote" />);

    // Cheio: preenchimento e nenhum filete (`Livro.dc.html:73`).
    expect(mark().className.split(/\s+/u)).toContain('bg-accent');
    expect(mark().className.split(/\s+/u)).toContain('text-accent-fg');
    expect(mark().className.split(/\s+/u)).not.toContain('border');
  });

  it('⚠️ never lets the COLOUR be the only carrier — full × hollow is SHAPE', () => {
    /*
      Decisão F, com a mesma força do `filter-bar.test.tsx`: a cor nunca é o
      único portador de informação.

      Aqui isso tem DUAS metades, e as duas são necessárias:

      1. **forma** — cheio é preenchimento e vazado é filete. Quem não
         distingue verde de cinza (ou está no sol, ou imprimiu a tela)
         continua vendo a diferença, porque uma tem miolo e a outra é um anel;
      2. **texto** — o nome acessível diz o que a forma quer dizer. "Cheio =
         escreveu" está escrito na legenda do canvas (`Livro.dc.html:68`)
         porque nem a forma é óbvia sozinha.

      Uma asserção que só comparasse os dois `className` passaria trocando
      `bg-accent` por `bg-person` — mudaria o MATIZ e o teste continuaria
      verde. O que se compara aqui é a PROPRIEDADE (preenchimento contra
      contorno) e o nome acessível.
    */
    const { container, rerender } = render(
      <PresenceMark label="Ana leu" name="Ana" state="read" />,
    );
    const hollow = (container.firstElementChild as HTMLElement).className.split(
      /\s+/u,
    );

    rerender(<PresenceMark label="Ana escreveu" name="Ana" state="wrote" />);
    const filled = (container.firstElementChild as HTMLElement).className.split(
      /\s+/u,
    );

    const hasFill = (classes: string[]) =>
      classes.some((name) => name.startsWith('bg-'));
    const hasOutline = (classes: string[]) => classes.includes('border');

    expect(hasFill(hollow)).toBe(false);
    expect(hasOutline(hollow)).toBe(true);
    expect(hasFill(filled)).toBe(true);
    expect(hasOutline(filled)).toBe(false);

    // E os dois estados têm nomes acessíveis diferentes — senão quem ouve a
    // tela receberia "A, imagem" nos dois e a distinção sumiria de vez.
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(
      'Ana escreveu',
    );
  });

  it('⚠️ carries the INITIAL — it is never an anonymous dot (rule 5)', () => {
    const { container } = render(
      <PresenceMark label="Bruno leu" name="Bruno" state="read" />,
    );

    // Uma letra só, como o canvas (`Livro.dc.html:83`: "A"). O `PersonAvatar`
    // usa duas (primeira e última palavra); num disco de 18px duas não cabem.
    expect(container.textContent).toBe('B');
  });

  it('falls back to a neutral glyph when the person has no name yet', () => {
    // `User.name` é nullable: o convite cria a pessoa SEM nome. Uma silhueta,
    // nunca um "?" — interrogação parece cobrança, e o princípio anti-culpa
    // vale até aqui (regra 29 da Tarefa 13, mesma saída do `PersonAvatar`).
    const { container } = render(
      <PresenceMark label="Alguém do clube leu" name={null} state="read" />,
    );

    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('is information, not decoration — role="img" with a name from the screen', () => {
    render(
      <PresenceMark label="Ana leu e escreveu" name="Ana" state="wrote" />,
    );

    // Regra 6. O nome vem por prop, já traduzido: `packages/ui` não conhece
    // catálogo, e "A" sozinho não diz nada a quem ouve.
    const mark = screen.getByRole('img', { name: 'Ana leu e escreveu' });
    expect(mark.tagName).toBe('SPAN');
  });

  it('is the 18px disc of the canvas, in mono', () => {
    const { container } = render(
      <PresenceMark label="Ana leu" name="Ana" state="read" />,
    );

    const classes = (
      container.firstElementChild as HTMLElement
    ).className.split(/\s+/u);
    // 18×18 (`Livro.dc.html:73`) e `border-radius:999px`.
    expect(classes).toContain('size-4.5');
    expect(classes).toContain('rounded-full');
    // A inicial é mono, como todo dado curto do desenho.
    expect(classes).toContain('font-mono');
    expect(classes).toContain('text-micro');
  });
});
