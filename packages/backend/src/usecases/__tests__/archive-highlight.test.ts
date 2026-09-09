import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  HighlightNotFoundError,
  NotAMemberError,
  NotTheAuthorError,
} from '../../domain/errors';
import type { Highlight } from '../../domain/highlight';
import { installAdvancingClock } from '../../test-support/advancing-clock';
import {
  aDoc,
  aHighlight,
  aMembership,
  FIXED_ISO,
  required,
} from '../../test-support/builders';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import type { ArchiveHighlightInput } from '../archive-highlight';
import { ArchiveHighlight } from '../archive-highlight';
import { AssertMembership } from '../assert-membership';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const OTHER_MEMBER_ID = 'user-marcos';
const OUTSIDER_ID = 'user-forasteiro';

const HIGHLIGHT_ID = 'highlight-da-maria';
const SECOND_HIGHLIGHT_ID = 'segundo-highlight-da-maria';
const NO_COMMENT_HIGHLIGHT_ID = 'highlight-sem-comentario-da-maria';
const ARCHIVED_HIGHLIGHT_ID = 'highlight-arquivado-da-maria';
const ARCHIVED_AT_ISO = '2026-02-01T00:00:00.000Z';

const YELLOW = '#facc15';
const GREEN = '#22c55e';

/**
 * ⚠️ §7.6 — losslessness se prova por SNAPSHOT antes/depois, nunca por `toBe`.
 *
 * Tudo menos os três campos que arquivar MUDA de propósito. Um `toBe` escrito à
 * mão provaria só que os campos que alguém lembrou de listar sobreviveram — e o
 * campo que a operação apagou é justamente o que ninguém pensou em listar. Um
 * campo NOVO na entidade entra aqui de graça.
 */
function contentOf(
  highlight: Highlight,
): Omit<Highlight, 'status' | 'archivedAt' | 'updatedAt'> {
  const { status, archivedAt, updatedAt, ...content } = highlight;
  // Os três desestruturados existem só para sair do objeto; a asserção é sobre
  // o resto. Referenciá-los é o que satisfaz o lint sem um `void` obscuro.
  expect([status, archivedAt, updatedAt]).toHaveLength(3);
  return content;
}

describe('ArchiveHighlight', () => {
  let memberships: MembershipRepositoryFake;
  let highlights: HighlightRepositoryFake;
  let useCase: ArchiveHighlight;

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function validInput(
    overrides: Partial<ArchiveHighlightInput> = {},
  ): ArchiveHighlightInput {
    return {
      actorUserId: AUTHOR_ID,
      highlightId: HIGHLIGHT_ID,
      ...overrides,
    };
  }

  function stored(highlightId = HIGHLIGHT_ID): Highlight {
    return required(highlights.saved.find((one) => one.id === highlightId));
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    highlights = new HighlightRepositoryFake();
    useCase = new ArchiveHighlight(
      new AssertMembership(memberships),
      highlights,
    );

    await highlights.save(
      aHighlight({
        id: HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        quote: 'a coragem de continuar',
        color: YELLOW,
        page: 45,
        reference: 'cap. 3',
        commentDoc: aDoc('o comentário que não serve mais'),
      }),
    );
    await highlights.save(
      aHighlight({
        id: SECOND_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        quote: 'outro trecho',
        color: GREEN,
      }),
    );
    // O grifo SEM comentário e SEM página: os nulos também têm de atravessar
    // intactos, e um `?? ''`/`?? 0` na travessia só aparece aqui.
    await highlights.save(
      aHighlight({
        id: NO_COMMENT_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        page: null,
        reference: null,
        commentDoc: null,
      }),
    );
    await highlights.save(
      aHighlight({
        id: ARCHIVED_HIGHLIGHT_ID,
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        status: 'ARCHIVED',
        archivedAt: new Date(ARCHIVED_AT_ISO),
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

  // O stub de relógio de `reads the clock once...` é GLOBAL: sem isto ele vazaria
  // para os testes seguintes do arquivo, que leem o relógio de verdade.
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Regra 18 — a delegação ao `highlightForAuthor`. As regras dele têm suíte
   * própria (`highlight-for-author.test.ts`) e não se copiam aqui.
   */
  describe('delegates the tenant and authorship cut to highlightForAuthor', () => {
    it('refuses a highlight that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ highlightId: 'highlight-fantasma' })),
      ).rejects.toBeInstanceOf(HighlightNotFoundError);

      expect(highlights.updateCalls).toBe(0);
    });

    it('refuses an actor who is not a member of the club of the highlight', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OUTSIDER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(highlights.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    it('refuses a fellow member who is not the author', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotTheAuthorError);

      expect(highlights.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    /**
     * ⚠️ Regra 18 — **só o autor arquiva**, e papel não compra isso. É o ADR
     * 0002: o `OWNER` do clube manda no livro e no plano, não no que as pessoas
     * escreveram. Sem este teste, um `requireRole: ADMIN_ROLES` copiado do
     * `archiveBook` passaria despercebido.
     */
    it('refuses the OWNER of the club, who is not the author', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OWNER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotTheAuthorError);
      expect(error).not.toBeInstanceOf(HighlightNotFoundError);
      expect(highlights.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    /**
     * Os dois eixos cruzados: quem não é do clube não descobre, pela diferença
     * entre os erros, nem que o grifo existe nem em que estado ele está.
     *
     * O erro que sai é o `HighlightNotFoundError` — o corte do ARQUIVADO, que o
     * guard confere ANTES da membership —, não o `NotAMemberError`. O nome diz
     * isso: chamá-lo de "corte de tenant" prometeria uma asserção que este teste
     * não faz. Os dois são 404, então o forasteiro não distingue os casos de
     * fora; a diferença que este teste pina é a de CLASSE, e ela é a da ordem
     * dos cortes dentro do guard.
     */
    it('answers the not-found cut, not the authorship one, to an outsider aiming at an archived highlight', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: OUTSIDER_ID,
            highlightId: ARCHIVED_HIGHLIGHT_ID,
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(HighlightNotFoundError);
      expect(error).not.toBeInstanceOf(NotTheAuthorError);
      expect(highlights.updateCalls).toBe(0);
    });
  });

  describe('archiving', () => {
    // Regra 18
    it('sets the status to ARCHIVED and stamps archivedAt with now', async () => {
      const before = Date.now();

      const { highlight } = await useCase.execute(validInput());

      const after = Date.now();
      expect(highlight.status).toBe('ARCHIVED');
      expect(required(highlight.archivedAt).getTime()).toBeGreaterThanOrEqual(
        before,
      );
      expect(required(highlight.archivedAt).getTime()).toBeLessThanOrEqual(
        after,
      );
      expect(stored().status).toBe('ARCHIVED');
      expect(required(stored().archivedAt).getTime()).toBe(
        required(highlight.archivedAt).getTime(),
      );
      expect(highlights.updateCalls).toBe(1);
    });

    /**
     * ⚠️ Regra 18 — **arquivar move o `updatedAt`**, e o move para o MESMO
     * instante do `archivedAt`. → ADR 0008: o domínio é o dono de `updatedAt`
     * (o `Highlight` nasce sem `@updatedAt` no schema, e é a Tarefa 24 que
     * declara a coluna — o §6 do plano, que diz `@updatedAt`, está desatualizado
     * e o ADR 0008 o emenda), e `updatedAt` significa "quando esta linha mudou
     * pela última vez" — arquivar muda a linha.
     *
     * A fixture tem `updatedAt` em `FIXED_ISO` de propósito: duas chamadas a
     * `new Date()` no mesmo teste cairiam no mesmo milissegundo, e "avançou"
     * ficaria indecidível.
     *
     * ⚠️ O que este teste **não** prova, e a auditoria mediu: a igualdade com o
     * `archivedAt` NÃO prova "um `new Date()` só". Duas chamadas no mesmo tick
     * devolvem o MESMO milissegundo, então o mutante com um `new Date()` por
     * campo passa aqui — 1206/1206 verdes em três rodadas, zero acusadores
     * (§7.8). O instante ÚNICO é assunto do
     * `reads the clock once for both archivedAt and updatedAt`, logo abaixo.
     */
    it('bumps updatedAt to the same instant as archivedAt', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(highlight.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(highlight.updatedAt.getTime()).toBe(
        required(highlight.archivedAt).getTime(),
      );
      expect(stored().updatedAt.getTime()).toBe(highlight.updatedAt.getTime());
      expect(stored().updatedAt.getTime()).toBe(
        required(stored().archivedAt).getTime(),
      );
    });

    /**
     * ⚠️ Regra 18 — **UMA leitura só do relógio** para `archivedAt` e
     * `updatedAt`, e é o stub que torna a propriedade decidível.
     *
     * O `installAdvancingClock` faz cada `new Date()` sem argumento devolver um
     * instante um segundo à frente do anterior, então o mutante "um `new Date()`
     * por campo" muda DUAS coisas: `reads` vira 2 e `updatedAt` sai um segundo
     * depois do `archivedAt`. Sem o stub, nenhuma das duas é observável — a
     * medição da auditoria foi 0 acusadores. O `at(1)` é calculado do
     * `CLOCK_BASE_ISO`, não do código sob teste, e a precondição "o relógio
     * ANDA" tem suíte própria (`advancing-clock.test.ts`).
     *
     * `reads` é 1 e não mais porque este é o único `new Date()` sem argumento do
     * caminho: o `clone` do fake reconstrói `Date` a partir de `Date`.
     */
    it('reads the clock once for both archivedAt and updatedAt', async () => {
      const clock = installAdvancingClock();

      const { highlight } = await useCase.execute(validInput());

      expect(clock.reads).toBe(1);
      expect(required(highlight.archivedAt).getTime()).toBe(clock.at(1));
      expect(highlight.updatedAt.getTime()).toBe(clock.at(1));
      expect(required(stored().archivedAt).getTime()).toBe(clock.at(1));
      expect(stored().updatedAt.getTime()).toBe(clock.at(1));
    });

    /**
     * ⚠️ Regra 18 — **NÃO APAGA CONTEÚDO**, provado por SNAPSHOT antes/depois
     * (§7.6) e não por `toBe` campo a campo.
     *
     * Arquivar é tirar da vista, não destruir: o acervo do clube continua
     * íntegro (ADR 0002), e o grifo volta legível inteiro se um dia desarquivar
     * existir (MVP 4). O `contentOf` tira só os três campos que arquivar muda,
     * então QUALQUER outro campo que a operação zerasse aparece aqui —
     * inclusive um campo novo que a entidade ganhe amanhã.
     */
    it('keeps every content field intact', async () => {
      const before = contentOf(stored());

      const { highlight } = await useCase.execute(validInput());

      expect(contentOf(stored())).toEqual(before);
      expect(contentOf(highlight)).toEqual(before);
    });

    // O mesmo, para o grifo cujos campos opcionais são NULOS: um `?? ''` ou um
    // `?? 0` na travessia só aparece aqui.
    it('keeps the null fields of a highlight with no comment and no page', async () => {
      const before = contentOf(stored(NO_COMMENT_HIGHLIGHT_ID));

      await useCase.execute(
        validInput({ highlightId: NO_COMMENT_HIGHLIGHT_ID }),
      );

      const after = stored(NO_COMMENT_HIGHLIGHT_ID);
      expect(contentOf(after)).toEqual(before);
      expect(after.page).toBeNull();
      expect(after.reference).toBeNull();
      expect(after.commentDoc).toBeNull();
      expect(after.commentText).toBe('');
      expect(after.status).toBe('ARCHIVED');
    });

    /**
     * E o conteúdo pinado à mão, além do snapshot: o snapshot prova "nada mudou"
     * e este prova "o que está lá é o que a pessoa escreveu" — um snapshot de um
     * grifo que já estivesse vazio antes passaria no de cima.
     */
    it('still carries the quote, the colour and the comment of its author', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(highlight.quote).toBe('a coragem de continuar');
      expect(highlight.color).toBe(YELLOW);
      expect(highlight.page).toBe(45);
      expect(highlight.reference).toBe('cap. 3');
      expect(highlight.commentText).toBe('o comentário que não serve mais');
      expect(JSON.stringify(highlight.commentDoc)).toContain(
        'o comentário que não serve mais',
      );
      expect(stored().userId).toBe(AUTHOR_ID);
    });

    // Regra 18 — identidade, tenant e nascimento não mudam ao arquivar.
    it('preserves the id, the createdAt, the tenant and the authorship', async () => {
      const { highlight } = await useCase.execute(validInput());

      expect(highlight.id).toBe(HIGHLIGHT_ID);
      expect(highlight.createdAt).toEqual(new Date(FIXED_ISO));
      expect(highlight.userId).toBe(AUTHOR_ID);
      expect(highlight.clubId).toBe(CLUB_ID);
      expect(highlight.bookId).toBe('book-1');
      expect(stored().createdAt).toEqual(new Date(FIXED_ISO));
    });
  });

  /**
   * Regra 19 — grifo já arquivado é `HighlightNotFoundError`, e o `archivedAt`
   * original **não é regravado**. O guard trata o arquivado como inexistente,
   * então não existe caminho que reescreva a data em que a pessoa arquivou.
   */
  describe('a highlight that is already archived', () => {
    it('refuses it with HighlightNotFoundError', async () => {
      await expect(
        useCase.execute(validInput({ highlightId: ARCHIVED_HIGHLIGHT_ID })),
      ).rejects.toBeInstanceOf(HighlightNotFoundError);
    });

    // Regra 19 — inclusive para o próprio autor: desarquivar é MVP 4.
    it('refuses it even for its own author', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({
            actorUserId: AUTHOR_ID,
            highlightId: ARCHIVED_HIGHLIGHT_ID,
          }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(HighlightNotFoundError);
      expect(error).not.toBeInstanceOf(NotTheAuthorError);
    });

    it('never rewrites the original archivedAt', async () => {
      await useCase
        .execute(validInput({ highlightId: ARCHIVED_HIGHLIGHT_ID }))
        .catch(() => undefined);

      expect(stored(ARCHIVED_HIGHLIGHT_ID).archivedAt).toEqual(
        new Date(ARCHIVED_AT_ISO),
      );
      expect(highlights.updateCalls).toBe(0);
    });

    // E arquivar duas vezes seguidas pela porta da frente dá o mesmo: a segunda
    // chamada não desloca a data da primeira.
    it('keeps the archivedAt of the first call when the same highlight is archived twice', async () => {
      const { highlight } = await useCase.execute(validInput());
      const firstArchivedAt = required(highlight.archivedAt);

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        HighlightNotFoundError,
      );

      expect(required(stored().archivedAt).getTime()).toBe(
        firstArchivedAt.getTime(),
      );
      expect(highlights.updateCalls).toBe(1);
    });
  });

  /**
   * Regra 18 — soft delete e nada além disso. A linha continua no acervo, com
   * autoria; hard delete não existe nesta fatia, e o port nem tem `delete`.
   */
  it('never deletes the row', async () => {
    await useCase.execute(validInput());

    expect(highlights.saved).toHaveLength(4);
    await expect(highlights.byId(HIGHLIGHT_ID)).resolves.not.toBeNull();
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa 24
  // compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(validInput());
    const second = await useCase.execute(
      validInput({ highlightId: SECOND_HIGHLIGHT_ID }),
    );

    expect(first.highlight.id).toBe(HIGHLIGHT_ID);
    expect(first.highlight.quote).toBe('a coragem de continuar');
    expect(second.highlight.id).toBe(SECOND_HIGHLIGHT_ID);
    expect(second.highlight.quote).toBe('outro trecho');
    expect(second.highlight.color).toBe(GREEN);
    expect(second.highlight.status).toBe('ARCHIVED');
    // O grifo sem comentário e o que já estava arquivado não foram tocados.
    expect(stored(NO_COMMENT_HIGHLIGHT_ID).status).toBe('ACTIVE');
    expect(highlights.updateCalls).toBe(2);
  });
});
