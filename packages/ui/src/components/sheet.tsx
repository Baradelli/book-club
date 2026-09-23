import { X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';

import { cx } from '../cx';
import { FOCUS_RING } from './styles';

/**
 * A classe que trava o scroll do fundo (regra 20).
 *
 * É um utilitário do Tailwind, e não `style.overflow = 'hidden'`, porque o
 * `CLAUDE.md` proíbe CSS inline. E é uma CONSTANTE porque o Tailwind só
 * compila classe que exista literalmente no código-fonte: montar o nome em
 * runtime não geraria CSS nenhum (é o mesmo mecanismo da regra 1). O teste da
 * regra 1 confere que `overflow-hidden` está no CSS compilado.
 */
export const SCROLL_LOCK_CLASS = 'overflow-hidden';

/**
 * Os elementos que recebem foco por Tab. Sem `[tabindex="-1"]`: o painel tem
 * `tabIndex={-1}` para ser focado por código, e ele não pode entrar no ciclo.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Já traduzido. Vira o rótulo acessível do diálogo (regra 21). */
  title: string;
  /** Já traduzido. `aria-label` do botão de fechar. */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * O sheet do app: SOBE DE BAIXO no celular e fica centrado no desktop
 * (decisão D).
 *
 * O princípio "escrever no celular, à noite, na cama, com uma mão" manda no
 * mobile: um modal centralizado põe os botões no meio da tela, longe do
 * polegar. No desktop largo um painel colado embaixo fica esquisito — mesmo
 * componente, dois layouts, um `sm:`.
 *
 * Fechado, ele NÃO está no DOM (regra 15). `hidden` bastaria para a vista, mas
 * o conteúdo continuaria tabulável: quem navega por teclado cairia dentro de
 * um sheet invisível e não entenderia onde o foco foi.
 */
export function Sheet({
  children,
  className,
  closeLabel,
  onClose,
  open,
  title,
}: SheetProps) {
  if (!open) return null;

  return (
    <SheetPanel
      className={className}
      closeLabel={closeLabel}
      onClose={onClose}
      title={title}
    >
      {children}
    </SheetPanel>
  );
}

/**
 * O painel vive num componente próprio para que MONTAR seja o evento de
 * abertura e DESMONTAR seja o de fechamento: o `useEffect` sem dependências
 * roda uma vez ao abrir e a limpeza dele roda ao fechar. Se isto morasse no
 * `Sheet`, cada efeito precisaria de um `if (!open)` e a devolução do foco
 * (regra 19) dependeria de ler o valor anterior do prop.
 */
function SheetPanel({
  children,
  className,
  closeLabel,
  onClose,
  title,
}: Omit<SheetProps, 'open'>) {
  const panelRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;

  /**
   * O `onClose` num ref para o efeito de teclado não ser remontado a cada
   * render: numa tela real o handler é uma arrow function nova em cada render,
   * e reassinar o listener a cada um perderia a tecla digitada no meio.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    /*
      REGRA 19: o foco VOLTA para quem abriu.

      Capturado aqui, no efeito, e não no render: neste ponto o painel ainda
      não foi focado, então `activeElement` é mesmo o botão que abriu. Sem
      isto, fechar o sheet joga o foco para o `<body>` e quem usa teclado
      recomeça a tabular da barra do navegador.
    */
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    // REGRA 20: o fundo não rola enquanto o sheet está aberto.
    document.body.classList.add(SCROLL_LOCK_CLASS);

    // O foco entra no painel, não no primeiro botão: assim o leitor de tela
    // anuncia o título do diálogo antes de qualquer ação.
    panelRef.current?.focus();

    return () => {
      document.body.classList.remove(SCROLL_LOCK_CLASS);
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // REGRA 16: `Esc` fecha.
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      /*
        REGRA 18: o foco não ESCAPA para o fundo.

        Sem isto, o Tab depois do último controle do sheet vai para o link que
        está atrás do backdrop — clicável para o teclado e invisível para o
        olho. O ciclo é fechado à mão porque `inert` ainda não é confiável em
        todo navegador que este PWA precisa abrir.
      */
      const panel = panelRef.current;
      if (panel === null) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (first === undefined || last === undefined) {
        // Sheet sem nenhum controle: o Tab não tem para onde ir a não ser para
        // fora, então ele simplesmente não anda.
        event.preventDefault();
        panel.focus();
        return;
      }

      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    // `items-end` no celular (sobe de baixo) e `sm:items-center` no desktop.
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/*
        O backdrop é IRMÃO do painel, não pai: assim o clique dentro do painel
        nunca borbulha até aqui, e a regra 17 ("clique dentro NÃO fecha") não
        depende de `stopPropagation` espalhado pelo conteúdo.

        ⚠️ `bg-scrim` e não `bg-black/50` (Tarefa 39, decisão G). O véu é token
        do canvas (`--scrim`), e a troca é o que permitiu `--color-*: initial`
        ficar SEM EXCEÇÃO NENHUMA no `@theme inline`: `--color-black` era a
        única sobrevivente da paleta do Tailwind, e uma exceção é uma porta por
        onde uma cor de fora do sistema compila e pinta. A opacidade mora dentro
        do `rgba()` do token, então não há mais modificador `/50` aqui.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-scrim"
        data-sheet-backdrop=""
        onClick={onClose}
      />
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={cx(
          /*
            ⚠️ `bg-surface` E NÃO `bg-surface-raised` — decisão do dono de
            2026-09-21, e é o que o canvas desenha (`Avulsa.dc.html:79`:
            `background:var(--surface)`). Era `--surface-2` desde a Tarefa 13.

            ⚠️ MEDIDO, porque o medo que adiou a troca era o oposto da verdade:
            `--text-subtle` (a dica de campo, que aparece DENTRO do sheet) dá
            **4,93:1** sobre `--surface` contra **4,54:1** sobre `--surface-2`.
            Trocar o papel do sheet MELHORA o pior caso de contraste da Tarefa
            39 — não o invalida.

            E o desenho fecha o argumento: um painel que flutua SOBRE a página
            sendo mais ESCURO que ela é o contrário de elevação. O que separa o
            sheet do fundo são outras três coisas, e as três estão aqui: o
            scrim, a sombra que sobe (`--shadow-sheet`, negativa no Y) e o
            filete de topo.
          */
          'relative flex max-h-[90dvh] w-full flex-col overflow-y-auto border-t border-line bg-surface text-content shadow-sheet',
          /*
            ⚠️ `--radius-sheet` VALE 10px DESDE A TAREFA 41a (decisão I), e até
            então valia 4px: a escala de quatro raios não tinha o 10px que o
            canvas desenha (`Avulsa.dc.html:79`,
            `border-radius: 10px 10px 0 0`), então o token apontava para
            `--r-3`. A pendência estava escrita na nota nº 4 da Tarefa 39, e o
            `--r-4` nasceu para fechá-la.

            O par é uma decisão só: só o topo arredonda no celular (o painel
            sobe de baixo) e os quatro cantos arredondam no desktop (ele fica
            centrado).
          */
          'rounded-t-sheet sm:max-w-lg sm:rounded-sheet',
          FOCUS_RING,
          className,
        )}
        ref={panelRef}
        role="dialog"
        tabIndex={-1}
      >
        {/*
          A ALÇA do canvas (`Avulsa.dc.html:80`): 36×4 em `--border-strong`,
          centrada, com raio de pílula. Ela diz "isto sobe e desce" no celular.

          ⚠️ `<div aria-hidden>` e NÃO `<button>`: ela é decoração. Quem ouve a
          tela já recebe "diálogo, <título>" pelo `aria-labelledby`, e uma alça
          focável poria um elemento que não faz nada na frente do ciclo de Tab
          (regra 18).

          `sm:hidden`: no desktop o painel é CENTRADO (decisão D da Tarefa 13) e
          não sobe de lugar nenhum — uma alça ali seria um enfeite mentindo
          sobre o gesto.
        */}
        <div
          aria-hidden="true"
          className="mx-auto mt-3 h-1 w-9 shrink-0 rounded-pill bg-line-strong sm:hidden"
          data-sheet-handle=""
        />
        <header className="flex items-start justify-between gap-3 border-b border-line p-4">
          <h2 className="text-lg font-semibold" id={titleId}>
            {title}
          </h2>
          <button
            aria-label={closeLabel}
            className={cx(
              'flex size-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-surface hover:text-content',
              FOCUS_RING,
            )}
            onClick={onClose}
            type="button"
          >
            {/* `lucide-react`, não um X à mão: SVG inline em `ui/src` é
                proibido por teste (o desenho é o buraco por onde um ícone de
                privacidade passa pela varredura do ADR 0002). O nome
                acessível é o `aria-label` do botão. */}
            <X aria-hidden="true" className="size-5" focusable="false" />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
