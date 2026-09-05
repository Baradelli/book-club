import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * O `renderLink` do `ListItem`, com o `Link` do react-router.
 *
 * ⚠️ **ELE EXISTE PORQUE A ÂNCORA CRUA RECARREGA O PWA** — o docblock do
 * `ListItem` tem a história inteira. `<a href>` é navegação de DOCUMENTO: num
 * PWA ela recarrega o shell e perde o estado em memória (a sessão, o clube
 * ativo, o rascunho do editor). E trocar por `onClick` + `useNavigate` seria um
 * defeito por outro — perderia Ctrl+clique e "abrir em nova aba". O `Link`
 * renderiza um `<a href>` de verdade **e** intercepta o clique normal.
 *
 * ⚠️ **E É POR ISSO QUE ELE TEM MÓDULO PRÓPRIO, e não mora na tela do livro.**
 * MEDIDO na revisão da Tarefa 17: ele nasceu em `pages/book.tsx` e as DUAS
 * listas que navegam no app o usam — a estante da **home** e o plano da tela do
 * **livro**. Com ele exportado de uma tela, o acusador do link da home vivia na
 * suíte da OUTRA tela: apagar o `renderLink` da home deixava `home.test.tsx`
 * 23/23 verde, e o vermelho aparecia (ou não) em `book.test.tsx`, com um nome
 * de teste que fala do plano. Uma dependência entre telas é o tipo de coisa que
 * a próxima fatia move sem reparar; um módulo neutro que as duas importam não
 * tem lado.
 *
 * O tipo do parâmetro é escrito à mão porque o `ListItemLinkProps` **não é
 * exportado** pelo barril de `@clube/ui` (registrado no relatório da Tarefa
 * 17); a compatibilidade é estrutural, sem um `as`.
 */
export function listItemRouterLink({
  children,
  className,
  href,
}: {
  className: string;
  href: string;
  children: ReactNode;
}): ReactNode {
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
}
