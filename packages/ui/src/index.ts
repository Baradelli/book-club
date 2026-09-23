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

// ⚠️ `AVATAR_BACKGROUND_CLASSES`, `AVATAR_PALETTE_SIZE`,
// `avatarBackgroundClass` e `avatarPaletteIndex` SAÍRAM DAQUI na Tarefa 41a,
// junto com o arquivo `components/avatar-color.ts` inteiro.
//
// A decisão F do MVP 3.5 mata a paleta de 6 cores de avatar: ficou o par único
// `--person-bg`/`--person-border`/`--person-fg` do canvas, e quem carrega
// identidade é a INICIAL, não a cor. Medido antes de apagar: os quatro exports
// eram usados SÓ dentro deste pacote (`person-avatar.tsx:4,68`) e por nenhuma
// tela — zero consumidores fora daqui, conferido em `packages/{app,ui}/src`.
//
// Com eles saíram os seis tokens `--avatar-1`…`-6` e o `--avatar-fg` do
// `theme.css`, com os utilitários `--color-avatar-*` do `@theme inline` do app:
// a bijeção token↔utilitário fecha nos dois sentidos
// (`theme-tokens.test.ts`), e `bg-avatar-1`…`-6`/`text-avatar-fg` deixaram de
// ser escritos, então `ui-source-scan.test.ts` não exige mais CSS para eles.
// ⚠️ OS DEZ NOMES DA TAREFA 41b ENTRAM AQUI, E ESSA É A DECISÃO K: componente
// que a tela não consegue importar não existe. Eles nascem SEM consumidor —
// quem os consome são as Tarefas 42 a 48 —, e é justamente por isso que o
// barril é a única prova de que eles estão prontos para ser consumidos.
export {
  BookSpine,
  type BookSpinePalette,
  type BookSpineProps,
  type BookSpineSize,
} from './components/book-spine';
export {
  Button,
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from './components/button';
export {
  ContextBar,
  type ContextBarActionVariant,
  type ContextBarLinkProps,
  type ContextBarProps,
} from './components/context-bar';
export {
  Eyebrow,
  type EyebrowProps,
  type EyebrowTone,
} from './components/eyebrow';
export {
  Field,
  type FieldControlProps,
  type FieldProps,
} from './components/field';
export {
  FilterBar,
  type FilterBarProps,
  type FilterGroup,
  type FilterOption,
} from './components/filter-bar';
export { FilterChip, type FilterChipProps } from './components/filter-chip';
export {
  GrifoText,
  type GrifoTextProps,
  PEN_KEYS,
  type PenKey,
} from './components/grifo-text';
export { initialsFromName } from './components/initials';
// ⚠️ `ListItemLinkProps` ENTROU NA TAREFA 41b, e ele estava esquecido aqui
// desde a Tarefa 13 (a 17 chegou a registrar o esquecimento no relatório).
// A consequência era visível: `packages/app/src/router-link.tsx` escreve o
// tipo do parâmetro À MÃO, com um comentário explicando que o tipo "não é
// exportado pelo barril" — uma cópia estrutural de três campos, que ninguém
// sincroniza quando o contrato mudar.
//
// Ele não foi RENOMEADO para algo mais genérico de propósito, embora o
// `ContextBar` desta mesma fatia use o mesmo contrato: um segundo nome para a
// mesma coisa é o defeito que este repositório já pagou três vezes (o
// `GUILT_TERMS` em duas cópias, o `dayRange` do `CLAUDE.md`, o `'Alguém do
// clube'` em três chaves), e renomeá-lo tocaria `router-link.tsx`, que esta
// fatia não toca. O `ContextBarLinkProps` é um ALIAS dele, declarado como
// tal.
export {
  List,
  LIST_ITEM_HEIGHT_CLASS,
  LIST_ITEM_HEIGHT_PX,
  ListItem,
  type ListItemLinkProps,
  type ListItemProps,
  type ListItemTone,
  type ListItemVariant,
  type ListProps,
  SUMARIO_ITEM_HEIGHT_CLASS,
  SUMARIO_ITEM_HEIGHT_PX,
} from './components/list';
export {
  PersonAvatar,
  type PersonAvatarProps,
  type PersonAvatarSize,
} from './components/person-avatar';
export {
  PresenceMark,
  type PresenceMarkProps,
  type PresenceState,
} from './components/presence-mark';
export {
  MarginRail,
  type MarginRailProps,
  ReadingColumn,
  type ReadingColumnProps,
} from './components/reading-column';
export {
  RuleDouble,
  type RuleDoubleAccent,
  type RuleDoubleProps,
} from './components/rule-double';
export {
  SaveIndicator,
  type SaveIndicatorProps,
} from './components/save-indicator';
export { SCROLL_LOCK_CLASS, Sheet, type SheetProps } from './components/sheet';
export { StreakSeal, type StreakSealProps } from './components/streak-seal';
export {
  FOCUS_RING,
  MIN_TOUCH_TARGET_PX,
  SPACING_STEP_PX,
} from './components/styles';
export { type ClassValue, cx } from './cx';
