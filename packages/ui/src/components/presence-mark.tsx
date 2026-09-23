import { User } from 'lucide-react';

import { cx } from '../cx';
import { initialsFromName } from './initials';

/**
 * OS TRÊS ESTADOS, E O TERCEIRO É A AUSÊNCIA (decisão E da Tarefa 41b).
 *
 * - `wrote` — leu **e** escreveu: disco CHEIO (`Livro.dc.html:73`);
 * - `read` — leu: disco VAZADO (`Livro.dc.html:83`);
 * - `unread` — não leu: **nada é renderizado** (`Livro.dc.html:150,157,164`,
 *   onde a coluna aparece vazia).
 *
 * ⚠️ O enum tem o terceiro caso de propósito, em vez de a tela simplesmente
 * não renderizar o componente. É aqui que a regra "não leu = nada" fica
 * escrita e testada; se ela morasse em cada tela, ela morreria na primeira que
 * esquecesse — e o sintoma (um dia futuro com um disco pálido) não parece
 * defeito, parece desenho.
 *
 * ⚠️⚠️ **`'unread'` NÃO TEM CONSUMIDOR DE PRODUÇÃO, E ISSO FOI MEDIDO —
 * decisão da rodada de correção da Tarefa 44 (2026-09-22): ele FICA.**
 *
 * `grep` em `packages/` fora de teste: **zero** ocorrências de `state="unread"`.
 * A única é `presence-mark.test.tsx:42`, o teste que o guarda — ou seja, a
 * guarda é auto-referente. Medido por mutação: apagado o
 * `if (state === 'unread') return null`, os acusadores são **1** em
 * `@clube/ui` (302/303) e **0** em `@clube/app` (927/927 verdes).
 *
 * **Por que fica, mesmo assim:**
 *
 * 1. apagá-lo estreitaria o tipo para `'read' | 'wrote'` e a regra "não leu =
 *    nada" deixaria de estar escrita em lugar nenhum — ela voltaria a ser
 *    intenção, que é o §7.9 ao contrário;
 * 2. o consumidor tem endereço conhecido: a coluna de largura fixa do
 *    `ListItem` (`list.tsx`, `data-sumario-marks`) já existe, e a tela do
 *    livro hoje resolve o dia sem marca com `start={undefined}`. Trocar essa
 *    decisão é fatia de tela, não de componente;
 * 3. nenhuma decisão do dono desta rodada pediu mudança de API em
 *    `packages/ui`.
 *
 * ⚠️ **E o registro honesto da fragilidade:** o argumento do alinhamento que
 * este docblock dá **não** é o que o mantém vivo hoje — a coluna de 44px do
 * `ListItem` já segura o alinhamento sozinha. Quem reabrir isto tem a medição
 * acima e não precisa refazê-la. **Pergunta em aberto para o dono:** ou o
 * `'unread'` ganha consumidor quando a tela decidir desenhar a ausência, ou
 * ele sai junto com esta decisão — o que não pode é continuar sem nenhuma das
 * duas coisas escrita.
 */
export type PresenceState = 'read' | 'wrote' | 'unread';

/**
 * ⚠️ MAPA LITERAL (decisão C): `` `bg-${tone}` `` compila e pinta nada.
 *
 * E as duas linhas dizem a decisão F: o que separa os dois estados é a FORMA —
 * preenchimento contra contorno —, não o matiz. Quem não distingue as cores
 * continua vendo um disco cheio e um anel.
 */
const STATE_CLASS: Record<'read' | 'wrote', string> = {
  // `Livro.dc.html:83`: `border:1px solid var(--border-strong)`,
  // `color:var(--text-muted)`, sem preenchimento nenhum.
  read: 'border border-line-strong text-muted',
  // `Livro.dc.html:73`: `background:var(--accent)`, `color:var(--accent-fg)`,
  // sem filete. Contraste da inicial sobre o disco: 11,91:1 no claro e 6,90:1
  // no escuro (fórmula da WCAG 2.1 3.2.2).
  wrote: 'bg-accent text-accent-fg',
};

export interface PresenceMarkProps {
  state: PresenceState;
  /** `User.name`, nullable porque o convite cria a pessoa sem nome. */
  name: string | null;
  /**
   * Nome acessível, JÁ TRADUZIDO pela tela — "Ana leu", "Ana leu e escreveu".
   *
   * ⚠️ Obrigatório, e não opcional como no `PersonAvatar`: ali o nome da
   * pessoa está escrito ao lado e o avatar seria repetição; aqui a marca é a
   * ÚNICA coisa que diz quem passou por aquele dia, e uma letra solta não é
   * informação para quem ouve. A legenda do canvas ("Cheio = escreveu",
   * `Livro.dc.html:68`) existe porque nem para quem vê a forma é óbvia.
   */
  label: string;
  className?: string;
}

/**
 * A MARCA DE PRESENÇA — quem do clube leu aquele dia, e quem escreveu.
 *
 * ⚠️ **A COLUNA VAZIA DO DIA FUTURO NÃO É DAQUI.** No canvas
 * (`Livro.dc.html:150`) o dia que ainda não chegou tem um
 * `<div style="width:44px">` sem nada dentro: é ele que segura o alinhamento
 * dos títulos entre um dia lido e um dia futuro. Esse `div` é do `ListItem`
 * (`list.tsx:262-267`, `data-sumario-marks`), e é justamente por ele existir
 * que o terceiro estado daqui pode ser ausência de verdade — sem ele, "não
 * renderizar nada" desalinharia o sumário e alguém "consertaria" com um disco
 * transparente.
 *
 * ⚠️ **E ELE NÃO É CONTADOR.** "Incentivo por presença, não por comparação"
 * (`docs/plano-clube-do-livro.md` §1): a marca diz QUE alguém passou, nunca
 * quantas vezes, nunca quem passou mais.
 *
 * Uma medida do canvas que NÃO virou prop: o desktop desenha 19×19
 * (`LivroDesktop.dc.html:72`) contra os 18×18 do celular
 * (`Livro.dc.html:73`). Um pixel não paga uma prop — a marca fica em 18px nas
 * duas larguras, e a divergência está registrada.
 */
export function PresenceMark({
  className,
  label,
  name,
  state,
}: PresenceMarkProps) {
  // O estado que não desenha. `null` e não um disco transparente: veja o
  // docblock acima, e `presence-mark.test.tsx › renders NOTHING`.
  if (state === 'unread') return null;

  const initials = initialsFromName(name);
  /*
    UMA letra, e não as duas do `PersonAvatar`.

    `Array.from` e não `initials[0]`: indexar string anda por UNIDADE DE
    CÓDIGO, e uma inicial fora do BMP devolveria metade de um par surrogate —
    o caractere de substituição na tela. É o mesmo cuidado (e o mesmo motivo)
    do `firstLetterOf` de `initials.ts`.
  */
  const initial = initials === null ? null : Array.from(initials)[0];

  return (
    <span
      aria-label={label}
      className={cx(
        /*
          `Livro.dc.html:73`: 18×18 (`size-4.5`), `border-radius:999px`,
          mono 9px — o degrau mais próximo da escala é `--size-micro` (9,5px),
          que o `theme.css` descreve como "mono: a marca de presença".

          `box-border` explícito porque o canvas usa `box-sizing:border-box` no
          vazado: sem ele o filete de 1px faria o disco vazado ficar 2px maior
          que o cheio, e a coluna dançaria de linha para linha.
        */
        'box-border inline-flex size-4.5 shrink-0 select-none items-center justify-center rounded-full font-mono text-micro',
        STATE_CLASS[state],
        className,
      )}
      role="img"
    >
      {initial === undefined || initial === null ? (
        // Sem nome, a silhueta neutra do `lucide-react` — nunca um "?", que
        // parece cobrança (regra 29 da Tarefa 13).
        <User aria-hidden="true" className="size-1/2" focusable="false" />
      ) : (
        initial
      )}
    </span>
  );
}
