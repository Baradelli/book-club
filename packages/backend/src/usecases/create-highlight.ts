import { randomUUID } from 'node:crypto';

import type { Highlight } from '../domain/highlight';
import {
  assertHighlightColor,
  normalizeHighlightComment,
  normalizeHighlightPage,
  normalizeHighlightQuote,
} from '../domain/highlight';
import { optionalText } from '../domain/optional-text';
import type { AssertMembership } from './assert-membership';
import { bookForActor } from './book-for-actor';
import type { BookRepository } from './ports/book-repository';
import type { HighlightRepository } from './ports/highlight-repository';
import type { RecordActivity } from './record-activity';
import { recordActivitySafely } from './record-activity';

/**
 * Não existem `userId` nem `clubId` aqui, e é a primeira barreira: a autoria é
 * do ator (do JWT) e o clube vem de `book.clubId`. → `CLAUDE.md` e §6.3.
 *
 * `color`, `page` e `commentDoc` são `unknown` porque os portões deles são do
 * domínio (`assertHighlightColor`, `normalizeHighlightPage`,
 * `assertNoteDoc`) e recebem `unknown` — o mesmo desenho do `doc` do
 * `createFreeNote`. O `z.enum`/`z.coerce` da borda (Tarefa 24) é a primeira
 * barreira, não a única.
 */
export interface CreateHighlightInput {
  actorUserId: string; // o autor. NÃO existe `userId` aqui.
  bookId: string;
  quote: string; // obrigatório, sem as pontas
  color: unknown; // validado por assertHighlightColor
  /** Ausente ou `null` = grava `null`. Presente é inteiro >= 1. */
  page?: unknown;
  reference?: string;
  /** Ausente ou `null` = grava `null` e `commentText: ''`. → ADR 0001. */
  commentDoc?: unknown;
}

export interface CreateHighlightOutput {
  highlight: Highlight;
}

/**
 * Registro um grifo que fiz no livro **de papel**: o trecho, a cor da caneta, a
 * página e o meu comentário — **sem depender de eu ter escrito anotação naquele
 * dia**. É o caso real que fez o ADR 0004 dar tabela própria ao grifo.
 *
 * **Ilimitado** por decisão de produto: não há chave natural e nada de upsert
 * aqui — duas chamadas idênticas criam dois grifos. O caso é grifar o mesmo
 * trecho outra vez numa releitura, com outra cor, e a tabela não tem `@@unique`
 * nenhum para atrapalhar.
 *
 * **Não exige papel**: `MEMBER` grifa. E o `clubId` vem de `book.clubId`, nunca
 * do input — o corte é o do `bookForActor`, reusado sem cópia.
 *
 * ⚠️ **Registra atividade SEMPRE** (Tarefa 33, regra 10), como a avulsa: não há
 * idempotência para condicionar, porque duas chamadas idênticas criam dois
 * grifos. O `docs/NOTIFICACOES.md` §1 chama isto de "**registra** um grifo" —
 * verbo de nascimento, e é o único momento do grifo que vira notícia.
 */
export class CreateHighlight {
  constructor(
    private readonly assertMembership: AssertMembership,
    private readonly books: BookRepository,
    private readonly highlights: HighlightRepository,
    private readonly recordActivity: RecordActivity,
  ) {}

  async execute(input: CreateHighlightInput): Promise<CreateHighlightOutput> {
    // O corte de tenant vem antes da validação do corpo: quem não é do clube
    // recebe o mesmo 404 para trecho bom e para trecho vazio. Um 400 aqui
    // confirmaria a existência do livro (é a única classe cuja `message` sai
    // publicada — §6.2).
    const book = await bookForActor(this.books, this.assertMembership, {
      actorUserId: input.actorUserId,
      bookId: input.bookId,
    });

    // Tudo é validado ANTES de qualquer escrita — trecho vazio, cor de fora da
    // paleta, página fracionária ou comentário malformado não deixam nada
    // gravado, nem meio grifo.
    const quote = normalizeHighlightQuote(input.quote);
    const color = assertHighlightColor(input.color);
    const page = normalizeHighlightPage(input.page);
    const { commentDoc, commentText } = normalizeHighlightComment(
      input.commentDoc,
    );

    // UM `new Date()` só, e o motivo é SEMÂNTICO, não de determinismo de teste:
    // `createdAt` e `updatedAt` de uma linha que acabou de nascer são o mesmo
    // instante — nada aconteceu entre o nascimento e a última mudança. O domínio
    // é o dono de `updatedAt` (→ ADR 0008: sem `@updatedAt` no schema).
    //
    // ⚠️ **Medido:** dois `new Date()` aqui NÃO divergem em milissegundos — as
    // duas chamadas caem no mesmo tick, e o mutante com um por campo passava em
    // 1206/1206 testes (§7.1: prosa não é prova). Quem acusa é o
    // `reads the clock once and stamps both createdAt and updatedAt with it`,
    // com o stub de relógio que anda a cada leitura.
    const now = new Date();

    const highlight = await this.highlights.save({
      id: randomUUID(),
      clubId: book.clubId,
      bookId: book.id,
      userId: input.actorUserId,
      quote,
      color,
      page,
      // O MESMO `optionalText` do livro, do item do plano e da nota:
      // `''`/espaços viram `null`. Uma cópia da regra é como um dos cinco passa
      // a gravar `''`.
      reference: optionalText(input.reference),
      commentDoc,
      // DERIVADO do `commentDoc`, a cada escrita, e nunca vindo do input.
      // → ADR 0001, que nomeia `Highlight.commentText` na própria decisão.
      commentText,
      status: 'ACTIVE',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    /*
      ⚠️ **O GATILHO, e ele vem DEPOIS da escrita** (Tarefa 33, decisão I) —
      registrar antes e a escrita falhar produziria um feed que mente. E ele
      **não pode derrubar o grifo da pessoa** (decisão C): quem captura e loga
      é o `recordActivitySafely`, dono único dessa regra nos quatro.

      `planItemId: null` é o caso que decidiu o ADR 0004: grifar **não depende**
      de eu ter escrito anotação naquele dia, e o grifo não ancora em dia
      nenhum. Um dia aqui inventaria um vínculo que a entidade não tem.
    */
    await recordActivitySafely(this.recordActivity, {
      clubId: book.clubId,
      actorUserId: input.actorUserId,
      type: 'HIGHLIGHT',
      bookId: book.id,
      planItemId: null,
      subjectId: highlight.id,
    });

    return { highlight };
  }
}
