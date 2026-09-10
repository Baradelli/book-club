import type { ReactNode } from 'react';

import { cx } from '../cx';
import { FilterChip } from './filter-chip';

/**
 * Uma opção do filtro — um chip.
 *
 * ⚠️ O `label` é **obrigatório**, e isso é a regra 3 da Tarefa 27 escrita no
 * compilador: **cor (ou avatar) nunca é o único portador de informação**. Foi
 * medido na Tarefa 25 — apagar o nome da cor dá 2 acusadores —, e quem não
 * distingue as cinco cores da paleta, ou as iniciais de duas pessoas, fica sem
 * nada. A amostra entra pelo `start`; o nome, pelo `label`.
 */
export interface FilterOption {
  /**
   * A identidade da opção **dentro do grupo**: a `key` do React, o que é
   * comparado com o `selected` e o que volta no callback.
   *
   * Ela é `string` de propósito, e não um genérico: os valores de uma dimensão
   * são dinâmicos (o `userId` de cada membro do clube só existe em runtime), e
   * um genérico por grupo não sobrevive a um array de grupos heterogêneos —
   * `(v: 'all' | 'mine') => void` não é atribuível a `(v: string) => void` com
   * `strictFunctionTypes`. Quem estreita é a tela, que é dona do vocabulário.
   */
  value: string;
  /** JÁ TRADUZIDO pela tela — "Tudo", "Minhas", "Amarelo", ou o nome da pessoa. */
  label: string;
  /**
   * Slot de início: o `PersonAvatar` do chip "de \<pessoa\>", a amostra da cor.
   *
   * ⚠️ **O SLOT NÃO ERA SEM CHAMADOR — a afirmação da decisão D estava ERRADA,
   * e a auditoria a mediu.** `git grep "start="` mostra o
   * `start={<ColorSwatch …>}` num `<FilterChip>` em `highlights.tsx` **e** em
   * `highlight-fields.tsx`, desde as Tarefas 24/25 — e uma dessas duas linhas é
   * justamente a que a Tarefa 27 migrou para cá.
   *
   * O que é **novo** é o `PersonAvatar` neste slot: até aqui ele só carregou
   * amostra de cor, e é o avatar de uma pessoa que exige que o `label` textual
   * ao lado seja obrigatório (a inicial não identifica ninguém sozinha).
   */
  start?: ReactNode;
}

/**
 * Uma dimensão do filtro: um rótulo acessível e N opções, com **uma** escolhida.
 *
 * ⚠️ **CONTROLADO (decisão A): o grupo diz o que está selecionado, e o
 * componente nunca muda isso por si.** É o padrão dos seis componentes da
 * Tarefa 13, e é o que permite a tela decidir se o filtro vive na URL, no
 * `useState` ou em nada.
 */
export interface FilterGroup {
  /** Identidade do grupo — a `key` do React. Não aparece na tela. */
  id: string;
  /**
   * JÁ TRADUZIDO: o nome acessível do grupo (decisão C).
   *
   * Sem ele, quem usa leitor de tela ouve doze botões seguidos sem saber onde
   * acaba "pessoa" e começa "cor".
   */
  label: string;
  options: readonly FilterOption[];
  /**
   * O `value` da opção pressionada. Um valor que não está em `options` deixa o
   * grupo inteiro solto — e é a tela que decide se isso pode acontecer.
   */
  selected: string;
  /** Recebe a opção escolhida. A tela é que muda o estado (decisão A). */
  onSelect: (option: FilterOption) => void;
}

export interface FilterBarProps {
  groups: readonly FilterGroup[];
  className?: string;
}

/**
 * O FILTRO COMPARTILHADO — a barra de `FilterChip` que as telas do acervo
 * dividem (Tarefa 27).
 *
 * ⚠️ **ELE É NAVEGAÇÃO, NÃO PERMISSÃO.**
 *
 * `docs/adr/0002-visibilidade-total-no-clube.md`: dentro do clube não existe
 * conteúdo privado — toda anotação e todo grifo são visíveis para os membros
 * ativos desde o instante em que são salvos. Todo grupo desta barra é uma forma
 * de OLHAR o mesmo acervo: nenhum cadeado, nenhum olho fechado, nenhum rótulo
 * de "privado" ou "visível para". Um ícone desses ensinaria ao usuário uma regra
 * que o sistema não tem — e quem acreditar nele escreve pensando que ninguém
 * vai ler. O acusador é `src/__tests__/adr-0002-iconography.test.ts`, que varre
 * `ui/src` inteiro e proíbe também `<svg>` inline (a lista pega PALAVRA, e
 * desenho não tem palavra).
 *
 * Também não existe contador ao lado do nome: "incentivo por presença, não por
 * comparação" (`docs/plano-clube-do-livro.md` §1). O chip diz DE QUEM é o
 * acervo que você está olhando, não quanto essa pessoa escreveu.
 *
 * ⚠️ **E ELE É AGNÓSTICO DE DIMENSÃO (decisão G): não sabe o que é "pessoa",
 * "tipo", "leitura" ou "cor".** Só renderiza grupos de opções. É isso que faz o
 * grupo de leitura da Tarefa 28 não exigir reabrir `packages/ui`, **sem**
 * entregar hoje um grupo sem chamador — quatro props nomeadas seriam quatro
 * cópias da mesma acessibilidade, e a quinta dimensão voltaria aqui.
 *
 * ⚠️ **O CHIP "TUDO" É DO CHAMADOR (decisão H), não injetado por aqui.**
 * Injetá-lo obrigaria o componente a saber que existe um estado neutro — e o
 * grupo de tipo, na Tarefa 28, pode não ter. E o rótulo dele é texto, que só a
 * tela sabe traduzir (`packages/ui` não conhece i18n — decisão B da Tarefa 13).
 */
export function FilterBar({ className, groups }: FilterBarProps) {
  return (
    <div className={cx('flex flex-col gap-2', className)}>
      {groups.map((group) => (
        <div
          aria-label={group.label}
          /*
            `role="group"` com `aria-label` PRÓPRIO — decisão C. É o que dá
            fronteira ao conjunto: sem ele os chips de todas as dimensões viram
            uma fileira única de botões para quem ouve a tela.
          */
          className="flex flex-wrap items-center gap-2"
          key={group.id}
          role="group"
        >
          {group.options.map((option) => (
            <FilterChip
              key={option.value}
              label={option.label}
              onPress={() => {
                // A barra devolve a OPÇÃO e não mexe em nada: quem guarda a
                // escolha é a tela (decisão A).
                group.onSelect(option);
              }}
              pressed={option.value === group.selected}
              start={option.start}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
