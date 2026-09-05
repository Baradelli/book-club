import { User } from 'lucide-react';

import { cx } from '../cx';
import { avatarBackgroundClass } from './avatar-color';
import { initialsFromName } from './initials';

export type PersonAvatarSize = 'sm' | 'md';

const SIZE_CLASS: Record<PersonAvatarSize, string> = {
  sm: 'size-8 text-xs',
  md: 'size-11 text-sm',
};

export interface PersonAvatarProps {
  /** `User.id`. É dele que sai a cor (decisão E). */
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
 */
export function PersonAvatar({
  className,
  id,
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
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-avatar-fg',
        SIZE_CLASS[size],
        // A cor vem do `id` e o contraste contra `text-avatar-fg` é testado nos
        // dois temas (regra 32) — o gerador não pode sortear um par ilegível.
        avatarBackgroundClass(id),
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
