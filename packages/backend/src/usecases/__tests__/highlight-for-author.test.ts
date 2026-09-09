import { beforeEach, describe, expect, it } from 'vitest';

import {
  HighlightNotFoundError,
  NotAMemberError,
  NotTheAuthorError,
} from '../../domain/errors';
import { aHighlight, aMembership } from '../../test-support/builders';
import { HighlightRepositoryFake } from '../_fakes/highlight-repository-fake';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { HighlightForAuthorInput } from '../highlight-for-author';
import { highlightForAuthor } from '../highlight-for-author';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const THIRD_CLUB_ID = 'club-3';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const OTHER_MEMBER_ID = 'user-marcos';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';
const OUTSIDER_ID = 'user-forasteiro';

const HIGHLIGHT_ID = 'highlight-da-maria';
const ARCHIVED_HIGHLIGHT_ID = 'highlight-arquivado-da-maria';
const OTHER_CLUB_HIGHLIGHT_ID = 'highlight-da-maria-no-outro-clube';
const THIRD_CLUB_HIGHLIGHT_ID = 'highlight-da-maria-no-terceiro-clube';

/**
 * Regras 13 e 19 — o corte de tenant **e** de autoria do grifo, em UM lugar só.
 *
 * Cópia fiel do `noteForAuthor` (que tem suíte gêmea): os três UseCases da fatia
 * precisam do mesmo critério, e três cópias é como um deles passa a ler o clube
 * do input numa refatoração futura.
 */
describe('highlightForAuthor', () => {
  let memberships: MembershipRepositoryFake;
  let highlights: HighlightRepositoryFake;
  let assertMembership: AssertMembership;

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §7.7). */
  function input(
    overrides: Partial<HighlightForAuthorInput> = {},
  ): HighlightForAuthorInput {
    return { actorUserId: AUTHOR_ID, highlightId: HIGHLIGHT_ID, ...overrides };
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    highlights = new HighlightRepositoryFake();
    assertMembership = new AssertMembership(memberships);

    await highlights.save(
      aHighlight({ id: HIGHLIGHT_ID, clubId: CLUB_ID, userId: AUTHOR_ID }),
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
    // A autora grifou nestes dois clubes e depois saiu deles: o acervo do clube
    // continua íntegro, com autoria (ADR 0002).
    await highlights.save(
      aHighlight({
        id: OTHER_CLUB_HIGHLIGHT_ID,
        clubId: OTHER_CLUB_ID,
        userId: AUTHOR_ID,
      }),
    );
    await highlights.save(
      aHighlight({
        id: THIRD_CLUB_HIGHLIGHT_ID,
        clubId: THIRD_CLUB_ID,
        userId: AUTHOR_ID,
      }),
    );

    for (const [userId, role] of [
      [AUTHOR_ID, 'MEMBER'],
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [OTHER_MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
    }
    await memberships.save(
      aMembership({ userId: OTHER_CLUB_MEMBER_ID, clubId: OTHER_CLUB_ID }),
    );
  });

  // Regra 19
  it('refuses a highlight that does not exist', async () => {
    await expect(
      highlightForAuthor(
        highlights,
        assertMembership,
        input({ highlightId: 'highlight-fantasma' }),
      ),
    ).rejects.toBeInstanceOf(HighlightNotFoundError);
  });

  /**
   * Regra 19 — o arquivado dá o MESMO erro do inexistente, de propósito:
   * arquivado é invisível até o MVP 4 (desarquivar nem existe), e um erro
   * próprio vazaria o estado do grifo para quem não pode mais vê-lo.
   */
  it('refuses an archived highlight with the same error as a missing one', async () => {
    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ highlightId: ARCHIVED_HIGHLIGHT_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(HighlightNotFoundError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  // Regra 19 — e é a AUTORA quem toma o 404: nem ela reabre o próprio arquivado.
  it('refuses the archived highlight even for its own author', async () => {
    await expect(
      highlightForAuthor(
        highlights,
        assertMembership,
        input({ actorUserId: AUTHOR_ID, highlightId: ARCHIVED_HIGHLIGHT_ID }),
      ),
    ).rejects.toBeInstanceOf(HighlightNotFoundError);
  });

  it('refuses an actor with no membership at all', async () => {
    await expect(
      highlightForAuthor(
        highlights,
        assertMembership,
        input({ actorUserId: OUTSIDER_ID }),
      ),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Membership arquivado não é membership.
  it('refuses an actor whose membership is archived', async () => {
    await memberships.save(
      aMembership({
        userId: AUTHOR_ID,
        clubId: CLUB_ID,
        role: 'MEMBER',
        status: 'ARCHIVED',
      }),
    );

    await expect(
      highlightForAuthor(highlights, assertMembership, input()),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // O membro de outro clube é membro de verdade, e leva 404 igual.
  it('refuses a member of another club', async () => {
    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ actorUserId: OTHER_CLUB_MEMBER_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  // Regra 13 — o 403 do ADR 0002: ele JÁ LÊ este grifo na listagem do clube.
  it('refuses an active member who is not the author', async () => {
    await expect(
      highlightForAuthor(
        highlights,
        assertMembership,
        input({ actorUserId: OTHER_MEMBER_ID }),
      ),
    ).rejects.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * Regra 13 — papel não compra autoria. É o ADR 0002: o admin do clube manda no
   * livro e no plano, não no que as pessoas escreveram. Nem o super-admin, que
   * nem chega aqui: este guard não consulta `isSuperAdmin`.
   */
  it.each([
    ['OWNER', OWNER_ID],
    ['ADMIN', ADMIN_ID],
  ])('refuses the %s of the club, who is not the author', async (_r, actor) => {
    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ actorUserId: actor }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotTheAuthorError);
    expect(error).not.toBeInstanceOf(HighlightNotFoundError);
  });

  /**
   * ⚠️ Regra 13 — A ORDEM: membership ANTES de autoria.
   *
   * O ator falha nos DOIS eixos ao mesmo tempo (não é do clube e não é o autor),
   * e é isso que pina a ordem: inverter os dois blocos devolveria
   * `NotTheAuthorError` (403) e diria a um forasteiro que aquele grifo existe.
   * Um teste de cada eixo isolado deixa a ordem sem prova.
   */
  it('answers the tenant cut, not the authorship one, to an outsider', async () => {
    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ actorUserId: OUTSIDER_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * O clube conferido é `highlight.clubId`, nunca "algum clube do ator".
   *
   * A autora é membro ativa de UM clube e o grifo é de outro, do qual ela saiu:
   * autoria não a faz entrar. Uma implementação que confira "o clube do
   * membership do ator" passaria em todos os testes acima e furaria aqui.
   */
  it('refuses the author of a highlight in a club she is no longer in', async () => {
    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ highlightId: OTHER_CLUB_HIGHLIGHT_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * E com o ator em DOIS clubes: passa no grifo do clube em que ele está e falha
   * no do clube em que não está, com o mesmo repositório e a mesma autoria. Com
   * um clube só, "pegou o primeiro membership" passaria.
   */
  it('uses the club of the highlight for an actor who is in two clubs', async () => {
    await memberships.save(
      aMembership({ userId: AUTHOR_ID, clubId: OTHER_CLUB_ID }),
    );

    const allowed = await highlightForAuthor(
      highlights,
      assertMembership,
      input({ highlightId: OTHER_CLUB_HIGHLIGHT_ID }),
    );
    expect(allowed.id).toBe(OTHER_CLUB_HIGHLIGHT_ID);
    expect(allowed.clubId).toBe(OTHER_CLUB_ID);

    await expect(
      highlightForAuthor(
        highlights,
        assertMembership,
        input({ highlightId: THIRD_CLUB_HIGHLIGHT_ID }),
      ),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  /**
   * E o `clubId` do INPUT é ignorado, mesmo que chegue.
   *
   * O contrato do guard diz "o clube vem de `highlight.clubId`, NUNCA do input",
   * e hoje isso é inalcançável por dentro: os três UseCases da fatia montam
   * `{ actorUserId, highlightId }` campo por campo. O risco é o PRÓXIMO chamador
   * — a rota da Tarefa 24 — escrever
   * `highlightForAuthor(..., { ...req.body, actorUserId })` e o corpo passar a
   * carregar um `clubId`. Um `clubId: input.clubId ?? highlight.clubId` aqui
   * deixaria o membro de OUTRO clube furar o corte mandando o clube dele no
   * corpo: a membership seria conferida no clube que ele tem, não no do grifo.
   *
   * A chave extra entra por `as unknown as` de propósito: é exatamente o que um
   * spread de corpo de request faria em runtime, e os tipos não guardam essa
   * porta.
   */
  it('ignores a clubId that arrives in the input', async () => {
    const smuggled = {
      actorUserId: OTHER_CLUB_MEMBER_ID,
      highlightId: HIGHLIGHT_ID,
      clubId: OTHER_CLUB_ID,
    } as unknown as HighlightForAuthorInput;

    const error: unknown = await highlightForAuthor(
      highlights,
      assertMembership,
      smuggled,
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  it('returns the highlight to its author', async () => {
    const highlight = await highlightForAuthor(
      highlights,
      assertMembership,
      input(),
    );

    expect(highlight.id).toBe(HIGHLIGHT_ID);
    expect(highlight.userId).toBe(AUTHOR_ID);
    expect(highlight.clubId).toBe(CLUB_ID);
    expect(highlight).toEqual(await highlights.byId(HIGHLIGHT_ID));
  });

  // É um guard de leitura: nenhum caminho dele escreve.
  it('never writes, on any path', async () => {
    await highlightForAuthor(highlights, assertMembership, input());
    for (const actorUserId of [OUTSIDER_ID, OWNER_ID, OTHER_MEMBER_ID]) {
      await highlightForAuthor(
        highlights,
        assertMembership,
        input({ actorUserId }),
      ).catch(() => undefined);
    }

    expect(highlights.updateCalls).toBe(0);
    // Os 4 grifos da fixture, e nada além deles.
    expect(highlights.saveCalls).toBe(4);
  });
});
