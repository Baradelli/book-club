/**
 * A cor do `PersonAvatar`, derivada do `id` (decisão E).
 *
 * Do `id` e não do nome, por duas razões medidas no schema: `User.name` é
 * NULLABLE (o convite cria a pessoa antes de ela escolher um nome), então
 * derivar do nome deixaria metade dos avatares sem cor; e a cor de alguém não
 * pode mudar quando essa pessoa se renomeia — a cor é como o clube reconhece
 * quem escreveu.
 */

/** Os slots declarados em `packages/ui/src/theme.css`. */
export const AVATAR_PALETTE_SIZE = 6;

/**
 * As classes literais, uma por slot.
 *
 * `bg-avatar-${n}` montado em runtime NÃO geraria CSS: o Tailwind compila o
 * que existe literalmente no código-fonte (é o mesmo mecanismo da regra 1). O
 * teste da regra 1 confere que as seis estão no CSS compilado, e o da regra 30
 * confere que a tabela tem `AVATAR_PALETTE_SIZE` entradas.
 */
const BACKGROUND_CLASS = [
  'bg-avatar-1',
  'bg-avatar-2',
  'bg-avatar-3',
  'bg-avatar-4',
  'bg-avatar-5',
  'bg-avatar-6',
] as const;

export const AVATAR_BACKGROUND_CLASSES: readonly string[] = BACKGROUND_CLASS;

/**
 * FNV-1a de 32 bits — determinístico, sem dependência, e espalha bem o que
 * este app tem de verdade: UUID v4 e ids de teste que só diferem no sufixo.
 *
 * `Math.imul` e não `*`: a multiplicação de ponto flutuante perde os bits
 * baixos acima de 2^53 e o hash deixa de ser o mesmo em máquinas diferentes.
 *
 * Não é criptografia e não precisa ser: só decide uma cor. O sorteio que
 * PRECISA ser seguro (o `code` do convite) é do backend e usa `node:crypto`.
 */
export function avatarPaletteIndex(id: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash % AVATAR_PALETTE_SIZE;
}

export function avatarBackgroundClass(id: string): string {
  return BACKGROUND_CLASS[avatarPaletteIndex(id)] ?? BACKGROUND_CLASS[0];
}
