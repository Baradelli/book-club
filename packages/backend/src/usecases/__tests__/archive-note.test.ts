import { beforeEach, describe, expect, it } from 'vitest';

import {
  NotAMemberError,
  NoteNotFoundError,
  NotTheAuthorError,
} from '../../domain/errors';
import type { Note } from '../../domain/note';
import {
  aDoc,
  aMembership,
  aNote,
  FIXED_ISO,
  required,
} from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import type { ArchiveNoteInput } from '../archive-note';
import { ArchiveNote } from '../archive-note';
import { AssertMembership } from '../assert-membership';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';

const AUTHOR_ID = 'user-maria';
const OWNER_ID = 'user-owner';
const OTHER_MEMBER_ID = 'user-marcos';
const OUTSIDER_ID = 'user-forasteiro';

const NOTE_ID = 'note-avulsa-da-maria';
const SECOND_NOTE_ID = 'segunda-avulsa-da-maria';
const PLAN_NOTE_ID = 'note-do-dia-da-maria';
const ARCHIVED_NOTE_ID = 'note-arquivada-da-maria';
const ARCHIVED_AT_ISO = '2026-02-01T00:00:00.000Z';

describe('ArchiveNote', () => {
  let memberships: MembershipRepositoryFake;
  let notes: NoteRepositoryFake;
  let useCase: ArchiveNote;

  /** Fábrica, nunca `const` de `describe` (CONVENCOES-CODIGO §6.6). */
  function validInput(
    overrides: Partial<ArchiveNoteInput> = {},
  ): ArchiveNoteInput {
    return { actorUserId: AUTHOR_ID, noteId: NOTE_ID, ...overrides };
  }

  function stored(noteId = NOTE_ID): Note {
    return required(notes.saved.find((note) => note.id === noteId));
  }

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    notes = new NoteRepositoryFake();
    useCase = new ArchiveNote(new AssertMembership(memberships), notes);

    await notes.save(
      aNote({
        id: NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        title: 'Sobre o anel',
        reference: 'p. 45',
        doc: aDoc('a ideia que não serve mais'),
      }),
    );
    await notes.save(
      aNote({
        id: SECOND_NOTE_ID,
        kind: 'FREE',
        clubId: CLUB_ID,
        userId: AUTHOR_ID,
        title: 'Sobre a coragem',
      }),
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

  /**
   * Regra 22 — a delegação ao `noteForAuthor`. As regras 1–8 têm suíte própria
   * (`note-for-author.test.ts`) e não se copiam aqui.
   */
  describe('delegates the tenant and authorship cut to noteForAuthor', () => {
    it('refuses a note that does not exist', async () => {
      await expect(
        useCase.execute(validInput({ noteId: 'note-fantasma' })),
      ).rejects.toBeInstanceOf(NoteNotFoundError);

      expect(notes.updateCalls).toBe(0);
    });

    it('refuses an actor who is not a member of the club of the note', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OUTSIDER_ID })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    it('refuses a fellow member who is not the author', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: OTHER_MEMBER_ID })),
      ).rejects.toBeInstanceOf(NotTheAuthorError);

      expect(notes.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    /**
     * Regra 27 — **só o autor arquiva**, e papel não compra isso. É o ADR 0002:
     * o `OWNER` do clube manda no livro e no plano, não no que as pessoas
     * escreveram. Sem este teste, um `requireRole: ADMIN_ROLES` copiado do
     * `archiveBook` passaria despercebido.
     */
    it('refuses the OWNER of the club, who is not the author', async () => {
      const error: unknown = await useCase
        .execute(validInput({ actorUserId: OWNER_ID }))
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NotTheAuthorError);
      expect(error).not.toBeInstanceOf(NoteNotFoundError);
      expect(notes.updateCalls).toBe(0);
      expect(stored().status).toBe('ACTIVE');
    });

    /**
     * Os dois eixos cruzados: quem não é do clube não descobre, pela diferença
     * entre os erros, nem que a nota existe nem em que estado ela está.
     *
     * O erro que sai é o `NoteNotFoundError` — o corte da nota ARQUIVADA, que o
     * guard confere ANTES da membership —, não o `NotAMemberError`. O nome diz
     * isso: chamá-lo de "corte de tenant" prometeria uma asserção que este
     * teste não faz. Os dois erros são 404, então o forasteiro não distingue os
     * casos de fora; a diferença que este teste pina é a de CLASSE, e ela é a
     * da ordem dos cortes dentro do guard.
     */
    it('answers the not-found cut, not the authorship one, to an outsider aiming at an archived note', async () => {
      const error: unknown = await useCase
        .execute(
          validInput({ actorUserId: OUTSIDER_ID, noteId: ARCHIVED_NOTE_ID }),
        )
        .catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(NoteNotFoundError);
      expect(error).not.toBeInstanceOf(NotTheAuthorError);
      expect(notes.updateCalls).toBe(0);
    });
  });

  describe('archiving', () => {
    // Regra 23
    it('sets the status to ARCHIVED and stamps archivedAt with now', async () => {
      const before = Date.now();

      const { note } = await useCase.execute(validInput());

      const after = Date.now();
      expect(note.status).toBe('ARCHIVED');
      expect(required(note.archivedAt).getTime()).toBeGreaterThanOrEqual(
        before,
      );
      expect(required(note.archivedAt).getTime()).toBeLessThanOrEqual(after);
      expect(stored().status).toBe('ARCHIVED');
      expect(required(stored().archivedAt).getTime()).toBe(
        required(note.archivedAt).getTime(),
      );
      expect(notes.updateCalls).toBe(1);
    });

    /**
     * Regra 23 — **arquivar move o `updatedAt`**, e o move para o MESMO instante
     * do `archivedAt`. → ADR 0008: o domínio é o dono de `updatedAt` (o `Note`
     * nasce sem `@updatedAt`), e `updatedAt` significa "quando esta linha mudou
     * pela última vez" — arquivar muda a linha.
     *
     * A nota semeada tem `updatedAt` em `FIXED_ISO` de propósito: duas chamadas
     * a `new Date()` no mesmo teste cairiam no mesmo milissegundo, e
     * "avançou" ficaria indecidível. E a igualdade com o `archivedAt` é o que
     * prova o instante ÚNICO — dois `new Date()` no UseCase divergiriam em
     * milissegundos e deixariam este teste não-determinístico.
     */
    it('bumps updatedAt to the very same instant as archivedAt', async () => {
      const { note } = await useCase.execute(validInput());

      expect(note.updatedAt.getTime()).toBeGreaterThan(
        new Date(FIXED_ISO).getTime(),
      );
      expect(note.updatedAt.getTime()).toBe(
        required(note.archivedAt).getTime(),
      );
      expect(stored().updatedAt.getTime()).toBe(note.updatedAt.getTime());
      expect(stored().updatedAt.getTime()).toBe(
        required(stored().archivedAt).getTime(),
      );
    });

    /**
     * Regra 24 — **não apaga conteúdo**. Arquivar é tirar da vista, não
     * destruir: o acervo do clube continua íntegro (ADR 0002), e a nota volta
     * legível inteira se um dia desarquivar existir (MVP 4).
     *
     * O `doc` é conferido contra um SNAPSHOT tirado antes do `execute`
     * (lição 2): comparar o devolvido com o gravado seria comparar a árvore com
     * ela mesma.
     */
    it('keeps the content intact', async () => {
      const snapshot = structuredClone(stored().doc);

      const { note } = await useCase.execute(validInput());

      expect(note.title).toBe('Sobre o anel');
      expect(note.reference).toBe('p. 45');
      expect(note.plainText).toBe('a ideia que não serve mais');
      expect(note.doc).toEqual(snapshot);
      expect(stored().title).toBe('Sobre o anel');
      expect(stored().reference).toBe('p. 45');
      expect(stored().plainText).toBe('a ideia que não serve mais');
      expect(stored().doc).toEqual(snapshot);
    });

    // Regra 26
    it('preserves the id and the createdAt', async () => {
      const { note } = await useCase.execute(validInput());

      expect(note.id).toBe(NOTE_ID);
      expect(note.createdAt).toEqual(new Date(FIXED_ISO));
      expect(stored().createdAt).toEqual(new Date(FIXED_ISO));
    });

    // Regra 26 — e os campos de tenant e de autoria, que nunca mudam.
    it('preserves the tenant and the authorship', async () => {
      const { note } = await useCase.execute(validInput());

      expect(note.userId).toBe(AUTHOR_ID);
      expect(note.clubId).toBe(CLUB_ID);
      expect(note.bookId).toBe('book-1');
      expect(note.kind).toBe('FREE');
    });

    /**
     * O guard é neutro quanto ao `kind` (é o `editNote` que recusa a nota do
     * dia), então a anotação do dia também se arquiva. E isso é seguro: o
     * `upsertPlanNote` REATIVA a nota do dia arquivada em vez de criar uma
     * segunda, porque o índice `unique(planItemId, userId)` não olha status.
     */
    it('archives a plan note too', async () => {
      const { note } = await useCase.execute(
        validInput({ noteId: PLAN_NOTE_ID }),
      );

      expect(note.status).toBe('ARCHIVED');
      expect(note.planItemId).toBe('plan-book-1-2026-10-01');
      expect(stored(PLAN_NOTE_ID).status).toBe('ARCHIVED');
    });
  });

  /**
   * Regra 25 — nota já arquivada é `NoteNotFoundError`, e o `archivedAt`
   * original **não é regravado**. É o precedente do `archiveBook`: o guard
   * trata a arquivada como inexistente, então não existe caminho que reescreva
   * a data em que a pessoa arquivou.
   */
  describe('a note that is already archived', () => {
    it('refuses it with NoteNotFoundError', async () => {
      await expect(
        useCase.execute(validInput({ noteId: ARCHIVED_NOTE_ID })),
      ).rejects.toBeInstanceOf(NoteNotFoundError);
    });

    it('never rewrites the original archivedAt', async () => {
      await useCase
        .execute(validInput({ noteId: ARCHIVED_NOTE_ID }))
        .catch(() => undefined);

      expect(stored(ARCHIVED_NOTE_ID).archivedAt).toEqual(
        new Date(ARCHIVED_AT_ISO),
      );
      expect(notes.updateCalls).toBe(0);
    });

    // E arquivar duas vezes seguidas pela porta da frente dá o mesmo: a segunda
    // chamada não desloca a data da primeira.
    it('keeps the archivedAt of the first call when the same note is archived twice', async () => {
      const { note } = await useCase.execute(validInput());
      const firstArchivedAt = required(note.archivedAt);

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NoteNotFoundError,
      );

      expect(required(stored().archivedAt).getTime()).toBe(
        firstArchivedAt.getTime(),
      );
      expect(notes.updateCalls).toBe(1);
    });
  });

  /**
   * Regra 28 — soft delete e nada além disso. A linha continua no acervo, com
   * autoria; hard delete não existe nesta fatia (e no MVP 1 não há tela para
   * ele).
   */
  it('never deletes the row', async () => {
    await useCase.execute(validInput());

    expect(notes.saved).toHaveLength(4);
    await expect(notes.byId(NOTE_ID)).resolves.not.toBeNull();
  });

  // Estado acidental entre chamadas seria bug de produção invisível: a Tarefa
  // 11 compõe o UseCase uma vez e o reusa por request.
  it('does not leak state between two executes of the same instance', async () => {
    const first = await useCase.execute(validInput());
    const second = await useCase.execute(
      validInput({ noteId: SECOND_NOTE_ID }),
    );

    expect(first.note.id).toBe(NOTE_ID);
    expect(first.note.title).toBe('Sobre o anel');
    expect(second.note.id).toBe(SECOND_NOTE_ID);
    expect(second.note.title).toBe('Sobre a coragem');
    expect(second.note.status).toBe('ARCHIVED');
    // A nota do dia e a que já estava arquivada não foram tocadas.
    expect(stored(PLAN_NOTE_ID).status).toBe('ACTIVE');
    expect(notes.updateCalls).toBe(2);
  });
});
