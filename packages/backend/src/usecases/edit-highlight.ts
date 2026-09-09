import type { Highlight } from '../domain/highlight';
import {
  assertHighlightColor,
  normalizeHighlightComment,
  normalizeHighlightPage,
  normalizeHighlightQuote,
} from '../domain/highlight';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { highlightForAuthor } from './highlight-for-author';
import type {
  HighlightPatch,
  HighlightRepository,
} from './ports/highlight-repository';

/**
 * `undefined` é ausência ("não mexe neste campo"); `null` explícito em `page`,
 * `reference` e `commentDoc` **LIMPA** o campo. É a mesma semântica do
 * `update(id, patch)` dos repositórios, do `editBook` e do `editNote`.
 *
 * `quote` e `color` não são anuláveis: um grifo sem trecho ou sem cor não é
 * grifo. Vazio/só-espaços no `quote` e cor fora da paleta são
 * `InvalidHighlightError`, não "limpa".
 *
 * `userId`, `clubId`, `bookId`, `createdAt`, `status`, `archivedAt` e
 * `commentText` não aparecem aqui de propósito: autoria e tenant vêm do JWT e
 * do próprio grifo, `commentText` é derivado do `commentDoc` (ADR 0001), e
 * arquivar é o `archiveHighlight` — que confere autoria por si. Um `status` aqui
 * seria um segundo caminho para arquivar e, pior, um caminho para DESARQUIVAR,
 * que é MVP 4.
 */
export interface EditHighlightInput {
  actorUserId: string; // tem de ser o AUTOR
  highlightId: string;
  /** Ausente = não mexe. Vazio/só-espaços = `InvalidHighlightError`. */
  quote?: string;
  /** Ausente = não mexe. Fora da paleta = `InvalidHighlightError`. */
  color?: unknown;
  /** Ausente = não mexe. `null` = limpa. Presente é inteiro >= 1. */
  page?: unknown;
  /** Ausente = não mexe. `null`/`''`/espaços = limpa (grava `null`). */
  reference?: string | null;
  /** Ausente = não mexe. `null` = limpa, e ZERA o `commentText`. */
  commentDoc?: unknown;
}

export interface EditHighlightOutput {
  highlight: Highlight;
}

/**
 * O autor corrige o próprio grifo — o trecho que digitou errado, a cor da caneta
 * que confundiu, a página, o comentário. **Ninguém mais mexe**: nem o `OWNER` do
 * clube, nem o super-admin. O grupo lê tudo e não interfere em nada (ADR 0002).
 * Quem confere isso é o `highlightForAuthor`, reusado sem cópia.
 *
 * **Last-write-wins**: sem lock otimista e sem resolução de conflito, que é
 * offline Nível 2 e está fora do escopo do `CLAUDE.md`.
 */
export class EditHighlight {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly highlights: HighlightRepository,
  ) {}

  async execute(input: EditHighlightInput): Promise<EditHighlightOutput> {
    // O corte de tenant e de autoria vem antes de tudo: quem não é do clube
    // recebe o mesmo 404 para patch bom e para patch ruim.
    const highlight = await highlightForAuthor(
      this.highlights,
      this.assertMembership,
      {
        actorUserId: input.actorUserId,
        highlightId: input.highlightId,
      },
    );

    // O patch INTEIRO é validado antes de escrever: um campo ruim não pode
    // deixar os anteriores gravados, nem meia edição.
    const patch = buildPatch(input);

    // Nada a fazer não é erro — é o retry de uma fila offline que já coalesceu
    // tudo. E não pode custar um `UPDATE`: o guard acima já rodou, então o patch
    // vazio não é atalho para furar autoria nenhuma.
    if (Object.keys(patch).length === 0) return { highlight };

    const updated = await this.highlights.update(highlight.id, {
      ...patch,
      // O `updatedAt` anda a cada escrita REAL. → ADR 0008: o domínio é o dono
      // dele, e `updatedAt` significa "quando esta linha mudou pela última vez".
      updatedAt: new Date(),
    });
    return { highlight: updated };
  }
}

/**
 * Só as chaves presentes no input entram no patch — as outras nem existem.
 *
 * É a montagem CAMPO POR CAMPO que fecha a porta do contrabando: nada de spread
 * do input, então `userId`, `clubId` ou `commentText` que venham no corpo não
 * têm por onde chegar à linha. O `HighlightPatch` estreito é a outra metade
 * (§7.1.1) — e nem ele fecha o literal montado por variável, o que o
 * `HighlightRepositoryFake.update` fecha copiando campo a campo.
 */
function buildPatch(input: EditHighlightInput): HighlightPatch {
  const patch: HighlightPatch = {};

  // O `!== undefined` de cada bloco é a semântica do editHighlight (ausência
  // não mexe); a regra do campo em si é a do domínio, a MESMA que o
  // `createHighlight` usa.
  if (input.quote !== undefined) {
    patch.quote = normalizeHighlightQuote(input.quote);
  }

  if (input.color !== undefined) {
    patch.color = assertHighlightColor(input.color);
  }

  // `null` chega aqui e sai `null`: é como o `editHighlight` limpa a página.
  if (input.page !== undefined) {
    patch.page = normalizeHighlightPage(input.page);
  }

  // O MESMO `optionalText` do livro, do item do plano e da nota: `''`/espaços
  // viram `null`. Uma cópia da regra é como um dos cinco passa a gravar `''`.
  if (input.reference !== undefined) {
    patch.reference = optionalText(input.reference);
  }

  if (input.commentDoc !== undefined) {
    // Os DOIS campos juntos, sempre: limpar o `commentDoc` tem de zerar o
    // `commentText`, senão o grifo fica sem comentário e com o texto derivado do
    // comentário que não existe mais — e é o `commentText` que a busca casa.
    // O `commentText` é derivado do `doc` a cada escrita, e SÓ quando o doc vem:
    // corrigir o trecho não pode mexer no texto derivado, que pode ter vindo de
    // outra versão do `docToText`. → ADR 0001.
    const { commentDoc, commentText } = normalizeHighlightComment(
      input.commentDoc,
    );
    patch.commentDoc = commentDoc;
    patch.commentText = commentText;
  }

  return patch;
}
