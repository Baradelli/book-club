import type { NoteDoc, NoteDocNode } from './note';
import { isNoteDocNode } from './note';

/**
 * Os nós INLINE: os que contribuem texto sem separar nada em volta.
 *
 * `link`, `bold` e `italic` não aparecem aqui porque no ProseMirror eles são
 * **marks** de um nó `text`, não nós — então já entram pelo `text`.
 *
 * Todo tipo de fora desta lista é tratado como BLOCO, inclusive um tipo
 * desconhecido (regra 5). É a escolha assimétrica de propósito: um bloco novo
 * do editor tratado como inline grudaria a última palavra dele na primeira do
 * bloco seguinte — e uma palavra grudada não é achada por busca nenhuma —,
 * enquanto um inline novo tratado como bloco só produz um `\n` a mais, que a
 * normalização do fim já absorve.
 */
const INLINE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'hardBreak',
  'mention',
]);

/** O separador de bloco. Um só `\n`: a colagem de vários é normalizada no fim. */
const BLOCK_SEPARATOR = '\n';

/**
 * O `plainText` de um doc. Puro, sem I/O, sem regex de HTML.
 *
 * É o campo de busca (`ILIKE`) e de prévia de listagem, recalculado a cada
 * escrita — nunca vem do cliente. → ADR 0001.
 *
 * **A travessia é ITERATIVA**, com pilha explícita. O `doc` é o único campo que
 * chega inteiro do cliente, e um documento muito profundo (colado, ou vindo de
 * um cliente ruim) derrubaria o processo numa travessia recursiva — 50 mil
 * níveis já estouram a pilha do Node.
 *
 * E é DEFENSIVA sobre o que atravessa: `assertNoteDoc` é raso de propósito, o
 * `doc` é gravado como veio, então `content` pode ter qualquer coisa dentro.
 * Se esta função estourar, ninguém consegue salvar anotação.
 */
export function docToText(doc: NoteDoc): string {
  const parts: string[] = [];
  // Um `string` na pilha é um literal a emitir; um objeto é um nó a visitar.
  const stack: Array<NoteDocNode | string> = [doc];

  for (let step = stack.pop(); step !== undefined; step = stack.pop()) {
    if (typeof step === 'string') {
      parts.push(step);
      continue;
    }

    parts.push(ownText(step));

    // A pilha é LIFO e a saída tem de sair na ordem do documento: o separador
    // do bloco entra ANTES dos filhos para sair DEPOIS deles, e os filhos
    // entram de trás para a frente.
    if (!INLINE_TYPES.has(step.type)) stack.push(BLOCK_SEPARATOR);

    const children = Array.isArray(step.content) ? step.content : [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child: unknown = children[index];
      // Filho que não é nó (null, número, array) é ignorado, não estoura.
      if (isNoteDocNode(child)) stack.push(child);
    }
  }

  return normalize(parts.join(''));
}

/** O que o próprio nó contribui, sem contar os filhos. */
function ownText(node: NoteDocNode): string {
  if (node.type === 'hardBreak') return BLOCK_SEPARATOR;
  if (node.type === 'mention') return mentionLabel(node);
  // Vale para o `text` e para qualquer nó futuro que carregue texto próprio.
  return typeof node.text === 'string' ? node.text : '';
}

/**
 * O nome escrito na menção. Buscar o nome de uma pessoa tem de achar a nota em
 * que ela foi mencionada — e o nome só existe em `attrs.label`.
 *
 * `attrs` ausente, de outro tipo, ou com um `label` que não é string não
 * quebra: quem manda o `doc` é o cliente.
 */
function mentionLabel(node: NoteDocNode): string {
  const attrs: unknown = node.attrs;
  if (typeof attrs !== 'object' || attrs === null) return '';
  if (!('label' in attrs)) return '';

  const label: unknown = attrs.label;
  return typeof label === 'string' ? label : '';
}

/**
 * Sem espaço nas pontas e sem sequência de 3+ `\n`.
 *
 * Os dois casos reais: blocos aninhados fecham vários níveis de uma vez (cada
 * um emitindo o seu separador), e o editor deixa parágrafos vazios por onde a
 * pessoa passou. Nenhum dos dois é conteúdo.
 */
function normalize(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}
