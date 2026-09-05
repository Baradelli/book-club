import type { ReactNode } from 'react';

import { cx } from '../cx';
import { FOCUS_RING } from './styles';

export interface FilterChipProps {
  /** Já traduzido pela tela — "Tudo", "Minhas", ou o nome da pessoa. */
  label: string;
  /**
   * REGRA 25: `pressed`, e não `checked`.
   *
   * `aria-checked` pertence a `radio`/`checkbox`, e usá-lo num botão faz o
   * leitor de tela anunciar um controle de formulário que não existe. O chip é
   * um botão de dois estados: `aria-pressed`.
   */
  pressed: boolean;
  onPress: () => void;
  /** Slot de início — o `PersonAvatar` do chip "de \<pessoa\>". */
  start?: ReactNode;
  className?: string;
}

/**
 * O `Tudo · Minhas · de <pessoa>` do ADR 0002.
 *
 * ⚠️ ELE É NAVEGAÇÃO, NÃO PERMISSÃO.
 *
 * `docs/adr/0002-visibilidade-total-no-clube.md`: dentro do clube não existe
 * conteúdo privado — toda anotação e todo grifo são visíveis para os membros
 * ativos desde o instante em que são salvos. O filtro é uma forma de OLHAR o
 * mesmo acervo.
 *
 * Consequência de interface, e é o que o teste da regra 27 varre: nenhum
 * cadeado, nenhum olho fechado, nenhum rótulo de "privado" ou "visível para".
 * Um ícone desses ensinaria ao usuário uma regra que o sistema não tem — e
 * quem acreditar nele escreve pensando que ninguém vai ler.
 *
 * Também não existe contador ao lado do nome: "incentivo por presença, não por
 * comparação" (`docs/plano-clube-do-livro.md` §1). O chip diz DE QUEM é o
 * acervo que você está olhando, não quanto essa pessoa escreveu.
 */
export function FilterChip({
  className,
  label,
  onPress,
  pressed,
  start,
}: FilterChipProps) {
  return (
    /*
      REGRA 26: `<button>` NATIVO.

      É a plataforma que dá Enter e Espaço de graça. Um `<div role="button"
      onClick>` responde ao Enter (o clique sintético do React) e fica MUDO no
      Espaço — e Espaço é a tecla que quem usa leitor de tela aperta.
    */
    <button
      aria-pressed={pressed}
      className={cx(
        'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
        pressed
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-line bg-surface text-muted hover:border-line-strong hover:text-content',
        FOCUS_RING,
        className,
      )}
      onClick={onPress}
      type="button"
    >
      {start !== undefined ? (
        <span className="flex shrink-0 items-center">{start}</span>
      ) : null}
      {label}
    </button>
  );
}
