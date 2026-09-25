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
        /*
          ⚠️ O REPOUSO É O DO CANVAS, E ELE JÁ ESTAVA CERTO — a Tarefa 41a
          tentou repintá-lo e a auditoria reverteu, porque a medição original
          era do elemento errado.

          A primeira versão desta fatia citou `Acervo.dc.html:63,65` e trocou
          para `bg-surface-raised text-content`. Medido depois: `:63` é um
          **contêiner** e `:65` é um `<span>` de 30px **não interativo** — o
          chip REMOVÍVEL de filtro aplicado, componente que nem existe aqui
          (quem o cria é a Tarefa 46).

          ⚠️⚠️ **E ESTE COMPONENTE JÁ NÃO DESENHA ARTBOARD NENHUM — corrigido
          na rodada de correção da Tarefa 47a.** A frase que estava aqui dizia
          que a paleta de canetas do canvas era "literalmente o que
          `highlight-fields.tsx:138` renderiza com este componente". Medido: a
          47a mediu o custo de pintar o pressionado por `className` (quatro
          sobreposições, e o `cx` não resolve conflito de utilitário), não
          tomou esse caminho, e a paleta nasceu como uma pílula LOCAL do app.
          Este componente não é mais renderizado naquela tela, em linha
          nenhuma — e o ponteiro era **por linha**, que é o que o §7.4 proíbe
          nominalmente: a linha 138 já tinha virado outra coisa.

          O repouso que a Tarefa 41a reverteu continua certo, e a medição dele
          continua de pé: as pílulas não escolhidas do canvas são
          `<button height:44px>` com `background:none`,
          `border:1px solid var(--border)`, `border-radius:999px` e
          **`color:var(--text-muted)`** — é o tom que o desenho dá a toda
          pílula em repouso, e é o que o `FilterBar` (o consumidor real deste
          componente) herda. O que mudou é de onde a prova vem: não de um
          artboard que este arquivo implementa, e sim do vocabulário de
          repouso do canvas inteiro.

          ⚠️ E A ALTURA NÃO É DIVERGÊNCIA: o canvas desenha este chip com
          **44px**, o mesmo piso da decisão F. (A pílula "Refinar" de 36px é do
          `FilterBar`, não deste componente, e ali o piso vence.)

          ⚠️ **O PRESSIONADO DA PALETA DE CANETAS NÃO É MAIS ASSUNTO DAQUI.**
          Ele é a cor da própria caneta com filete dourado de 1,5px, e a
          Tarefa 47a mediu que trazê-lo para cá custaria **quatro**
          sobreposições (preenchimento, cor do filete, **espessura** do filete
          e cor do texto) num componente que não resolve conflito de
          utilitário — quem venceria seria a ordem de emissão do CSS, a mesma
          invariante que a auditoria da Tarefa 46 teve de pinar à mão. A
          pílula de caneta é local de `highlight-fields.tsx` (procure por
          `PenPill`, **não por número de linha**).

          O estado "escolhido" daqui é o GENÉRICO, das dimensões que não têm
          cor própria — e é o que o `FilterBar` usa.
        */
        pressed
          ? 'border-accent bg-accent text-accent-fg'
          : 'border-line-soft bg-surface text-muted shadow-card hover:text-content',
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
