import type { ReactNode } from 'react';

import { cx } from '../cx';
import { FOCUS_RING, SPACING_STEP_PX } from './styles';

export interface ListProps {
  children: ReactNode;
  /** Já traduzido. Nomeia a lista para o leitor de tela. */
  'aria-label'?: string;
  className?: string;
}

/**
 * A lista de livros (Tarefa 16), de anotações (19) e o plano de leitura (17).
 *
 * `<ul>` de verdade, e não um `<div>` com cara de lista: é o que faz o leitor
 * de tela anunciar "lista, 12 itens" — a informação que diz se vale a pena
 * continuar tabulando.
 */
export function List({ children, className, ...rest }: ListProps) {
  return (
    // `role="list"` EXPLÍCITO com `list-none`: o Safari remove a semântica de
    // lista de um `<ul>` com `list-style: none` — o marcador some e a fala
    // "lista, 12 itens" some com ele. É o par que se esquece.
    <ul
      className={cx('flex list-none flex-col', className)}
      role="list"
      {...rest}
    >
      {children}
    </ul>
  );
}

/**
 * A altura mínima do item. Mesma disciplina do `Button`: o número ao lado da
 * classe, porque o Tailwind precisa da classe literal e jsdom não mede layout.
 * 56px é acima do piso de 44px (decisão F) — o item de lista é o alvo que se
 * acerta com o polegar rolando a tela, e ele é o mais generoso do app.
 */
export const LIST_ITEM_HEIGHT_CLASS = 'min-h-14';
export const LIST_ITEM_HEIGHT_PX = 14 * SPACING_STEP_PX;

interface ListItemBase {
  /** Já traduzido (ou conteúdo do usuário, que não se traduz). */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Slot de início: avatar de quem escreveu, ícone do dia. */
  start?: ReactNode;
  /**
   * Slot de fim: data, contador, chevron.
   *
   * ⚠️ Conteúdo NÃO interativo. O item inteiro já é um `button`/`a` (regra 22),
   * e um botão dentro de outro é HTML inválido — o navegador desfaz o
   * aninhamento e o layout quebra de um jeito difícil de achar.
   */
  end?: ReactNode;
  className?: string;
}

/**
 * O que o `ListItem` entrega a quem renderiza a âncora: o endereço, as classes
 * da superfície inteira e o conteúdo já montado.
 *
 * `className` vai junto de propósito — o alvo de toque, o `hover` e o anel de
 * foco são do `ListItem`, não do consumidor. Quem troca o elemento não deve ter
 * de saber (nem copiar) a lista de classes.
 */
export interface ListItemLinkProps {
  className: string;
  href: string;
  children: ReactNode;
}

/** O padrão: uma âncora de verdade. */
function defaultRenderLink({ className, href, children }: ListItemLinkProps) {
  return (
    <a className={className} href={href}>
      {children}
    </a>
  );
}

/**
 * REGRA 24: sem `href` é `button`, com `href` é `a`, e NUNCA os dois.
 *
 * A união discriminada é o que impede o erro na origem: passar `href` e
 * `onClick` juntos não compila. Um `<a>` com `onClick` e sem `href` não é
 * focável por teclado; um `<button>` com `href` ignora o link e não abre em
 * nova aba com Ctrl+clique — os dois defeitos são invisíveis com mouse.
 *
 * ⚠️ **E O `renderLink` EXISTE PORQUE A ÂNCORA CRUA RECARREGA O PWA.**
 *
 * `<a href>` é navegação de DOCUMENTO: num PWA com react-router ela **recarrega
 * o shell inteiro** e perde o estado em memória (a sessão do `AuthProvider`, o
 * clube ativo, o rascunho do editor). A Tarefa 16 registrou o achado e propôs,
 * para a 17, trocar por `onClick` + `useNavigate` — **e essa troca é um defeito
 * por outro**: perde Ctrl+clique e "abrir em nova aba", que é exatamente o que o
 * docblock acima argumenta que a âncora existe para dar. Um `onClick` sem `href`
 * não tem endereço nenhum para o navegador abrir.
 *
 * A saída é INVERSÃO, e ela é obrigatória, não estética: `packages/ui` **não
 * pode** importar `react-router-dom` como dependência de runtime — um design
 * system não conhece o roteador do app, e o barril passaria a arrastá-lo para
 * dentro de todo bundle que importa um `Button`. Então quem sabe do roteador é o
 * consumidor, e ele passa o `Link`:
 *
 * ```tsx
 * <ListItem
 *   href={bookPath(book.id)}
 *   renderLink={({ href, className, children }) => (
 *     <Link className={className} to={href}>
 *       {children}
 *     </Link>
 *   )}
 *   title={book.title}
 * />
 * ```
 *
 * O `Link` do react-router renderiza um `<a href>` de verdade, então Ctrl+clique
 * e "abrir em nova aba" continuam funcionando — e o clique normal é interceptado
 * e vira navegação de rota, sem recarga. Os dois defeitos vão embora juntos.
 */
export type ListItemProps =
  | (ListItemBase & {
      href: string;
      onClick?: never;
      renderLink?: (props: ListItemLinkProps) => ReactNode;
    })
  | (ListItemBase & {
      href?: undefined;
      onClick: () => void;
      renderLink?: never;
    });

export function ListItem({
  className,
  end,
  href,
  onClick,
  renderLink = defaultRenderLink,
  start,
  subtitle,
  title,
}: ListItemProps) {
  /*
    REGRA 22: o item INTEIRO é o alvo — um `button`/`a` só, ocupando a linha.

    Um `<div onClick>` com um link pequeno dentro é o padrão que o celular
    castiga: o dedo acerta a linha e nada acontece. E `div` com `onClick` não
    recebe foco nem responde a Enter/Espaço.
  */
  const surface = cx(
    'flex w-full items-center gap-3 rounded-control p-3 text-left transition-colors',
    'hover:bg-surface',
    LIST_ITEM_HEIGHT_CLASS,
    FOCUS_RING,
    className,
  );

  const content = (
    <>
      {start !== undefined ? (
        <span className="flex shrink-0 items-center">{start}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-medium text-content">{title}</span>
        {subtitle !== undefined ? (
          <span className="truncate text-sm text-muted">{subtitle}</span>
        ) : null}
      </span>
      {end !== undefined ? (
        <span className="shrink-0 text-sm text-muted">{end}</span>
      ) : null}
    </>
  );

  return (
    <li className="flex">
      {href !== undefined ? (
        renderLink({ className: surface, href, children: content })
      ) : (
        <button className={surface} onClick={onClick} type="button">
          {content}
        </button>
      )}
    </li>
  );
}
