import type { HighlightColor } from '@clube/shared';
import { HIGHLIGHT_COLORS, isHighlightColor } from '@clube/shared';

import type { GeneralStatus } from './club';
import { docToText } from './doc-to-text';
import { InvalidHighlightError } from './errors';
import type { NoteDoc } from './note';
import { assertNoteDoc } from './note';

/**
 * Um grifo que a pessoa fez no livro **de papel**: o trecho, a cor da caneta, a
 * página e o comentário dela sobre aquele trecho.
 *
 * É entidade própria, e **não depende** de existir anotação nem
 * `ReadingPlanItem` — registrar um grifo num dia em que não se escreveu nada é
 * o caso real que decidiu isto. → `docs/adr/0004-grifo-entidade-propria.md`.
 *
 * **Dentro do clube não existe conteúdo privado** (ADR 0002): o grifo é visível
 * para todo membro ativo desde que é salvo. O que a autoria protege é a
 * ESCRITA — só o autor edita e arquiva o dele, nem o `OWNER`, nem o
 * super-admin.
 *
 * Sem `noteId`: o ADR 0004 descartou o vínculo com `Note`, e o campo é aditivo
 * se um dia surgir. ⚠️ **E o `planItemId?` da emenda de 2026-09-18 NÃO é esse
 * campo** — o aviso dentro do ADR explica por que a coluna certa para "os grifos
 * do capítulo 3" é a do DIA DO PLANO, direta, e não a da anotação: grifo em dia
 * sem nota não teria `noteId` para carregar, que é justamente o caso que o ADR
 * protege.
 */
export interface Highlight {
  id: string;
  clubId: string;
  bookId: string;
  userId: string; // o AUTOR. Sempre o ator; nunca vem do input.
  /**
   * O dia do plano em que o grifo nasceu — **opcional**, e é a emenda de
   * 2026-09-18 ao ADR 0004 (Tarefa 38i).
   *
   * ⚠️ **OPCIONAL é o que preserva a decisão central do ADR:** *"o grifo não
   * depende de um dia de leitura"* continua verdade. Grifar num dia que o plano
   * pula, ou entre dois livros, continua possível — grava `null` (decisão F).
   *
   * ⚠️ **GUARDADO, NÃO DERIVADO NA LEITURA, e essa é a decisão inteira.** Dava
   * para calcular o dia na tela a partir do `createdAt` e do plano, sem coluna
   * nenhuma — e foi recusado: a derivação **muda de significado sozinha**. No dia
   * em que o admin corrigir as datas do plano, todo grifo antigo remapearia em
   * silêncio, e o que era "Cap. 3" viraria "Cap. 5". A coluna é também o único
   * lugar onde CABERIA uma correção no dia em que o preenchimento automático
   * errar (grifar no sábado o que se leu na sexta); a derivação erraria para
   * sempre, recalculando.
   *
   * ⚠️ **O "caberia" é literal: essa correção NÃO existe.** O campo é
   * **write-once no nascimento** — quem o preenche é o `createHighlight`, **na
   * criação e em silêncio** (decisão C), com o dia de hoje no
   * `Settings.timezone` da PESSOA, nunca a hora do servidor e nunca vindo do
   * corpo da requisição (decisões D e E). **Nenhum `update` o toca**: ele está
   * fora do `HighlightPatch`, como o `createdAt`, e o `editHighlightSchema` o
   * recusa com 400. A tela de correção é **fatia própria, e ninguém pediu** —
   * está registrada assim na emenda do ADR 0004 e na spec da Tarefa 38i.
   */
  planItemId: string | null;
  quote: string; // o trecho grifado, digitado à mão (ADR 0004: sem OCR)
  color: HighlightColor; // uma das cinco da paleta fixa de `@clube/shared`
  page: number | null; // inteiro >= 1, ou nada
  reference: string | null; // texto livre — capítulo, assunto, o que a pessoa quiser
  commentDoc: NoteDoc | null; // ProseMirror JSON, ou nada ainda
  commentText: string; // DERIVADO do commentDoc. '' quando não há. → ADR 0001.
  status: GeneralStatus;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * O trecho grifado, obrigatório e sem as pontas.
 *
 * **Sem teto de tamanho** (decisão G): o teto é o `bodyLimit` da rota (Tarefa
 * 24), e um número escolhido aqui recusaria uma citação longa legítima. O
 * espaço INTERNO fica como a pessoa digitou — um grifo de duas frases guarda o
 * espaçamento dela.
 */
export function normalizeHighlightQuote(quote: string): string {
  const trimmed = quote.trim();
  if (trimmed === '') {
    throw new InvalidHighlightError('highlight quote must not be empty');
  }
  return trimmed;
}

/**
 * O portão da cor: uma das cinco da paleta fixa, e nada mais.
 *
 * Recebe `unknown` pelo mesmo motivo do `assertNoteDoc`: o valor vem de corpo
 * de request, e o `z.enum` da borda (Tarefa 24) é a primeira barreira, não a
 * única. A paleta mora em `@clube/shared` porque três chamadores precisam da
 * mesma lista (decisão A).
 *
 * A mensagem do 400 — a única publicada (CONVENCOES-CODIGO §6.2) — lista as
 * cores aceitas, que é o que o cliente precisa saber, e **não** devolve o valor
 * recusado: `value` é `unknown` aqui, e ecoar o que o cliente mandou é como um
 * payload inteiro volta na resposta.
 */
export function assertHighlightColor(value: unknown): HighlightColor {
  if (!isHighlightColor(value)) {
    throw new InvalidHighlightError(
      `highlight color must be one of ${HIGHLIGHT_COLORS.join(', ')}`,
    );
  }
  return value;
}

/**
 * A página, opcional: ausente ou `null` grava `null`; presente é inteiro ≥ 1.
 *
 * **Não é conferida contra `book.totalPages`** (decisão E): `totalPages` é
 * opcional no `Book`, e a edição de quem grifa pode ser outra (bolso × capa
 * dura). Uma guarda que recusa a página real do livro de papel é pior que
 * nenhuma.
 *
 * `Number.isInteger` já recusa `NaN` e os dois infinitos — nenhum deles é
 * inteiro —, e a comparação com 1 recusa `0`, `-0` e os negativos.
 */
export function normalizeHighlightPage(value: unknown): number | null {
  if (value === undefined || value === null) return null;

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidHighlightError(
      'highlight page must be an integer of 1 or more',
    );
  }
  return value;
}

/**
 * O comentário do grifo: o `commentDoc` como veio e o `commentText` **derivado
 * dele**, a cada escrita. → ADR 0001, que nomeia `Highlight.commentDoc` /
 * `commentText` na própria decisão — não é analogia, é a regra.
 *
 * **É anulável** (decisão C): dá para registrar o grifo sem comentário, e o
 * `commentText` fica `''`. Exigir comentário obrigaria a gravar um documento
 * vazio só para ter onde marcar — o mesmo argumento com que o ADR 0004 recusou
 * o grifo dentro da anotação.
 *
 * Um doc **vazio** (`{ type: 'doc', content: [] }`) é diferente de "não há
 * comentário": ele fica gravado, com `commentText: ''`. É o que o autosave da
 * primeira digitação manda.
 *
 * Reusa `assertNoteDoc` e `docToText` **sem renomear nada** (decisão D): é o
 * mesmo tipo de dado, o ADR 0001 governa os dois com a mesma frase, e um
 * `assertCommentDoc` próprio seria uma cópia da regra. A consequência é que um
 * `commentDoc` malformado sai como `InvalidNoteError` — outro nome, o MESMO 400
 * na borda, numa `message` que a tela nunca mostra.
 */
export function normalizeHighlightComment(value: unknown): {
  commentDoc: NoteDoc | null;
  commentText: string;
} {
  if (value === undefined || value === null) {
    return { commentDoc: null, commentText: '' };
  }

  const commentDoc = assertNoteDoc(value);
  return { commentDoc, commentText: docToText(commentDoc) };
}
