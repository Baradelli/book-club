import { Check, Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react';

import { cx } from '../cx';
import { FOCUS_RING, SPACING_STEP_PX } from './styles';

export type ButtonVariant = 'primary' | 'ghost' | 'seal';
export type ButtonSize = 'md' | 'lg';

/**
 * UMA cor de ação (`--accent`), e o que separa `primary` de `ghost` é
 * preenchimento × fantasma — não matiz. O app não tem hierarquia de botão
 * colorido.
 *
 * ============================================================================
 * TAREFA 41a — `ghost` FICA COM O NOME, `danger` MORRE, `seal` NASCE
 * ============================================================================
 *
 * ⚠️ `secondary` NÃO nasceu, e a razão é medida: `variant="ghost"` tem **29
 * usos em 12 arquivos, todos em `packages/app/src/pages/` e nenhum de teste**
 * (`grep -rn 'variant="ghost"' packages/app/src` dá 29; `grep -rln`, 12), e o
 * `ghost` de hoje **já é** o secundário do canvas (borda `--border`, sem
 * preenchimento). Renomeá-lo tocaria 29 lugares para o nome descrever a mesma
 * coisa — churn sem ganho, e a fatia perderia a propriedade "nenhuma tela
 * tocada", que é o que a torna auditável.
 *
 * (A spec da 41a e o `BACKLOG.md` diziam "15 telas". São 12 — contado. O 29
 * está certo. Corrigido nos três lugares, porque foi este docblock que ficou
 * com o número errado mais tempo, e é ele que o próximo agente lê primeiro.)
 *
 * ⚠️ `danger` SAIU DO TIPO **E** DAQUI (decisão B, §7.1 nos dois sentidos).
 * Medido antes: **zero** consumidores em `packages/{app,ui}/src`, conferido com
 * aspas duplas, aspas simples e ternário — a única ocorrência era a própria
 * declaração do tipo. É o mesmo caso do `--success` da Tarefa 39: o que não tem
 * consumidor não é contrato, é peso.
 *
 * ⚠️ **NÃO CONFUNDIR COM `text-danger`/`border-danger`**, que continuam vivos e
 * fora desta tabela: o erro de formulário é deles, e são **8 telas** de
 * `packages/app/src/pages/` que o escrevem — `accept-invite`, `acervo`,
 * `book-form`, `free-note`, `highlight-fields`, `highlight-form`, `login` e
 * `plan-editor` — mais o `form-styles.ts:28,33` que as serve e o `field.tsx`
 * daqui. (Contado por `grep -rln "FORM_ERROR_CLASS\|text-danger\|border-danger"`
 * em `packages/app/src`, descontando `book.tsx` e `home.tsx`, que só citam os
 * nomes em prosa de docblock para dizer que NÃO usam vermelho. ⚠️ Não confundir
 * com as **9** telas do `TEXT_INPUT_CLASS`: é outra classe e outra conta.)
 *
 * E a guarda `DANGER_STYLE` da varredura anti-culpa casa o nome deles por regex.
 * Um botão destrutivo VOLTA no dia em que existir um — e então ele volta com
 * consumidor.
 *
 * ⚠️ `seal` É ESTADO, NÃO HIERARQUIA. Ele é o "li hoje" **marcado**
 * (`Livro.dc.html:55`: "Li hoje — tirar a marca"), e é dourado por isso: o ouro
 * é o filete da edição crítica — o dia de hoje, a abertura de seção — e não uma
 * terceira cor de ação. Medido nos dois artboards, valor a valor:
 * `background: var(--gold-soft)` · `border: 1px solid var(--gold-line)` ·
 * `color: var(--gold-strong)`.
 *
 * O `hover` muda a BORDA (`--gold-line` → `--gold`) e não o fundo, e isto é
 * medição, não gosto: `--surface-today` **é** `--gold-soft` nos dois temas
 * (nota nº 13 da Tarefa 39), então um `hover:bg-surface-today` seria um hover
 * que não muda um pixel. Os critérios de aceite do MVP 3.5 pedem hover mudando
 * COR, sem `transform` — e a borda é a cor que sobrou.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_12px_-6px_var(--accent)] hover:bg-accent-hover',
  ghost:
    'border border-line bg-surface text-content shadow-card hover:bg-surface-raised',
  seal: 'border border-gold-line bg-gold-soft text-gold-strong hover:border-gold',
};

/**
 * Exportado só para o teste das decisões B e C — a tela usa `variant`.
 *
 * ⚠️ Ele existe porque o `Record<ButtonVariant, string>` obriga a CHAVE e não
 * obriga o VALOR: medido, um `seal: ''` (variante no tipo, sem pintura) passava
 * nos 201 testes de `@clube/ui`.
 */
export const BUTTON_VARIANTS = VARIANT_CLASS;

/**
 * O `heightClass` e o `heightPx` são a MESMA decisão escrita duas vezes, e é
 * de propósito: o Tailwind só compila classe que exista literalmente no
 * código-fonte (`min-h-[${n}px]` montado em runtime não gera CSS nenhum — é o
 * mesmo mecanismo da regra 1), e jsdom não tem layout para medir altura.
 *
 * Então o número fica ao lado da classe e `button.test.tsx` amarra os dois:
 * `min-h-11` tem de valer 11 × 4px, e o resultado tem de ser ≥ 44px (regra 9).
 * Quem baixar o tamanho para caber mais botão na tela quebra o teste.
 */
const SIZE: Record<ButtonSize, { heightClass: string; heightPx: number }> = {
  md: { heightClass: 'min-h-12', heightPx: 12 * SPACING_STEP_PX },
  lg: { heightClass: 'min-h-14', heightPx: 14 * SPACING_STEP_PX },
};

/** Exportado só para o teste da regra 9 — a tela usa `size`. */
export const BUTTON_SIZES = SIZE;

export interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children'
> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Desabilita e mostra o spinner sem mudar a largura (regra 7). */
  loading?: boolean;
}

/**
 * O botão do app.
 *
 * `type="button"` por padrão (regra 5): o default do HTML é `submit`, e um
 * botão de "arquivar" dentro de um formulário submeteria o formulário.
 *
 * `asChild` não existe de propósito (spec): render delegado pede
 * `cloneElement` e um contrato de props que ninguém consegue tipar sem `any`.
 * Precisa de um link com cara de botão? É o `ListItem` com `href`, ou uma tela
 * que aplique as classes — não este componente.
 */
export function Button({
  children,
  className,
  disabled = false,
  loading = false,
  onClick,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...rest
}: ButtonProps) {
  /**
   * REGRA 6: `disabled` E `loading` impedem o clique.
   *
   * O `disabled` no elemento já bastaria num navegador, mas não é onde a regra
   * pode morar: `loading` sem `disabled` (alguém "só quer o spinner") faria o
   * duplo toque gravar duas notas, e um `fireEvent.click` chega ao handler do
   * React mesmo em botão desabilitado. A guarda é no handler, e o `disabled`
   * fica por cima para o cursor e o leitor de tela concordarem.
   */
  const blocked = disabled || loading;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    if (blocked) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      // `aria-busy` é o que ANUNCIA o carregamento (regra 8); o spinner é
      // `aria-hidden`. `undefined` e não `false`: `aria-busy="false"` num botão
      // parado é ruído no DOM.
      aria-busy={loading || undefined}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        FOCUS_RING,
        SIZE[size].heightClass,
        size === 'lg' ? 'px-7 text-lg' : 'px-6 text-base',
        VARIANT_CLASS[variant],
        className,
      )}
      disabled={blocked}
      onClick={handleClick}
      type={type}
    >
      {/*
        REGRA 7: o rótulo NÃO sai do DOM quando carrega — ele fica invisível
        (`invisible`, que reserva o espaço) e o spinner entra fora do fluxo
        (`absolute`). Trocar o rótulo pelo spinner encolheria o botão no meio
        do toque, e o dedo que ia acertar "Salvar" acerta o que estiver do lado.
      */}
      <span
        className={cx('inline-flex items-center gap-2', loading && 'invisible')}
      >
        {/*
          O SELO do canvas, e só na variante `seal`.

          `lucide-react` (`CLAUDE.md`), não o `<polyline>` do artboard: SVG
          inline em `ui/src` é proibido por `adr-0002-iconography.test.ts`,
          porque a varredura de termos do ADR 0002 pega PALAVRA e desenho não
          tem palavra nenhuma para ela achar. Com o glifo vindo do lucide, o
          NOME importado (`Check`) cai na varredura.

          Ele mora DENTRO do `<span>` do rótulo de propósito: assim ele some
          junto com o rótulo no `loading` (regra 7) em vez de ficar ao lado do
          spinner, e a largura do botão não muda.

          `aria-hidden`: o nome acessível é o rótulo. "Marca de seleção, Li
          hoje — tirar a marca" é a mesma coisa dita duas vezes.
        */}
        {variant === 'seal' ? (
          <Check aria-hidden="true" className="size-4" focusable="false" />
        ) : null}
        {children}
      </span>
      {loading ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          {/*
            `lucide-react` (`CLAUDE.md`: "Ícones: lucide-react"), e não um arco
            desenhado à mão: SVG inline em `ui/src` é proibido por teste, porque
            é assim que um cadeado entra sem a varredura do ADR 0002 ver — ela
            pega PALAVRA, e desenho não tem palavra.

            `aria-hidden`: quem anuncia o carregamento é o `aria-busy` do botão
            (regra 8). Um segundo anúncio pelo ícone só duplicaria a fala.
          */}
          <Loader2
            aria-hidden="true"
            className="size-5 animate-spin"
            focusable="false"
          />
        </span>
      ) : null}
    </button>
  );
}
