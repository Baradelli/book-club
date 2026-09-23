import { User } from 'lucide-react';

import { cx } from '../cx';
import { initialsFromName } from './initials';

export type PersonAvatarSize = 'sm' | 'md';

/**
 * Os dois tamanhos do canvas, medidos: 20px dentro de uma linha
 * (`Acervo.dc.html:92`, com a inicial em 9px) e 26px como marca do autor de uma
 * anotação (`Dia.dc.html:90`, inicial em 11px). O artboard do acervo também
 * usa 24px/10px na linha principal; os dois degraus daqui a cercam.
 *
 * ⚠️ ELE ENCOLHEU, e de propósito: `md` era `size-11` (44px), o alvo de toque
 * de um BOTÃO. O avatar não é botão — é uma marca dentro de uma linha que já é
 * o alvo —, e 44px de marca empurrava o título do item para o canto.
 */
const SIZE_CLASS: Record<PersonAvatarSize, string> = {
  sm: 'size-5 text-micro',
  md: 'size-6.5 text-label',
};

export interface PersonAvatarProps {
  /**
   * `User.id`.
   *
   * ⚠️ ELE NÃO PINTA MAIS NADA, e isto é a decisão F do MVP 3.5: a paleta de 6
   * cores derivada do `id` morreu, e ficou o par único `--person-*` do canvas.
   * Quem carrega identidade é a INICIAL.
   *
   * A prop FICA, e a razão é medida: 8 telas passam `id=` hoje, e removê-la do
   * tipo faria o `tsc` acusar oito arquivos de `packages/app/src/pages/` — que é
   * exatamente o que a decisão K desta fatia proíbe tocar. É dívida registrada
   * para as Tarefas 42–48, que reescrevem essas telas: quem mexer numa delas
   * tira o `id` de lá, e quando a última sair esta prop sai também.
   */
  id: string;
  /** `User.name` é nullable no banco — daí o `| null`. */
  name: string | null;
  size?: PersonAvatarSize;
  /**
   * Nome acessível, JÁ TRADUZIDO, para quando o avatar aparece SOZINHO (num
   * chip de filtro, por exemplo).
   *
   * Sem ele o avatar é `aria-hidden`, que é o certo no caso comum: dentro de um
   * `ListItem` o nome da pessoa já está escrito ao lado, e anunciar "MS,
   * imagem" antes dele só faz o leitor de tela repetir.
   */
  label?: string;
  className?: string;
}

/**
 * Quem escreveu.
 *
 * ⚠️ Ele existe para dizer QUEM, e nada mais. "Incentivo por presença, não por
 * comparação" (`docs/plano-clube-do-livro.md` §1): nunca um contador ao lado,
 * nunca ordenação por volume, nunca medalha ou selo de sequência. Se uma tela
 * precisar mostrar quanto alguém escreveu, essa tela está errada antes de este
 * componente estar.
 *
 * ⚠️ **O "SELO DE SEQUÊNCIA" EXISTE DESDE A TAREFA 38c — e não é este
 * componente.** O dono pediu a corrente de leitura e reafirmou com a objeção na
 * mão (→ `docs/adr/0010-corrente-de-leitura-visivel.md`). ✅ **Medido, e é o
 * que salva esta regra:** a `StreakBar` do app **não importa o `PersonAvatar`**
 * — ela escreve o nome e o fogo por conta própria. A regra daqui continua
 * valendo como está escrita: **este** componente não ganha contador nem selo, e
 * quem precisar de um constrói fora dele, à vista de todo mundo.
 */
export function PersonAvatar({
  className,
  label,
  name,
  size = 'md',
}: PersonAvatarProps) {
  const initials = initialsFromName(name);

  return (
    <span
      // Nome acessível só quando a tela pede; senão sai do caminho do leitor.
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      className={cx(
        /*
          ⚠️ O PAR ÚNICO DO CANVAS (decisão F do MVP 3.5), medido em
          `Acervo.dc.html:79,92,100,113` e `Dia.dc.html:90`: `--person-bg` de
          fundo, filete de 1px em `--person-border`, inicial em `--person-fg`
          e em MONOESPAÇADA.

          O filete não é enfeite: o avatar aparece dentro de um chip e de uma
          linha que também são claros, e sem a borda a marca se dissolve na
          superfície. E a inicial é mono porque é a mesma família de todo
          rótulo/dado curto do desenho — o avatar é um dado, não uma palavra.

          `font-semibold` saiu: o canvas não pesa a inicial, e mono já tem
          largura de traço uniforme. O contraste do par é medido nos dois temas
          por `src/__tests__/avatar-contrast.test.ts`.
        */
        'inline-flex shrink-0 select-none items-center justify-center rounded-full border border-person-line bg-person font-mono text-person-fg',
        SIZE_CLASS[size],
        className,
      )}
      role={label === undefined ? undefined : 'img'}
    >
      {initials === null ? (
        /*
          REGRA 29: sem nome, um glifo NEUTRO — e sem estourar.
          Uma silhueta, não um "?": interrogação parece cobrança, e o princípio
          anti-culpa vale até no avatar de quem ainda não escolheu um nome.

          `lucide-react` (`CLAUDE.md`), não a silhueta desenhada à mão que
          estava aqui: SVG inline em `ui/src` é proibido por teste, porque é o
          desenho — e não a palavra — que atravessa a varredura do ADR 0002.
        */
        <User aria-hidden="true" className="size-1/2" focusable="false" />
      ) : (
        initials
      )}
    </span>
  );
}
