import type { ReactNode } from 'react';

import { cx } from '../cx';

export interface SaveIndicatorProps {
  /**
   * Já traduzido e já formatado pela tela — "Salvo 21:04", "Rascunho
   * guardado".
   *
   * ⚠️ O RELÓGIO TAMBÉM É DA TELA. Formatar "21:04" exige o `timezone` do
   * `Settings`, e "que horas são ali" é conta que o `CLAUDE.md` concentra em
   * dois helpers nomeados — nenhum deles mora em `packages/ui`.
   */
  children: ReactNode;
  className?: string;
}

/**
 * O AVISO DO AUTOSAVE — a nota discreta ao lado do rótulo da seção.
 *
 * Medido: `letter-spacing:0.1em`, maiúsculo, `'Geist Mono'` e
 * `color:var(--text-subtle)` nos QUATRO artboards (`Dia.dc.html:56`,
 * `Avulsa.dc.html:41`, `NovoGrifo.dc.html:96`, `DiaDesktop.dc.html:52`).
 *
 * ⚠️ **O CORPO NÃO É UNÂNIME, e a primeira entrega desta fatia dizia que era.**
 * São **9,5px em três** (os de celular) e **10px no de desktop**
 * (`DiaDesktop.dc.html:52`). Entregue em `text-micro` (9,5px), que é a maioria
 * e é o degrau que o `theme.css` descreve como "a nota de margem — o menor que
 * ainda se lê". Meio pixel não paga uma media query; o que não podia ficar era
 * a palavra "concordam" sobre uma amostra que não concorda (a classe nº 4 da
 * lista da Tarefa 41a: generalização de amostra).
 *
 * ============================================================================
 * ⚠️ ELE NÃO É REGIÃO VIVA, E ISSO É DECISÃO — não esquecimento
 * ============================================================================
 *
 * O reflexo num indicador de salvamento é `role="status"` com
 * `aria-live="polite"`. Aqui isso seria um defeito: o autosave dispara
 * enquanto a pessoa **digita**, e uma região viva faria o leitor de tela
 * interromper a frase dela para dizer "Salvo 21:04", de novo, e de novo. Num
 * app cujo §1 é "escrever no celular, à noite, na cama, com uma mão", esse é o
 * barulho que faz alguém desligar o leitor de tela.
 *
 * O aviso fica como texto de verdade, no caminho de quem lê: nada se perde
 * além da interrupção. E uma FALHA de salvamento — que é rara e urgente, não
 * ruído — pertence ao erro de formulário, que já tem tratamento próprio.
 *
 * ⚠️ **E A TINTA É `--text-subtle`, NÃO `--text-faint`.** O `theme.css`
 * descreve `--text-faint` como "o que quase não se lê: o dia futuro apagado,
 * o 'Salvo' do autosave" — mas ele dá 2,45:1 no claro e 2,58:1 no escuro,
 * contra um piso de 4,5:1, e há uma guarda apontada para o primeiro uso dele.
 * O canvas pinta este aviso com `--text-subtle` (4,54 a 4,93 no claro), que é
 * o que está aqui. Quem "corrigir" pelo comentário do `theme.css` fica
 * vermelho — e a saída é escurecer o token, não apagar a guarda (nota nº 5 da
 * Tarefa 41a).
 */
export function SaveIndicator({ children, className }: SaveIndicatorProps) {
  return (
    <span
      className={cx(
        'font-mono text-micro uppercase tracking-[0.1em] text-subtle',
        className,
      )}
    >
      {children}
    </span>
  );
}
