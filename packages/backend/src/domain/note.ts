import type { GeneralStatus } from './club';
import { InvalidNoteError } from './errors';

export type NoteKind = 'PLAN' | 'FREE';

/**
 * Um nó de ProseMirror. `attrs`/`marks` ficam sem tipar de propósito: o domínio
 * não interpreta o que o editor põe lá, só atravessa. → ADR 0001.
 */
export interface NoteDocNode {
  type: string;
  text?: string;
  content?: NoteDocNode[];
  [key: string]: unknown;
}

export interface NoteDoc extends NoteDocNode {
  type: 'doc';
}

export interface Note {
  id: string;
  clubId: string;
  bookId: string;
  userId: string; // o AUTOR. Sempre o ator; nunca vem do input.
  kind: NoteKind;
  planItemId: string | null; // preenchido só quando kind = 'PLAN'
  title: string; // PLAN: copiado do tema. FREE: escolhido pela pessoa.
  reference: string | null; // texto livre — só as avulsas usam
  doc: NoteDoc; // ProseMirror JSON, como veio do editor
  plainText: string; // DERIVADO do doc. Nunca entra no input. → ADR 0001.
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Um par (dia de leitura, autor): "esta pessoa escreveu neste dia".
 *
 * É o mínimo que a sobreposição de autoria na tela do livro precisa, e é de
 * propósito que não carrega a nota: o `doc` é a maior coluna da tabela, e
 * trafegar o acervo do clube para desenhar bolinhas na tela não se justifica.
 *
 * Da mesma família do "progresso do grupo": é **calculado** a partir do que as
 * pessoas escreveram, nunca guardado num contador.
 */
export interface PlanItemWriter {
  planItemId: string;
  userId: string;
}

/**
 * Objeto de verdade — nem `null`, nem array, nem função, nem escalar.
 *
 * ⚠️ O `!Array.isArray` é **defesa em profundidade e NÃO tem teste que o
 * sustente** — não porque falte cobertura, mas porque é indistinguível: um
 * array vindo de JSON nunca carrega a chave `type`, então tirar a guarda troca
 * só a MENSAGEM do 400 (`got an array` → `got undefined`), nunca a classe do
 * erro nem o que é aceito. Registrado para ninguém "simplificar" isto
 * acreditando que há cobertura provando que a guarda é necessária.
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * É um nó de ProseMirror plausível? O portão de cada nível da travessia.
 *
 * Existe porque `assertNoteDoc` é RASO de propósito (ver abaixo): o `doc` é
 * gravado como veio, então quem o atravessa depois — o `docToText` — não pode
 * confiar no tipo declarado de `content`.
 */
export function isNoteDocNode(value: unknown): value is NoteDocNode {
  return isObject(value) && typeof value.type === 'string';
}

function isNoteDoc(value: Record<string, unknown>): value is NoteDoc {
  return value.type === 'doc';
}

/**
 * O único portão de entrada do `doc`: recebe `unknown` e estreita.
 *
 * **Estreita e não reescreve.** Devolve o MESMO objeto: nada de limpar,
 * reordenar chaves ou descartar `attrs`. O ADR 0001 escolheu ProseMirror JSON
 * justamente para o round-trip ser lossless, e uma anotação de meses atrás tem
 * de reabrir idêntica, com os `attrs` da extensão que o editor tinha na época.
 *
 * E é RASO: confere que o valor é um objeto de `type: 'doc'`, não a árvore
 * inteira. Validar em profundidade seria decidir aqui quais nós o editor pode
 * ter — o oposto do que o ADR 0001 escolheu, porque cada extensão nova (tabela,
 * callout, menção) passaria a exigir uma mudança neste arquivo para poder ser
 * salva. Quem atravessa a árvore depois (`docToText`) é defensivo por isso.
 */
export function assertNoteDoc(value: unknown): NoteDoc {
  if (!isObject(value)) {
    throw new InvalidNoteError(
      `note doc must be a ProseMirror object, got ${typeName(value)}`,
    );
  }
  if (!isNoteDoc(value)) {
    throw new InvalidNoteError(
      `note doc must have type "doc", got ${describeNodeType(value.type)}`,
    );
  }
  return value;
}

/**
 * Só para a mensagem do 400 — que é a única publicada na resposta
 * (CONVENCOES-CODIGO §6.2). Nomeia o problema **sem despejar o corpo do
 * request**: `type` é `unknown` aqui, e um `JSON.stringify` cego devolveria ao
 * cliente qualquer objeto que ele pusesse no campo.
 */
function typeName(value: unknown): string {
  if (value === null) return 'null';
  return Array.isArray(value) ? 'an array' : typeof value;
}

function describeNodeType(type: unknown): string {
  return typeof type === 'string' ? JSON.stringify(type) : typeName(type);
}

/**
 * Título obrigatório da anotação avulsa, sem as pontas.
 *
 * A anotação do dia não passa por aqui: o título dela é copiado do tema do
 * `ReadingPlanItem`, que já nasceu validado pelo `normalizePlanDrafts`.
 */
export function normalizeNoteTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed === '') {
    throw new InvalidNoteError('note title must not be empty');
  }
  return trimmed;
}
