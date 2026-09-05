import { beforeEach, describe, expect, it } from 'vitest';

import {
  NotAMemberError,
  NoteNotFoundError,
  NotTheAuthorError,
} from '../../domain/errors';
import { aMembership, aNote } from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { NoteForAuthorInput } from '../note-for-author';
import { noteForAuthor } from '../note-for-author';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const THIRD_CLUB_ID = 'club-3';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const OTHER_MEMBER_ID = 'user-marcos';
const OTHER_CLUB_MEMBER_ID = 'user-de-outro-clube';
const OUTSIDER_ID = 'user-forasteiro';

const NOTE_ID = 'note-da-maria';
const PLAN_NOTE_ID = 'note-do-dia-da-maria';
const ARCHIVED_NOTE_ID = 'note-arquivada-da-maria';
const OTHER_CLUB_NOTE_ID = 'note-da-maria-no-outro-clube';
const THIRD_CLUB_NOTE_ID = 'note-da-maria-no-terceiro-clube';

describe('noteForAuthor', () => {
  let memberships: MembershipRepositoryFake;
  let notes: NoteRepositoryFake;
  let assertMembership: AssertMembership;

  /** Fábrica, nunca `const` de `describe`: um teste que mute a nota não pode
   * neutralizar o seguinte (CONVENCOES-CODIGO §6.6). */
  function input(overrides: { actorUserId?: string; noteId?: string } = {}) {
    return { actorUserId: AUTHOR_ID, noteId: NOTE_ID, ...overrides };
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    notes = new NoteRepositoryFake();
    assertMembership = new AssertMembership(memberships);

    await notes.save(
      aNote({ id: NOTE_ID, kind: 'FREE', clubId: CLUB_ID, userId: AUTHOR_ID }),
    );
    await notes.save(
      aNote({
        id: PLAN_NOTE_ID,
        kind: 'PLAN',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
      }),
    );
    await notes.save(
      aNote({
        id: ARCHIVED_NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        status: 'ARCHIVED',
        archivedAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    );
    // A autora escreveu nestes dois clubes e depois saiu deles: o acervo do
    // clube continua íntegro, com autoria (ADR 0002).
    await notes.save(
      aNote({
        id: OTHER_CLUB_NOTE_ID,
        kind: 'FREE',
        clubId: OTHER_CLUB_ID,
        userId: AUTHOR_ID,
      }),
    );
    await notes.save(
      aNote({
        id: THIRD_CLUB_NOTE_ID,
        kind: 'FREE',
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

  // Regra 1
  it('refuses a note that does not exist', async () => {
    await expect(
      noteForAuthor(
        notes,
        assertMembership,
        input({ noteId: 'note-fantasma' }),
      ),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  /**
   * Regra 2 — a arquivada dá o MESMO erro da inexistente, de propósito:
   * arquivada é invisível até o MVP 4 (desarquivar nem existe), e um erro
   * próprio vazaria o estado da nota para quem não pode mais vê-la.
   */
  it('refuses an archived note with the same error as a missing one', async () => {
    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      input({ noteId: ARCHIVED_NOTE_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NoteNotFoundError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  // Regra 2 — e é a AUTORA quem toma o 404: nem ela reabre a própria arquivada.
  it('refuses the archived note even for its own author', async () => {
    await expect(
      noteForAuthor(
        notes,
        assertMembership,
        input({ actorUserId: AUTHOR_ID, noteId: ARCHIVED_NOTE_ID }),
      ),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });

  // Regra 3
  it('refuses an actor with no membership at all', async () => {
    await expect(
      noteForAuthor(
        notes,
        assertMembership,
        input({ actorUserId: OUTSIDER_ID }),
      ),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Regra 3 — membership arquivado não é membership.
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
      noteForAuthor(notes, assertMembership, input()),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  // Regra 3 — o membro de outro clube é membro de verdade, e leva 404 igual.
  it('refuses a member of another club', async () => {
    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      input({ actorUserId: OTHER_CLUB_MEMBER_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  // Regra 4 — o 403 do ADR 0002: ele JÁ LÊ esta nota na listagem do clube.
  it('refuses an active member who is not the author', async () => {
    await expect(
      noteForAuthor(
        notes,
        assertMembership,
        input({ actorUserId: OTHER_MEMBER_ID }),
      ),
    ).rejects.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * Regra 8 — papel não compra autoria. É o ADR 0002: o admin do clube manda no
   * livro e no plano, não no que as pessoas escreveram.
   */
  it.each([
    ['OWNER', OWNER_ID],
    ['ADMIN', ADMIN_ID],
  ])('refuses the %s of the club, who is not the author', async (_r, actor) => {
    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      input({ actorUserId: actor }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotTheAuthorError);
    expect(error).not.toBeInstanceOf(NoteNotFoundError);
  });

  /**
   * Regra 5 — A ORDEM: membership ANTES de autoria.
   *
   * O ator falha nos DOIS eixos ao mesmo tempo (não é do clube e não é o
   * autor), e é isso que pina a ordem: inverter os dois blocos devolveria
   * `NotTheAuthorError` (403) e diria a um forasteiro que aquela nota existe.
   * Um teste de cada eixo isolado deixa a ordem sem prova.
   */
  it('answers the tenant cut, not the authorship one, to an outsider', async () => {
    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      input({ actorUserId: OUTSIDER_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * Regra 6 — o clube conferido é `note.clubId`, nunca "algum clube do ator".
   *
   * A autora é membro ativa de UM clube e a nota é de outro, do qual ela saiu:
   * autoria não a faz entrar. Uma implementação que confira "o clube do
   * membership do ator" passaria em todos os testes acima e furaria aqui.
   */
  it('refuses the author of a note in a club she is no longer in', async () => {
    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      input({ noteId: OTHER_CLUB_NOTE_ID }),
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  /**
   * Regra 6 — e com o ator em DOIS clubes: passa na nota do clube em que ele
   * está e falha na do clube em que não está, com o mesmo repositório e a mesma
   * autoria. Com um clube só, "pegou o primeiro membership" passaria.
   */
  it('uses the club of the note for an actor who is in two clubs', async () => {
    await memberships.save(
      aMembership({ userId: AUTHOR_ID, clubId: OTHER_CLUB_ID }),
    );

    const allowed = await noteForAuthor(
      notes,
      assertMembership,
      input({ noteId: OTHER_CLUB_NOTE_ID }),
    );
    expect(allowed.id).toBe(OTHER_CLUB_NOTE_ID);
    expect(allowed.clubId).toBe(OTHER_CLUB_ID);

    await expect(
      noteForAuthor(
        notes,
        assertMembership,
        input({ noteId: THIRD_CLUB_NOTE_ID }),
      ),
    ).rejects.toBeInstanceOf(NotAMemberError);
  });

  /**
   * Regra 6 — e o `clubId` do INPUT é ignorado, mesmo que chegue.
   *
   * O contrato do guard diz "o clube vem de `note.clubId`, NUNCA do input", e
   * hoje isso é inalcançável por dentro: os dois UseCases da fatia montam
   * `{ actorUserId, noteId }` campo por campo. O risco é o PRÓXIMO chamador — a
   * rota da Tarefa 11, o `listNotes` — escrever
   * `noteForAuthor(..., { ...req.body, actorUserId })` e o corpo passar a
   * carregar um `clubId`. Um `clubId: input.clubId ?? note.clubId` aqui deixaria
   * o membro de OUTRO clube furar o corte mandando o clube dele no corpo: a
   * membership seria conferida no clube que ele tem, não no clube da nota.
   *
   * A chave extra entra por `as unknown as` de propósito: é exatamente o que um
   * spread de corpo de request faria em runtime, e os tipos não guardam essa
   * porta.
   */
  it('ignores a clubId that arrives in the input', async () => {
    const smuggled = {
      actorUserId: OTHER_CLUB_MEMBER_ID,
      noteId: NOTE_ID,
      clubId: OTHER_CLUB_ID,
    } as unknown as NoteForAuthorInput;

    const error: unknown = await noteForAuthor(
      notes,
      assertMembership,
      smuggled,
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(NotAMemberError);
    expect(error).not.toBeInstanceOf(NotTheAuthorError);
  });

  // Regra 7
  it('returns the note to its author', async () => {
    const note = await noteForAuthor(notes, assertMembership, input());

    expect(note.id).toBe(NOTE_ID);
    expect(note.userId).toBe(AUTHOR_ID);
    expect(note.clubId).toBe(CLUB_ID);
    expect(note).toEqual(await notes.byId(NOTE_ID));
  });

  /**
   * Regra 7 — o guard é neutro quanto ao `kind`: quem recusa a nota do dia é o
   * `editNote` (regra 12), e o `archiveNote` depende justamente de o guard
   * deixar passar as duas.
   */
  it('returns a plan note to its author too', async () => {
    const note = await noteForAuthor(
      notes,
      assertMembership,
      input({ noteId: PLAN_NOTE_ID }),
    );

    expect(note.kind).toBe('PLAN');
  });

  // É um guard de leitura: nenhum caminho dele escreve.
  it('never writes, on any path', async () => {
    await noteForAuthor(notes, assertMembership, input());
    for (const actorUserId of [OUTSIDER_ID, OWNER_ID, OTHER_MEMBER_ID]) {
      await noteForAuthor(
        notes,
        assertMembership,
        input({ actorUserId }),
      ).catch(() => undefined);
    }

    expect(notes.updateCalls).toBe(0);
    // As 5 notas da fixture, e nada além delas.
    expect(notes.saveCalls).toBe(5);
  });
});
