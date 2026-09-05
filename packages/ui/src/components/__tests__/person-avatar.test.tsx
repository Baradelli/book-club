import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AVATAR_BACKGROUND_CLASSES,
  AVATAR_PALETTE_SIZE,
  avatarBackgroundClass,
  avatarPaletteIndex,
} from '../avatar-color';
import { initialsFromName } from '../initials';
import { PersonAvatar } from '../person-avatar';

/**
 * Regras 28–31. (A 32, o contraste nos dois temas, mora em
 * `src/__tests__/avatar-contrast.test.ts` — ela é sobre o `theme.css`.)
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

describe('avatarPaletteIndex (rule 30)', () => {
  it('gives the same id the same colour every time', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

    // A cor é como o clube reconhece quem escreveu. Se ela sorteasse a cada
    // render, a lista de anotações mudaria de cara a cada rolagem.
    expect(avatarPaletteIndex(id)).toBe(avatarPaletteIndex(id));
    expect(avatarBackgroundClass(id)).toBe(avatarBackgroundClass(id));
  });

  it('spreads different ids over the whole palette', () => {
    // Ids GERADOS, não escolhidos: uma lista escrita à mão até dar seis cores
    // diferentes provaria só que a lista foi escolhida. Um hash degenerado
    // (`id.length % 6`, `charCodeAt(0) % 6`) falha aqui.
    const used = new Set<number>();
    for (let index = 0; index < 120; index += 1) {
      used.add(avatarPaletteIndex(`user-${index}`));
    }

    expect(used.size).toBe(AVATAR_PALETTE_SIZE);
  });

  it('never points outside the palette', () => {
    for (const id of ['', 'a', '🎉', 'x'.repeat(500)]) {
      const index = avatarPaletteIndex(id);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(AVATAR_PALETTE_SIZE);
      expect(AVATAR_BACKGROUND_CLASSES).toContain(avatarBackgroundClass(id));
    }
  });

  it('has one literal class per palette slot', () => {
    // O Tailwind só compila classe LITERAL: uma tabela com menos entradas que
    // a paleta faria `avatarBackgroundClass` cair no slot 0 em silêncio, e
    // metade do clube ficaria da mesma cor.
    expect(AVATAR_BACKGROUND_CLASSES).toHaveLength(AVATAR_PALETTE_SIZE);
    expect(new Set(AVATAR_BACKGROUND_CLASSES).size).toBe(AVATAR_PALETTE_SIZE);
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

  it('takes the colour from the id, not from the name (rule 30)', () => {
    // Decisão E: `User.name` é nullable e muda quando a pessoa se renomeia. Se
    // a cor viesse do nome, ela mudaria junto — e o clube perderia a única
    // pista visual de quem escreveu.
    const { container, rerender } = render(
      <PersonAvatar id="user-1" name="Maria Souza" />,
    );
    const before = container.firstElementChild?.className;

    rerender(<PersonAvatar id="user-1" name="Maria Souza Nogueira" />);
    expect(container.firstElementChild?.className).toBe(before);

    rerender(<PersonAvatar id="user-2" name="Maria Souza" />);
    expect(container.firstElementChild?.className).not.toBe(before);
  });

  it('stays out of the screen reader path when the screen gave it no label', () => {
    // O caso comum: dentro de um `ListItem` o nome já está escrito ao lado, e
    // anunciar "MS, imagem" antes dele só faz o leitor de tela repetir.
    render(<PersonAvatar id="user-1" name="Maria Souza" />);

    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('MS').getAttribute('aria-hidden')).toBe('true');
  });
});
