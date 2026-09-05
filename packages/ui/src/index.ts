// @clube/ui — o design system do clube (Tarefa 13).
//
// ⚠️ O EDITOR NÃO ENTRA NESTE BARRIL, e é decisão medida (rodada de correção
// da Tarefa 15). Ele tem entrada própria — `@clube/ui/editor`, em
// `src/editor.ts` — porque enquanto ele era reexportado daqui, **toda tela que
// importava um botão puxava `@tiptap/*` + `prosemirror-*` + `tippy.js` pelo
// grafo de módulos**: o bundle do login foi para 684 kB, e a única coisa que o
// trazia de volta a 342 kB era uma exceção de `treeshake.moduleSideEffects` no
// `vite.config.ts` do app — ou seja, a poda dependia de CONFIGURAÇÃO.
//
// Com o editor fora daqui, ela é estrutural: não existe aresta do barril até o
// TipTap. Não reexporte o `RichEditor` daqui "por conveniência" — o acusador é
// `packages/app/src/__tests__/bundle-guard.test.ts`, que compila de verdade.
//
// O `@clube/app` NÃO tem `@tiptap/*` no `package.json` dele de propósito (§1 do
// `docs/EDITOR.md`): quem depende de TipTap é este pacote.
//
// ⚠️ NENHUM componente daqui chama `t()`.
//
// Decisão B da Tarefa 13: texto entra por prop, já traduzido pela tela. Se o
// `ui` traduzisse, ele passaria a ser dono de chave de catálogo e o
// `CustomTypeOptions` da Tarefa 12 — que vive em `packages/app` — deixaria de
// valer para ele. O acusador é `src/__tests__/no-i18n.test.ts`.
//
// ⚠️ E NENHUM ÍCONE DAQUI É DESENHADO À MÃO. Todo glifo vem do
// `lucide-react` (`CLAUDE.md`: "Ícones: lucide-react"), declarado como peer +
// devDependency — nunca `dependencies`, senão `no-i18n.test.ts` fica vermelho e
// com razão. O acusador é `src/__tests__/adr-0002-iconography.test.ts`, que
// proíbe `<svg` em `ui/src`: a varredura de termos do ADR 0002 pega PALAVRA, e
// um cadeado desenhado em SVG não tem palavra nenhuma para ela achar. Com o
// ícone vindo do lucide, o NOME importado (`Lock`) cai na varredura.
//
// ⚠️ E nenhum componente daqui gera nome de classe em runtime. O Tailwind
// compila o que existe LITERALMENTE no código-fonte, e o CSS do app só vê este
// pacote por causa do `@source '../../ui/src'` em `packages/app/src/styles.css`
// (regra 1).

export {
  AVATAR_BACKGROUND_CLASSES,
  AVATAR_PALETTE_SIZE,
  avatarBackgroundClass,
  avatarPaletteIndex,
} from './components/avatar-color';
export {
  Button,
  BUTTON_SIZES,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './components/button';
export {
  Field,
  type FieldControlProps,
  type FieldProps,
} from './components/field';
export { FilterChip, type FilterChipProps } from './components/filter-chip';
export { initialsFromName } from './components/initials';
export {
  List,
  LIST_ITEM_HEIGHT_CLASS,
  LIST_ITEM_HEIGHT_PX,
  ListItem,
  type ListItemProps,
  type ListProps,
} from './components/list';
export {
  PersonAvatar,
  type PersonAvatarProps,
  type PersonAvatarSize,
} from './components/person-avatar';
export { SCROLL_LOCK_CLASS, Sheet, type SheetProps } from './components/sheet';
export {
  FOCUS_RING,
  MIN_TOUCH_TARGET_PX,
  SPACING_STEP_PX,
} from './components/styles';
export { type ClassValue, cx } from './cx';
