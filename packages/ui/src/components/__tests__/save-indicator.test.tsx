import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SaveIndicator } from '../save-indicator';

/**
 * TAREFA 41b — O AVISO DO AUTOSAVE.
 *
 * ⚠️ QUEM CONSOME (nota nº 10 da Tarefa 41a: parta do consumidor). As três
 * telas que escrevem: o dia (`pages/day-note.tsx`, Tarefa 43), a anotação
 * avulsa (`pages/free-note.tsx`, 45) e o formulário de grifo
 * (`pages/highlight-form.tsx`, 47). É o que hoje aparece cravado nelas como
 * "Salvo …" ao lado do rótulo da seção.
 *
 * As medidas, nos artboards dessas telas. ⚠️ **A família e a tinta são
 * unânimes nos quatro; o CORPO não é** — 9,5px nos três de celular e 10px no
 * de desktop:
 *
 * | tela | linha | valor |
 * | --- | --- | --- |
 * | dia | `Dia.dc.html:56` | `'Geist Mono'` 9,5px, `letter-spacing:0.1em`, maiúsculo, `color:var(--text-subtle)` |
 * | avulsa | `Avulsa.dc.html:41` | idem |
 * | grifo | `NovoGrifo.dc.html:96` | idem |
 * | dia, desktop | `DiaDesktop.dc.html:52` | idem, com 10px |
 */
describe('SaveIndicator', () => {
  it('draws the quiet sans note of the redesign', () => {
    /*
      ⚠️ **O REDESENHO VISUAL (2026-09-24) TIROU A MONO MAIÚSCULA DAQUI.** A
      tabela do docblock acima é a medida antiga do canvas, guardada como
      histórico. O aviso agora é a nota discreta de app: `text-label` (13px)
      em `font-medium`. O que continua sendo a propriedade é o tom BAIXO —
      peso médio, nunca semibold, para não competir com o rótulo da seção.
    */
    render(<SaveIndicator>Salvo 21:04</SaveIndicator>);

    const classes = screen.getByText('Salvo 21:04').className.split(/\s+/u);
    expect(classes).toContain('text-label');
    expect(classes).toContain('font-medium');
    expect(classes).not.toContain('font-semibold');
    expect(classes).not.toContain('font-mono');
    expect(classes).not.toContain('uppercase');
  });

  it('uses the faded grey that STILL passes contrast', () => {
    /*
      ⚠️ `text-subtle` e não `text-faint`, e é medição, não gosto.

      O canvas pinta este aviso com `--text-subtle` (`Dia.dc.html:56`), que é o
      que está entregue. Mas o `theme.css` descreve `--text-faint` como "o que
      quase não se lê: o dia futuro apagado, **o 'Salvo' do autosave**" — e
      `--text-faint` dá 2,45:1 no claro e 2,58:1 no escuro, contra um piso de
      4,5:1. Se alguém "corrigir" isto pelo comentário do `theme.css`, a
      guarda `refuses the FIRST USE of text-faint while it fails contrast`
      fica vermelha, e a saída é escurecer o token — não apagar a guarda
      (nota nº 5 da Tarefa 41a).

      `--text-subtle` passa nos dois temas contra as três superfícies
      (4,54 a 4,93 no claro; 4,82 a 5,79 no escuro).
    */
    render(<SaveIndicator>Rascunho guardado</SaveIndicator>);

    const classes = screen
      .getByText('Rascunho guardado')
      .className.split(/\s+/u);
    expect(classes).toContain('text-subtle');
    expect(classes).not.toContain('text-faint');
  });

  it('⚠️ is NOT a live region — it must not talk over whoever is writing', () => {
    /*
      DECISÃO DESTA FATIA, e ela é o oposto do reflexo.

      O reflexo de acessibilidade num indicador de salvamento é
      `role="status"` + `aria-live="polite"`. Aqui isso seria um defeito: o
      autosave dispara enquanto a pessoa DIGITA, e uma região viva faria o
      leitor de tela interromper a frase dela para dizer "Salvo 21:04", de
      novo, e de novo. Num app cujo §1 é "escrever no celular, à noite, na
      cama", isso é o barulho que faz alguém desligar o leitor de tela.

      O aviso fica como TEXTO de verdade, ao lado do rótulo da seção: quem
      quiser conferir se salvou, navega até ele. Nenhuma informação se perde —
      só o interrompimento.

      ⚠️ Se uma tela precisar ANUNCIAR uma FALHA de salvamento (que é evento
      raro e urgente, não ruído), o lugar disso é o erro de formulário, que já
      tem tratamento próprio — não este componente.
    */
    const { container } = render(<SaveIndicator>Salvo 22:40</SaveIndicator>);

    const note = container.firstElementChild as HTMLElement;
    expect(note.hasAttribute('aria-live')).toBe(false);
    expect(note.getAttribute('role')).toBe(null);
    // E ele NÃO está escondido: o texto continua no caminho de quem lê.
    expect(note.hasAttribute('aria-hidden')).toBe(false);
  });

  it('carries no text of its own — even the word "Salvo" comes from the screen', () => {
    /*
      Decisão A. E o relógio também é da tela: formatar "21:04" exige o
      `timezone` do `Settings`, e "que horas são ali" é conta que o
      `CLAUDE.md` põe em dois helpers nomeados, nenhum deles em
      `packages/ui`.
    */
    const { container } = render(<SaveIndicator>{null}</SaveIndicator>);

    expect(container.textContent).toBe('');
  });

  it('lets the screen place it without losing its own type (className)', () => {
    render(<SaveIndicator className="ml-auto">Salvo 21:04</SaveIndicator>);

    const classes = screen.getByText('Salvo 21:04').className.split(/\s+/u);
    expect(classes).toContain('ml-auto');
    expect(classes).toContain('text-label');
  });
});
