/**
 * O VOCABULÁRIO DO `ActivityEvent` — os quatro nascimentos que o clube vê.
 *
 * "Quando alguém marca que leu, ou escreve uma nota ou um grifo, o clube recebe
 * uma notificação — um incentiva o outro" (`CLAUDE.md`). Esta é a lista desses
 * acontecimentos, e ela mora aqui pelo caminho que a paleta do grifo percorreu
 * na Tarefa 22: são **três chamadores com a MESMA lista** — o domínio do
 * backend (`domain/activity-event.ts`), o `z.enum` da borda (Tarefa 34) e o
 * feed da home (Tarefa 35). Deixá-la no backend obrigaria a mover o arquivo na
 * 34 e a copiar a lista na 35, e a lição nº 3 do MVP 1 ("vocabulário
 * compartilhado mora num arquivo só") custou dois bugs.
 *
 * O `CLAUDE.md` já nomeia `ActivityEvent.type` ao lado de
 * `NotificationDelivery.kind`, `PushSubscription.platform` e `Highlight.color`
 * como a mesma classe: **`String` validado por `z.enum`**, e não enum Prisma,
 * porque a lista ainda evolui.
 *
 * ## Por que QUATRO tipos, e não um genérico
 *
 * O feed diz frases diferentes — "escreveu sobre o Cap. 3" × "escreveu uma
 * anotação" × "grifou" × "leu". Um tipo só empurraria a distinção para a tela
 * adivinhar pelo `subjectId`, e adivinhar exige saber em qual tabela procurar.
 *
 * ## Por que são NASCIMENTOS, e o que ficou de fora
 *
 * Editar, arquivar e desmarcar **não** entram. O `docs/NOTIFICACOES.md` §1
 * descreve a notificação de grupo com verbos de nascimento ("quando alguém do
 * clube **lê**, **escreve** uma anotação ou **registra** um grifo"), e o
 * produto concorda: corrigir a própria nota dois dias depois não é notícia para
 * ninguém, e registrar "a Maria desmarcou" é o vocabulário de cobrança que o
 * princípio anti-culpa proíbe. Isto é um feed de incentivo, não um log de
 * auditoria.
 *
 * A ordem é a da leitura do dia: a nota do dia, a avulsa, o grifo, o "li".
 */
export const ACTIVITY_TYPES = [
  /** Nasceu a anotação do DIA DE LEITURA — `subjectId` é o id da `Note`. */
  'PLAN_NOTE',
  /** Nasceu uma anotação AVULSA — `subjectId` é o id da `Note`. */
  'FREE_NOTE',
  /** Nasceu um grifo — `subjectId` é o id do `Highlight`. */
  'HIGHLIGHT',
  /** Alguém marcou que leu um dia — `subjectId` é o id do `ReadingLog`. */
  'READ',
] as const;

/** Um dos quatro nascimentos — nunca um verbo inventado. */
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * O portão do tipo: recebe `unknown` e **estreita**.
 *
 * Recebe `unknown` pelo mesmo motivo do `isHighlightColor`: quem chama é o
 * domínio, e é o domínio (não o chamador) que decide o que é tipo válido.
 * Comparação exata, sem `trim` e sem dobrar caixa — normalizar aqui criaria uma
 * segunda grafia aceita que o `z.enum` da borda (Tarefa 34) recusaria, que é a
 * divergência fake-banco do ADR 0007.
 */
export function isActivityType(value: unknown): value is ActivityType {
  return (ACTIVITY_TYPES as readonly unknown[]).includes(value);
}
