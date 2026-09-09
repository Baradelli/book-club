import { beforeEach, describe, expect, it } from 'vitest';

import {
  HighlightNotFoundError,
  InvalidHighlightError,
  InvalidNoteError,
  NotAMemberError,
  NotTheAuthorError,
} from '../../domain/errors';
import type { Highlight } from '../../domain/highlight';
import {
  aDoc,
  aHighlight,
  aMembership,
  FIXED_ISO,
  required,
} from '../../test-support/builders';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { EditHighlightInput } from '../edit-highlight';
import { EditHighlight } from '../edit-highlight';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const OTHER_MEMBER_ID = 'user-marcos';
const OUTSIDER_ID = 'user-forasteiro';

const HIGHLIGHT_ID = 'highlight-da-maria';
const SECOND_HIGHLIGHT_ID = 'segundo-highlight-da-maria';
const ARCHIVED_HIGHLIGHT_ID = 'highlight-arquivado-da-maria';
const LEGACY_HIGHLIGHT_ID = 'highlight-com-commenttext-antigo';
const NO_COMMENT_HIGHLIGHT_ID = 'highlight-sem-comentario-da-maria';

const YELLOW = '#facc15';
const GREEN = '#22c55e';

/** O `commentText` que uma versão anterior do `docToText` deixou gravado. */
const LEGACY_COMMENT_TEXT = 'texto derivado por outra versao do docToText';

describe('EditHighlight', () => {
  let memberships: MembershipRepositoryFake;
  let highlights: HighlightRepositoryFake;
  let useCase: EditHighlight;

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function validInput(
    overrides: Partial<EditHighlightInput> = {},
  ): EditHighlightInput {
    return {
      actorUserId: AUTHOR_ID,
      highlightId: HIGHLIGHT_ID,
      ...overrides,
    };
  }

  /** A linha gravada — é nela que as asserções de contrabando batem. */
  function stored(highlightId = HIGHLIGHT_ID): Highlight {
    return required(highlights.saved.find((one) => one.id === highlightId));
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    highlights = new HighlightRepositoryFake();
    useCase = new EditHighlight(new AssertMembership(memberships), highlights);

    await highlights.save(
      aHighlight({
        id: HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        page: 45,
        reference: 'cap. 3',
        commentDoc: aDoc('o comentário original'),
      }),
    );
    await highlights.save(
      aHighlight({
        id: SECOND_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        quote: 'outro trecho',
        color: GREEN,
        page: null,
        reference: null,
        commentDoc: aDoc('outro comentário'),
      }),
    );
    await highlights.save(
      aHighlight({
        id: ARCHIVED_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );
    /**
     * ⚠️ Fixture com `commentText` DIVERGENTE do `commentDoc` de propósito — é a
     * única forma de distinguir "não recalculou" de "recalculou e deu no mesmo".
     * O estado é real: o `commentText` de um grifo antigo foi derivado pela
     * versão do `docToText` da época, e a regra 14 promete que corrigir o trecho
     * não mexe nele.
     */
    await highlights.save(
      aHighlight({
        id: LEGACY_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        commentDoc: aDoc('o comentário de verdade'),
        commentText: LEGACY_COMMENT_TEXT,
      }),
    );
    await highlights.save(
      aHighlight({
        id: NO_COMMENT_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        commentDoc: null,
      }),
    );

    await memberships.save(
      aMembership({ userId: AUTHOR_ID, clubId: CLUB_ID, role: 'MEMBER' }),
    );
    await memberships.save(
      aMembership({ userId: OWNER_ID, clubId: CLUB_ID, role: 'OWNER' }),
    );
    await memberships.save(
      aMembership({ userId: OTHER_MEMBER_ID, clubId: CLUB_ID }),
    );
    await memberships.save(
      aMembership({ userId: OUTSIDER_ID, clubId: OTHER_CLUB_ID }),
    );
  });

  /**
   * Regra 13 — a delegação ao `highlightForAuthor`. Aqui só se prova que o guard
   * É chamado e que nada é escrito quando ele barra; as regras dele têm suíte
   * própria (`highlight-for-author.test.ts`) e não se copiam.
   */
  describe('delegates the tenant and authorship cut to highlightForAuthor', () => {
    it('refuses a highlight that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ highlightId: 'highlight-fantasma' })),
      ).rejects.toBeInstanceOf(HighlightNotFoundError);

      expect(highlights.updateCalls).toBe(0);
    });

    // Regra 19 — arquivado é invisível, inclusive para o próprio autor.
    it('refuses an archived highlight', async () => {
      await expect(
        useCase.execute(
          validInput({
            highlightId: ARCHIVED_HIGHLIGHT_ID,
            quote: 'outro trecho',
          }),
        ),
      ).rejects.toBeInstanceOf(HighlightNotFoundError);

      expect(highlights.updateCalls).toBe(0);
      expect(stored(ARCHIVED_HIGHLIGHT_ID).status).toBe('ARCHIVED');
    });

    it('refuses an actor who is not a member of the club of the highlight', async () => {
      await expect(
        useCase.execute(
          validInput({ actorUserId: OUTSIDER_ID, quote: 'outro trecho' }),
        ),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(highlights.updateCalls).toBe(0);
      expect(stored().quote).toBe('a coragem de continuar');
    });

    // Regra 13 — papel não compra autoria (ADR 0002).
    it.each([
      ['a fellow member', OTHER_MEMBER_ID],
      ['the OWNER of the club', OWNER_ID],
    ])('refuses %s, who is not the author', async (_label, actorUserId) => {
      await expect(
        useCase.execute(validInput({ actorUserId, quote: 'outro trecho' })),
      ).rejects.toBeInstanceOf(NotTheAuthorError);

      expect(highlights.updateCalls).toBe(0);
      expect(stored().quote).toBe('a coragem de continuar');
    });
  });

  /**
   * ⚠️ Regra 13 — os dois eixos TÊM de se cruzar. Um teste de "ator errado" com
   * corpo válido e um de "corpo inválido" com ator válido deixam a ORDEM de
   * validação sem prova nenhuma.
   */
  describe('the order: the cut comes before the body', () => {
    it('answers the tenant cut to an outsider who also sends a malformed body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OUTSIDER_ID,
            quote: '   ',
            color: 'não é uma cor',
            page: -1,
            commentDoc: 'não é um doc',
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotAMemberError);
      expect(error).not.toBeInstanceOf(InvalidHighlightError);
      expect(error).not.toBeInstanceOf(InvalidNoteError);
      expect(highlights.updateCalls).toBe(0);
    });

    it('answers the authorship cut to a fellow member who also sends an empty quote', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OTHER_MEMBER_ID, quote: '   ' }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotTheAuthorError);
      expect(error).not.toBeInstanceOf(InvalidHighlightError);
      expect(highlights.updateCalls).toBe(0);
    });

    // E o mesmo cruzamento contra o grifo arquivado: o corte de "não existe"
    // vem antes do corpo também.
    it('answers the not-found cut to the author of an archived highlight with a bad body', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({ highlightId: ARCHIVED_HIGHLIGHT_ID, quote: '   ' }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(HighlightNotFoundError);
      expect(error).not.toBeInstanceOf(InvalidHighlightError);
      expect(highlights.updateCalls).toBe(0);
    });
  });

  describe('editing', () => {
    // Regra 14 + 17
    it('replaces the quote and bumps updatedAt', async () => {
      const { highlight } = await useCase.execute(
        validInput({ quote: 'a coragem de continuar mesmo assim' }),
      );

      expect(highlight.quote).toBe('a coragem de continuar mesmo assim');
      expect(stored().quote).toBe('a coragem de continuar mesmo assim');
      expect(highlight.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(highlights.updateCalls).toBe(1);
    });

    // Regra 14 — o trecho vem sem as pontas, pela mesma regra do create.
    it('trims a quote that is present', async () => {
      const { highlight } = await useCase.execute(
        validInput({ quote: '   outro trecho   ' }),
      );

      expect(highlight.quote).toBe('outro trecho');
      expect(stored().quote).toBe('outro trecho');
    });

    /**
     * ⚠️ Regra 17 — o `updatedAt` anda em TODA escrita real, não só quando um
     * campo específico vem. Sem esta tabela, um `updatedAt` condicionado a um
     * campo sobrevive à suíte inteira — e é o `updatedAt` que ordena "editados
     * recentemente" e invalida o cache do PWA.
     *
     * A fixture tem `updatedAt` em `FIXED_ISO` de propósito: contra um
     * `new Date()` semeado no mesmo teste, o "avançou" cairia no mesmo
     * milissegundo e ficaria indecidível.
     */
    it.each<[string, Partial<EditHighlightInput>]>([
      ['a quote-only patch', { quote: 'outro trecho' }],
      ['a colour-only patch', { color: GREEN }],
      ['a page-only patch', { page: 99 }],
      ['a reference-only patch', { reference: 'cap. 9' }],
      ['a comment-only patch', { commentDoc: aDoc('outro comentário') }],
      ['a patch that only clears the page', { page: null }],
      ['a patch that only clears the reference', { reference: null }],
      ['a patch that only clears the comment', { commentDoc: null }],
    ])('bumps updatedAt on %s', async (_label, patch) => {
      const { highlight } = await useCase.execute(validInput(patch));

      expect(highlight.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(stored().updatedAt.getTime()).toBe(highlight.updatedAt.getTime());
      expect(highlights.updateCalls).toBe(1);
    });

    // Regra 14 — corrigir a cor da caneta é a edição mais provável de um grifo.
    it.each(['#facc15', '#22c55e', '#f97316', '#3b82f6', '#ec4899'])(
      'replaces the colour with the palette colour %s',
      async (color) => {
        const { highlight } = await useCase.execute(validInput({ color }));

        expect(highlight.color).toBe(color);
        expect(stored().color).toBe(color);
      },
    );

    // Regra 14 — ausente é ausente: corrigir a cor não exige reenviar o trecho.
    it('leaves every absent field alone', async () => {
      const { highlight } = await useCase.execute(validInput({ color: GREEN }));

      expect(highlight.quote).toBe('a coragem de continuar');
      expect(highlight.page).toBe(45);
      expect(highlight.reference).toBe('cap. 3');
      expect(highlight.commentText).toBe('o comentário original');
      expect(stored().quote).toBe('a coragem de continuar');
      expect(stored().page).toBe(45);
      expect(stored().reference).toBe('cap. 3');
    });

    // Regra 14 — `null` explícito LIMPA a página.
    it('clears the page when the patch says null', async () => {
      const { highlight } = await useCase.execute(validInput({ page: null }));

      expect(highlight.page).toBeNull();
      expect(stored().page).toBeNull();
    });

    // Regra 14 — e corrigir a página para outro número.
    it.each([1, 46, 1200])('replaces the page with %s', async (page) => {
      const { highlight } = await useCase.execute(validInput({ page }));

      expect(highlight.page).toBe(page);
      expect(stored().page).toBe(page);
    });

    // Regra 14 — o MESMO `optionalText` do livro, do item do plano e da nota.
    it.each<[string, string | null, string | null]>([
      ['null', null, null],
      ['an empty string', '', null],
      ['only spaces', '   ', null],
      ['a reference with spaces around', '  cap. 9  ', 'cap. 9'],
      ['a clean reference', 'cap. 9', 'cap. 9'],
      ['a subject instead of a chapter', 'sobre a coragem', 'sobre a coragem'],
    ])(
      'normalizes a reference of %s into the stored one',
      async (_label, reference, expected) => {
        const { highlight } = await useCase.execute(validInput({ reference }));

        expect(highlight.reference).toBe(expected);
        expect(stored().reference).toBe(expected);
      },
    );

    /**
     * ⚠️ Regra 14 — limpar o `commentDoc` **ZERA o `commentText`**. É o par que
     * um `patch.commentDoc = null` sozinho deixaria inconsistente: o grifo
     * ficaria sem comentário e com o texto derivado do comentário que não existe
     * mais — e é justamente o `commentText` que a busca do MVP 2 casa.
     */
    it('clears the commentText together with the commentDoc', async () => {
      const { highlight } = await useCase.execute(
        validInput({ commentDoc: null }),
      );

      expect(highlight.commentDoc).toBeNull();
      expect(highlight.commentText).toBe('');
      expect(stored().commentDoc).toBeNull();
      expect(stored().commentText).toBe('');
    });

    // Regra 14 — e escrever o primeiro comentário de um grifo que não tinha.
    it('writes the first comment of a highlight that had none', async () => {
      const { highlight } = await useCase.execute(
        validInput({
          highlightId: NO_COMMENT_HIGHLIGHT_ID,
          commentDoc: aDoc('agora eu tenho o que dizer'),
        }),
      );

      expect(highlight.commentText).toBe('agora eu tenho o que dizer');
      expect(stored(NO_COMMENT_HIGHLIGHT_ID).commentText).toBe(
        'agora eu tenho o que dizer',
      );
    });

    // Regra 14 — o `commentText` é derivado do doc a cada escrita dele.
    it('derives the commentText from the new commentDoc', async () => {
      const commentDoc = aDoc('reescrevi tudo', 'e acrescentei um parágrafo');

      const { highlight } = await useCase.execute(validInput({ commentDoc }));

      // O esperado é LITERAL, escrito à mão. Um
      // `toBe(docToText(commentDoc))` ao lado seria identidade — os dois lados
      // saem da mesma função (§7.8) — e é o literal que acusa.
      expect(highlight.commentText).toBe(
        'reescrevi tudo\ne acrescentei um parágrafo',
      );
      expect(stored().commentText).toBe(
        'reescrevi tudo\ne acrescentei um parágrafo',
      );
    });

    /**
     * ⚠️ Regra 14 — corrigir o trecho **NÃO recalcula o `commentText`**.
     *
     * A fixture tem `commentText` divergente do `commentDoc` de propósito: com
     * os dois coerentes, uma implementação que recalculasse a cada escrita
     * passaria neste teste sem que ninguém notasse.
     */
    it('does not recompute the commentText when the commentDoc is absent', async () => {
      const { highlight } = await useCase.execute(
        validInput({ highlightId: LEGACY_HIGHLIGHT_ID, quote: 'outro trecho' }),
      );

      expect(highlight.commentText).toBe(LEGACY_COMMENT_TEXT);
      expect(stored(LEGACY_HIGHLIGHT_ID).commentText).toBe(LEGACY_COMMENT_TEXT);
      expect(stored(LEGACY_HIGHLIGHT_ID).quote).toBe('outro trecho');
    });

    // Regra 14 — e nem o `commentDoc` é tocado quando só a página muda.
    it('keeps the commentDoc untouched when only the page changes', async () => {
      const before = structuredClone(stored().commentDoc);

      const { highlight } = await useCase.execute(validInput({ page: 99 }));

      expect(highlight.commentDoc).toEqual(before);
      expect(stored().commentDoc).toEqual(before);
      expect(stored().commentText).toBe('o comentário original');
    });

    /**
     * Regra 14 — o doc é gravado COMO VEIO. A asserção é contra um SNAPSHOT
     * tirado antes do `execute`: `toBe` provaria identidade de referência, que
     * não é o contrato — uma travessia que apagasse os `marks` devolvendo o
     * mesmo objeto passaria nele.
     */
    it('stores the commentDoc exactly as it arrived, marks and attrs included', async () => {
      const commentDoc: unknown = {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            attrs: { fonte: 'p. 45' },
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: 'é o que você faz',
                    marks: [{ type: 'italic' }],
                  },
                ],
              },
            ],
          },
        ],
      };
      const snapshot = structuredClone(commentDoc);

      const { highlight } = await useCase.execute(validInput({ commentDoc }));

      expect(highlight.commentDoc).toEqual(snapshot);
      expect(stored().commentDoc).toEqual(snapshot);
      expect(JSON.stringify(stored().commentDoc)).toContain('"marks"');
      expect(JSON.stringify(stored().commentDoc)).toContain('p. 45');
    });

    // O doc vazio é válido: é o que o autosave da primeira digitação manda. E é
    // diferente de `null` — ele fica gravado.
    it('accepts an empty commentDoc, which is not the same as clearing it', async () => {
      const { highlight } = await useCase.execute(
        validInput({ commentDoc: aDoc() }),
      );

      expect(highlight.commentDoc).toEqual(aDoc());
      expect(highlight.commentText).toBe('');
      expect(stored().commentDoc).toEqual(aDoc());
    });
  });

  /**
   * ⚠️ Regra 16 — o patch INTEIRO é validado antes de escrever: um campo ruim
   * não pode deixar os anteriores gravados, nem meia edição.
   *
   * Cada caso manda pelo menos um campo BOM junto do ruim, e é isso que faz o
   * teste medir a atomicidade em vez de só a recusa.
   */
  describe('the whole patch is validated before anything is written', () => {
    it.each<
      [string, Partial<EditHighlightInput>, new (message?: string) => Error]
    >([
      [
        'an empty quote after a good colour',
        { color: GREEN, quote: '   ' },
        InvalidHighlightError,
      ],
      [
        'a colour outside the palette after a good quote',
        { quote: 'outro trecho', color: '#ff0000' },
        InvalidHighlightError,
      ],
      [
        'a fractional page after a good reference',
        { reference: 'cap. 9', page: 45.5 },
        InvalidHighlightError,
      ],
      [
        'a zero page after a good quote',
        { quote: 'outro trecho', page: 0 },
        InvalidHighlightError,
      ],
      [
        'a malformed commentDoc after everything else is good',
        {
          quote: 'outro trecho',
          color: GREEN,
          page: 99,
          reference: 'cap. 9',
          commentDoc: 'não é um doc',
        },
        InvalidNoteError,
      ],
    ])('refuses %s and writes nothing', async (_label, patch, ErrorClass) => {
      await expect(useCase.execute(validInput(patch))).rejects.toBeInstanceOf(
        ErrorClass,
      );

      expect(highlights.updateCalls).toBe(0);
      // Nem o campo que era válido entrou.
      expect(stored().quote).toBe('a coragem de continuar');
      expect(stored().color).toBe(YELLOW);
      expect(stored().page).toBe(45);
      expect(stored().reference).toBe('cap. 3');
      expect(stored().commentText).toBe('o comentário original');
      expect(stored().updatedAt).toEqual(new Date(FIXED_ISO));
    });
  });

  /**
   * ⚠️ Regra 15 — patch vazio **NÃO custa um `UPDATE`**, e não é erro: é o retry
   * de uma fila offline que já coalesceu tudo. O `updateCalls` é a única forma
   * de distinguir "não chamou" de "chamou e o patch não mudou nada", e "chamou à
   * toa" é um `UPDATE` por request em toda tela que salva sem mudar nada.
   */
  describe('an empty patch', () => {
    it('returns the highlight untouched, without calling the repository', async () => {
      const before = stored();

      const { highlight } = await useCase.execute(validInput());

      expect(highlight).toEqual(before);
      expect(highlights.updateCalls).toBe(0);
    });

    // `undefined` explícito é ausência, não valor malformado — e ausência
    // sozinha continua sendo patch vazio.
    it('treats an explicit undefined in every field as absence', async () => {
      const { highlight } = await useCase.execute(
        validInput({
          quote: undefined,
          color: undefined,
          page: undefined,
          reference: undefined,
          commentDoc: undefined,
        }),
      );

      expect(highlight.quote).toBe('a coragem de continuar');
      expect(highlight.page).toBe(45);
      expect(highlights.updateCalls).toBe(0);
    });

    // E o `updatedAt` NÃO anda num patch vazio: não houve escrita real.
    it('does not bump updatedAt', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(highlight.updatedAt).toEqual(new Date(FIXED_ISO));
      expect(stored().updatedAt).toEqual(new Date(FIXED_ISO));
    });

    // O patch vazio vem DEPOIS do guard: não é atalho para furar autoria
    // nenhuma.
    it.each<[string, string, new (message?: string) => Error]>([
      ['an outsider', OUTSIDER_ID, NotAMemberError],
      ['a fellow member', OTHER_MEMBER_ID, NotTheAuthorError],
    ])('is still refused for %s', async (_label, actorUserId, ErrorClass) => {
      await expect(
        useCase.execute(validInput({ actorUserId })),
      ).rejects.toBeInstanceOf(ErrorClass);

      expect(highlights.updateCalls).toBe(0);
    });
  });

  /**
   * Regra 17 — contrabando, testado com o ator LEGÍTIMO e assertado na LINHA
   * GRAVADA (§7.5).
   *
   * Um teste de contrabando com ator de fora do clube morre no guard e nunca
   * chega ao campo que é escrito. E o mutante perigoso não é `campo:
   * input.campo` (que quebraria com `undefined` em todo teste), é
   * **`input.campo ?? highlight.campo`** — o envenenamento com fallback,
   * invisível enquanto o campo está ausente. Por isso cada teste manda um patch
   * REAL junto: sem ele, a asserção passaria pelo atalho do patch vazio.
   */
  describe('smuggling, with the legitimate author', () => {
    it('never lets a smuggled userId change the author of the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error o input não declara userId — o autor é o do grifo
        userId: OWNER_ID,
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.userId).toBe(AUTHOR_ID);
      expect(stored().userId).toBe(AUTHOR_ID);
      expect(stored().quote).toBe('outro trecho');
    });

    // Um `clubId` vindo do corpo faria o grifo aparecer na listagem de OUTRO
    // clube — envenenamento cross-tenant sem nenhum 403 no caminho.
    it('never lets a smuggled clubId move the highlight to another club', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error o input não declara clubId — ele vem do grifo
        clubId: OTHER_CLUB_ID,
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.clubId).toBe(CLUB_ID);
      expect(stored().clubId).toBe(CLUB_ID);
    });

    it('never lets a smuggled commentText reach the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        commentDoc: aDoc('o comentário de verdade'),
        // @ts-expect-error commentText é DERIVADO, nunca entra na API (ADR 0001)
        commentText: 'texto adulterado pelo cliente',
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.commentText).toBe('o comentário de verdade');
      expect(stored().commentText).toBe('o comentário de verdade');
    });

    /**
     * ⚠️ O mesmo contrabando, mas num patch **SEM `commentDoc`** — e é este que
     * morde.
     *
     * O teste acima manda um `commentDoc`, e é ele que faz `patch.commentText`
     * existir; num envenenamento colocado ANTES do spread do patch, o
     * `patch.commentText` derivado o cobre e o mutante sobrevive. Sem
     * `commentDoc` no patch não há nada para cobri-lo, e o `commentText` do
     * cliente chega à linha: corrigir o trecho reescreveria o texto derivado com
     * o que o cliente mandou (ADR 0001).
     */
    it('never lets a smuggled commentText reach the row on a quote-only patch', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error commentText é DERIVADO, nunca entra na API (ADR 0001)
        commentText: 'texto adulterado pelo cliente',
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.commentText).toBe('o comentário original');
      expect(stored().commentText).toBe('o comentário original');
      expect(stored().quote).toBe('outro trecho');
    });

    /**
     * Regra 17 — arquivar é o `archiveHighlight`, e ele confere autoria por si.
     * Um `status` no corpo do edit seria um segundo caminho para arquivar — e,
     * pior, um caminho para DESARQUIVAR, que é MVP 4.
     */
    it('never lets a smuggled status or archivedAt archive the highlight', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error o input não declara status — arquivar é o archiveHighlight
        status: 'ARCHIVED',
        archivedAt: new Date('2026-05-05T00:00:00.000Z'),
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.status).toBe('ACTIVE');
      expect(highlight.archivedAt).toBeNull();
      expect(stored().status).toBe('ACTIVE');
      expect(stored().archivedAt).toBeNull();
    });

    it('never lets a smuggled bookId, id or createdAt reach the stored row', async () => {
      const smuggled = {
        actorUserId: AUTHOR_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error nenhum dos três existe no input
        bookId: 'book-de-outro-clube',
        id: 'highlight-inventado',
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
      } satisfies EditHighlightInput;

      const { highlight } = await useCase.execute(smuggled);

      expect(highlight.bookId).toBe('book-1');
      expect(highlight.id).toBe(HIGHLIGHT_ID);
      expect(highlight.createdAt).toEqual(new Date(FIXED_ISO));
      // E não nasceu uma linha nova: continuam os 5 grifos da fixture.
      expect(highlights.saved).toHaveLength(5);
    });

    // Regra 17 — os imutáveis atravessam a edição mais agressiva possível.
    it('keeps every immutable field through a patch that touches everything', async () => {
      const before = stored();

      const { highlight } = await useCase.execute(
        validInput({
          quote: 'tudo novo',
          color: GREEN,
          page: 999,
          reference: 'cap. 99',
          commentDoc: aDoc('comentário completamente diferente'),
        }),
      );

      for (const field of [
        'id',
        'userId',
        'clubId',
        'bookId',
        'status',
      ] as const) {
        expect(highlight[field]).toBe(before[field]);
        expect(stored()[field]).toBe(before[field]);
      }
      expect(highlight.createdAt).toEqual(new Date(FIXED_ISO));
      expect(highlight.archivedAt).toBeNull();
      expect(stored().archivedAt).toBeNull();
    });
  });

  /**
   * ⚠️ **O NOME É O QUE ESTE TESTE PROVA, e nada além (§7.9).** Ele ficava no
   * `describe` acima, chamado *"does not let a smuggled clubId buy a way past
   * the tenant cut"* — e o nome prometia duas coisas que a medição desmentiu.
   *
   * **Medido:** o mutante `clubId: input.clubId ?? highlight.clubId` dentro do
   * `highlightForAuthor` tem **1 acusador**, e ele é
   * `highlight-for-author.test.ts > ignores a clubId that arrives in the input`.
   * Este teste **não** acusa, e não tem como: o `editHighlight` monta o input do
   * guard CAMPO POR CAMPO (`{ actorUserId, highlightId }`), então um `clubId` no
   * corpo nunca chega ao guard para ser usado. Um contrabando que não alcança o
   * campo não prova nada sobre o campo (§7.5) — a propriedade mora no arquivo do
   * guard, que é onde ela é assunto, e o ponteiro acima é pelo NOME do teste
   * porque número de linha envelhece (§7.4).
   *
   * O que ele prova, e é o que o nome diz agora: quem é membro de OUTRO clube
   * leva o corte de tenant do clube DO GRIFO, e a chave a mais no corpo não
   * atravessa o `buildPatch` — nenhum `update`, e a linha intacta.
   */
  describe('an actor from another club', () => {
    it('answers the tenant cut, and the extra key in the body changes nothing', async () => {
      const smuggled = {
        actorUserId: OUTSIDER_ID,
        highlightId: HIGHLIGHT_ID,
        quote: 'outro trecho',
        // @ts-expect-error o input não declara clubId
        clubId: OTHER_CLUB_ID,
      } satisfies EditHighlightInput;

      await expect(useCase.execute(smuggled)).rejects.toBeInstanceOf(
        NotAMemberError,
      );
      expect(highlights.updateCalls).toBe(0);
      expect(stored().quote).toBe('a coragem de continuar');
      expect(stored().clubId).toBe(CLUB_ID);
    });
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa 24
  // compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(
      validInput({
        quote: 'a primeira correção',
        page: 10,
        reference: 'cap. 1',
        commentDoc: aDoc('um comentário'),
      }),
    );
    const second = await useCase.execute(
      validInput({
        highlightId: SECOND_HIGHLIGHT_ID,
        quote: 'a segunda correção',
      }),
    );

    expect(first.highlight.quote).toBe('a primeira correção');
    expect(first.highlight.page).toBe(10);
    expect(first.highlight.reference).toBe('cap. 1');
    expect(first.highlight.commentText).toBe('um comentário');

    expect(second.highlight.id).toBe(SECOND_HIGHLIGHT_ID);
    expect(second.highlight.quote).toBe('a segunda correção');
    // Nada da primeira vaza para a segunda.
    expect(second.highlight.page).toBeNull();
    expect(second.highlight.reference).toBeNull();
    expect(second.highlight.color).toBe(GREEN);
    expect(second.highlight.commentText).toBe('outro comentário');
    expect(highlights.updateCalls).toBe(2);
  });
});
