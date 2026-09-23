import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { initialsFromName } from '../initials';
import { PersonAvatar } from '../person-avatar';

/**
 * Regras 28–31. (A 32, o contraste nos dois temas, mora em
 * `src/__tests__/avatar-contrast.test.ts` — ela é sobre o `theme.css`.)
 *
 * ⚠️ O `describe('avatarPaletteIndex (rule 30)')` INTEIRO — 4 `it()` — e o
 * `takes the colour from the id, not from the name` SAÍRAM nesta fatia, e não
 * por atalho: a decisão F do MVP 3.5 mata a paleta de 6 cores, então a
 * propriedade que eles mediam **deixou de existir**. Não há mais índice, não há
 * mais tabela de seis classes e não há mais hash a espalhar. O que ficou no
 * lugar é o par único `--person-*` do canvas, e a propriedade nova está medida
 * em `paints every member with the ONE person pair` abaixo.
 *
 * O RACIOCÍNIO, escrito aqui para o próximo agente não o reinventar: quem
 * carrega identidade é a INICIAL, não a cor — e o `filter-bar.test.tsx` já cobra
 * isso por escrito ("cor (e avatar) não pode ser o ÚNICO portador de
 * informação"). Seis cores que ninguém consegue nomear não identificam ninguém;
 * duas iniciais, sim.
 */

describe('initialsFromName (rules 28, 31)', () => {
  it('takes one letter from a single word (rule 28)', () => {
    expect(initialsFromName('Marcos')).toBe('M');
  });

  it('takes the first and the last word when there are two or more (rule 28)', () => {
    expect(initialsFromName('Marcos Baradelli')).toBe('MB');
    // Três palavras: a do meio não entra — "MRS" não é como ninguém se
    // apresenta, e três letras não cabem no avatar `sm`.
    expect(initialsFromName('Maria Rita Souza')).toBe('MS');
  });

  it('ignores the particles of a Portuguese name (rule 28)', () => {
    // "Maria de Souza" é MS, não MD.
    expect(initialsFromName('Maria de Souza')).toBe('MS');
    expect(initialsFromName('João da Silva')).toBe('JS');
    expect(initialsFromName('Ana dos Santos Lima')).toBe('AL');

    // ⚠️ MEDIDO: as três linhas acima NÃO provam o filtro de partículas.
    // Como as iniciais saem da primeira e da ÚLTIMA palavra, uma partícula no
    // meio não muda o resultado — o mutante que apaga o filtro sobreviveu às
    // três. As duas linhas abaixo são as que o matam: partícula na BORDA, que
    // é o que um nome digitado por gente produz (a pessoa para de digitar no
    // meio, ou cola só o sobrenome).
    expect(initialsFromName('Maria de')).toBe('M');
    expect(initialsFromName('de Souza')).toBe('S');
  });

  it('falls back to the particle when the name is only a particle (rule 28)', () => {
    // Melhor uma letra estranha do que o glifo neutro para quem TEM nome.
    expect(initialsFromName('De')).toBe('D');
  });

  it('keeps the accent instead of stripping or breaking it (rule 31)', () => {
    // "A" em vez de "Â" não quebra nada visível — só apaga o nome de alguém.
    expect(initialsFromName('Ângela Nogueira')).toBe('ÂN');
    expect(initialsFromName('Óscar')).toBe('Ó');
  });

  it('survives a one-letter name (rule 31)', () => {
    expect(initialsFromName('J')).toBe('J');
    expect(initialsFromName('J K')).toBe('JK');
  });

  it('skips emoji instead of slicing a surrogate pair (rule 31)', () => {
    expect(initialsFromName('🎉 Maria Silva')).toBe('MS');
    expect(initialsFromName('Maria 🎉')).toBe('M');

    // ⚠️ MEDIDO: as duas linhas acima não provam nada sobre par surrogate — um
    // emoji SEPARADO por espaço é descartado como palavra antes de chegar à
    // extração, e o mutante `word[0]` sobreviveu às duas. O caso que morde é o
    // emoji GRUDADO na palavra: indexar por unidade de código devolve meia
    // metade do par, e o avatar mostra "�" no lugar da inicial.
    expect(initialsFromName('🎉Maria Silva')).toBe('MS');
    expect(initialsFromName('🎉Maria')).toBe('M');
  });

  it('has nothing to extract from a name with no letters (rules 29, 31)', () => {
    expect(initialsFromName('🎉')).toBeNull();
    expect(initialsFromName('   ')).toBeNull();
    expect(initialsFromName('')).toBeNull();
  });

  it('has nothing to extract from a null name (rule 29)', () => {
    // `User.name` é NULLABLE: o convite cria a pessoa antes de ela escolher um
    // nome, e essa pessoa aparece na lista de membros do mesmo jeito.
    expect(initialsFromName(null)).toBeNull();
  });
});

describe('PersonAvatar', () => {
  it('shows the initials of the name it was given (rule 28)', () => {
    render(<PersonAvatar id="user-1" label="Maria Souza" name="Maria Souza" />);

    expect(screen.getByRole('img', { name: 'Maria Souza' }).textContent).toBe(
      'MS',
    );
  });

  it('falls back to a neutral glyph, with no text, when the name is null (rule 29)', () => {
    render(<PersonAvatar id="user-1" label="Membro do clube" name={null} />);

    const avatar = screen.getByRole('img', { name: 'Membro do clube' });

    // Uma silhueta, não um "?": interrogação parece cobrança, e o princípio
    // anti-culpa vale até no avatar de quem ainda não escolheu um nome.
    expect(avatar.textContent).toBe('');
    expect(avatar.querySelector('svg')).not.toBeNull();
  });

  it('paints every member with the ONE person pair of the canvas (decision F)', () => {
    /*
      ⚠️ A DECISÃO F DO MVP 3.5, EXECUTADA: a paleta de 6 cores morreu, e ficou
      o par único `--person-bg` / `--person-border` / `--person-fg` — medido em
      `Acervo.dc.html:79,92,100,113` e `Dia.dc.html:90`, onde os cinco avatares
      do canvas usam exatamente esses três tokens.

      O que este teste guarda é o SENTIDO da decisão, não a cor: duas pessoas
      diferentes recebem a MESMA moldura, e o que as distingue é a inicial. Um
      componente que voltasse a sortear cor por `id` — o "só um hashzinho" que
      parece inofensivo — falha aqui.

      E os três tokens andam juntos: o canvas desenha o avatar como uma marca de
      TINTA sobre papel claro com um filete em volta. Sem o filete
      (`--person-border`) a marca desaparece dentro da própria superfície do
      chip, que também é clara.
    */
    const { container, rerender } = render(
      <PersonAvatar id="user-1" name="Maria Souza" />,
    );

    const first = container.firstElementChild?.className ?? '';
    for (const utility of [
      'bg-person',
      'border-person-line',
      'text-person-fg',
      'font-mono',
      'rounded-full',
    ]) {
      expect(first.split(/\s+/u)).toContain(utility);
    }

    rerender(<PersonAvatar id="user-2" name="João Silva" />);
    expect(container.firstElementChild?.className).toBe(first);

    // E nenhum resquício da paleta: `bg-avatar-*` e `text-avatar-fg` morreram
    // junto com os tokens, e uma classe sem CSS emitido pinta TRANSPARENTE em
    // silêncio (o acusador estrutural é `ui-source-scan.test.ts`).
    expect(first).not.toContain('avatar');
  });

  it('stays out of the screen reader path when the screen gave it no label', () => {
    // O caso comum: dentro de um `ListItem` o nome já está escrito ao lado, e
    // anunciar "MS, imagem" antes dele só faz o leitor de tela repetir.
    render(<PersonAvatar id="user-1" name="Maria Souza" />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('MS').getAttribute('aria-hidden')).toBe('true');
  });
});
