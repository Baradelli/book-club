import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FilterChip } from '../filter-chip';

/**
 * Regras 25 e 26.
 *
 * ⚠️ A REGRA 27 (o ADR 0002) NÃO MORA MAIS AQUI. Ela morava, e era o buraco:
 * a varredura por "cadeado / olho fechado / privado" lia só o
 * `filter-chip.tsx`, então o mesmo ícone no `list.tsx` — ou um "Só você vê" no
 * `ListItem` — passava pelos 89 testes da fatia. Ela foi para
 * `src/__tests__/adr-0002-iconography.test.ts`, que varre `ui/src` inteiro e
 * proíbe também `<svg>` inline: a lista pega PALAVRA, e um cadeado desenhado à
 * mão não tem palavra nenhuma para ela achar (medido).
 */

describe('FilterChip', () => {
  it('reflects the state in aria-pressed, not in aria-checked (rule 25)', () => {
    const { rerender } = render(
      <FilterChip label="Minhas" onPress={vi.fn()} pressed={false} />,
    );

    const chip = screen.getByRole('button', { name: 'Minhas' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    // `aria-checked` pertence a radio/checkbox: num botão ele faz o leitor de
    // tela anunciar um controle de formulário que não existe.
    expect(chip.hasAttribute('aria-checked')).toBe(false);

    rerender(<FilterChip label="Minhas" onPress={vi.fn()} pressed />);

    // As DUAS direções: um `aria-pressed` fixo passaria com metade do teste, e
    // quem ouve a tela nunca saberia qual filtro está ativo.
    expect(
      screen
        .getByRole('button', { name: 'Minhas' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('is a native button, which is what gives it Enter and Space (rule 26)', () => {
    render(<FilterChip label="Tudo" onPress={vi.fn()} pressed={false} />);

    const chip = screen.getByRole('button', { name: 'Tudo' });

    // jsdom não implementa o comportamento de ATIVAÇÃO por teclado (apertar
    // Espaço num `<button>` real dispara `click`; no jsdom, não dispara), então
    // o que se pina é o mecanismo que a plataforma usa: um `<button>` de
    // verdade. Um `<div role="button" onClick>` responde ao Enter — pelo
    // clique sintético do React — e fica MUDO no Espaço, que é justamente a
    // tecla de quem usa leitor de tela.
    expect(chip.tagName).toBe('BUTTON');
    expect(chip.getAttribute('type')).toBe('button');
  });

  it('calls onPress when activated (rule 26)', () => {
    const onPress = vi.fn();
    render(<FilterChip label="Tudo" onPress={onPress} pressed={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tudo' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps the resting chip hollow and muted, the tone the canvas gives EVERY unpicked pill (Tarefa 41a)', () => {
    /*
      ⚠️ ESTE TESTE NASCEU MEDINDO O ELEMENTO ERRADO, E A AUDITORIA PEGOU.

      A primeira versão citava `Acervo.dc.html:63,65` e exigia
      `bg-surface-raised text-content`. Medido: `:63` é um **contêiner** e `:65`
      é um `<span>` de 30px **não interativo** — o chip REMOVÍVEL de filtro
      aplicado, um componente que nem existe em `packages/ui` (quem o cria é a
      Tarefa 46). Não é o `FilterChip`.

      ⚠️⚠️ **E O NOME DESTE TESTE MUDOU NA RODADA DE CORREÇÃO DA 47a, porque o
      "IT" que ele prometia deixou de existir.** Ele dizia "the way the canvas
      draws IT", e o "IT" era a paleta de canetas de `NovoGrifo.dc.html`. A
      Tarefa 47a mediu o custo de pintar o pressionado por `className`, não
      tomou esse caminho, e a paleta virou uma pílula LOCAL do app — este
      componente **não implementa mais artboard nenhum**, e a auditoria inteira
      da 41a estava pendurada num desenho que ele já não desenha.

      ⚠️ E o ponteiro que estava aqui era **por linha**
      (`highlight-fields.tsx:138`), que é o que o §7.4 proíbe nominalmente:
      medido na rodada de correção, aquela linha já era outra coisa. Quem quiser
      ver a pílula de caneta procura por `PenPill`, pelo NOME.

      **O valor medido continua de pé — o que mudou é de onde ele vem.** A
      paleta de `CorrigirGrifo.dc.html` e `NovoGrifo.dc.html` desenha o repouso
      de uma pílula não escolhida, e é o mesmo repouso que o canvas dá a toda
      pílula em repouso; o consumidor real deste componente (o `FilterBar`)
      herda esse tom. Medido lá, valor a valor:

      - repouso: `<button height:44px>` com `background:none`,
        `border:1px solid var(--border)`, `border-radius:999px`, Geist 13px e
        **`color:var(--text-muted)`**;
      - pressionado: `background:var(--pen-a)` (a cor da própria caneta) com
        `border:1.5px solid var(--gold)` e `color:var(--text)`.

      Ou seja: o `bg-transparent text-muted` que estava aqui desde a Tarefa 13
      **é o do canvas**, e o repinte era opinião de desenho minha contra a
      fonte. Revertido. O canvas manda — é decisão fechada do MVP 3.5.

      ⚠️ E O PRESSIONADO NÃO FOI TOCADO — nem pela 41a nem pela 47a. No canvas
      da paleta ele é a cor da CANETA com filete dourado mais grosso, e a 47a
      mediu que trazê-lo para cá custaria QUATRO sobreposições num componente
      que não resolve conflito de utilitário. Ficou local no app. O estado
      "escolhido" genérico daqui é o que o projeto já tinha e continua sendo o
      das dimensões que não têm cor própria.

      O que este teste guarda é a DIFERENÇA entre os dois estados: um chip que
      pintasse igual solto e pressionado deixaria `aria-pressed` como único
      portador da informação — o mesmo defeito que o `filter-bar.test.tsx`
      proíbe do outro lado (cor não pode ser o único portador; o inverso vale).
    */
    const { rerender } = render(
      <FilterChip label="Amarelo" onPress={vi.fn()} pressed={false} />,
    );

    const resting = screen
      .getByRole('button', { name: 'Amarelo' })
      .className.split(/\s+/u);
    expect(resting).toContain('rounded-full');
    expect(resting).toContain('bg-transparent');
    expect(resting).toContain('text-muted');
    expect(resting).toContain('border-line');
    expect(resting).not.toContain('bg-surface-raised');

    rerender(<FilterChip label="Amarelo" onPress={vi.fn()} pressed />);

    const pressed = screen
      .getByRole('button', { name: 'Amarelo' })
      .className.split(/\s+/u);
    expect(pressed).toContain('bg-accent');
    expect(pressed).toContain('text-accent-fg');
    expect(pressed).not.toContain('bg-transparent');
    expect(pressed).not.toContain('text-muted');
  });
});
