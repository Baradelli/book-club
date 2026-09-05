import { beforeEach, describe, expect, it } from 'vitest';

import { NotAMemberError } from '../../domain/errors';
import type { Note } from '../../domain/note';
import {
  aDoc,
  aMembership,
  aNote,
  required,
} from '../../test-support/builders';
import { MembershipRepositoryFake } from '../_fakes/membership-repository-fake';
import { NoteRepositoryFake } from '../_fakes/note-repository-fake';
import { AssertMembership } from '../assert-membership';
import type { ListNotesInput } from '../list-notes';
import { ListNotes } from '../list-notes';
import type { NoteFilter } from '../ports/note-repository';

const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_BOOK_ID = 'book-2';
const PLAN_ITEM_ID = 'plan-book-1-2026-10-01';
const OTHER_PLAN_ITEM_ID = 'plan-book-1-2026-10-02';
const OWNER_ID = 'user-owner';
const ADMIN_ID = 'user-admin';
const MEMBER_ID = 'user-member';
const OTHER_MEMBER_ID = 'user-other-member';

/**
 * O fake, mais a REFERÊNCIA de cada array que o `find` devolveu.
 *
 * É o único jeito de medir a regra 17 ("o array devolvido é cópia"): o fake
 * monta um array novo a cada chamada, então um `sort` in loco passaria
 * despercebido pelo resultado. Aqui o teste guarda o array do repositório e
 * confere que ele continua na ordem em que saiu.
 */
class ArrayRecordingNoteRepositoryFake extends NoteRepositoryFake {
  readonly arraysReturnedByFind: Note[][] = [];

  override async find(filter: NoteFilter): Promise<Note[]> {
    const found = await super.find(filter);
    this.arraysReturnedByFind.push(found);
    return found;
  }
}

describe('ListNotes', () => {
  let memberships: MembershipRepositoryFake;
  let notes: ArrayRecordingNoteRepositoryFake;
  let useCase: ListNotes;

  beforeEach(async () => {
    memberships = new MembershipRepositoryFake();
    notes = new ArrayRecordingNoteRepositoryFake();
    useCase = new ListNotes(new AssertMembership(memberships), notes);

    for (const [userId, role] of [
      [OWNER_ID, 'OWNER'],
      [ADMIN_ID, 'ADMIN'],
      [MEMBER_ID, 'MEMBER'],
      [OTHER_MEMBER_ID, 'MEMBER'],
    ] as const) {
      await memberships.save(aMembership({ userId, clubId: CLUB_ID, role }));
      await memberships.save(
        aMembership({ userId, clubId: OTHER_CLUB_ID, role }),
      );
    }
  });

  // Fixture como FACTORY, nunca `const` de describe (CONVENCOES-CODIGO §6.6).
  function validInput(overrides: Partial<ListNotesInput> = {}): ListNotesInput {
    return { actorUserId: MEMBER_ID, clubId: CLUB_ID, ...overrides };
  }

  function aFreeNote(overrides: Partial<Note> = {}): Note {
    return aNote({
      kind: 'FREE',
      clubId: CLUB_ID,
      bookId: BOOK_ID,
      userId: MEMBER_ID,
      doc: aDoc('o poder do anel'),
      ...overrides,
    });
  }

  function ids(found: readonly Note[]): string[] {
    return found.map((note) => note.id);
  }

  describe('permission and tenant', () => {
    // Regra 13 — 404 na borda, não 403: não confirmamos a existência do clube.
    it('rejects an actor without an active membership', async () => {
      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    // Regra 13 — sair do clube arquiva o membership, e quem saiu não lê mais o
    // acervo (→ ADR 0002, "sair arquiva o Membership").
    it('rejects an actor whose membership is archived', async () => {
      await memberships.save(
        aMembership({
          userId: MEMBER_ID,
          clubId: CLUB_ID,
          role: 'MEMBER',
          status: 'ARCHIVED',
        }),
      );

      await expect(useCase.execute(validInput())).rejects.toBeInstanceOf(
        NotAMemberError,
      );
    });

    // Regra 13 — um clube em que a pessoa não entrou é 404, exista ele ou não.
    it('rejects a club the actor is not a member of', async () => {
      await expect(
        useCase.execute(validInput({ clubId: 'club-3' })),
      ).rejects.toBeInstanceOf(NotAMemberError);
    });

    /**
     * Regra 22 — **o corte vem ANTES da consulta.**
     *
     * Sem o contador, "recusou antes de consultar" e "consultou e depois
     * recusou" dão o mesmo erro para o cliente — e a segunda ordem é a que
     * transforma um endpoint de leitura em oráculo de existência (e em custo de
     * banco) para quem não é do clube.
     */
    it('never queries the repository when the actor is not a member', async () => {
      await notes.save(aFreeNote({ id: 'note-1' }));

      await expect(
        useCase.execute(validInput({ actorUserId: 'user-outsider' })),
      ).rejects.toBeInstanceOf(NotAMemberError);

      expect(notes.findCalls).toBe(0);
    });

    /**
     * Regra 14 — **não exige papel**: o acervo é do grupo. É o ADR 0002 — o
     * filtro `Tudo · Minhas · de X` é navegação, não permissão, e um MEMBER que
     * não lesse o que o clube escreveu quebraria o incentivo mútuo.
     */
    it.each([
      ['MEMBER', MEMBER_ID],
      ['ADMIN', ADMIN_ID],
      ['OWNER', OWNER_ID],
    ])(
      'lets the %s list the notes of the club',
      async (_label, actorUserId) => {
        await notes.save(aFreeNote({ id: 'note-1' }));

        const found = await useCase.execute(validInput({ actorUserId }));

        expect(ids(found)).toEqual(['note-1']);
      },
    );

    /**
     * Regra 14 — e nenhum papel é recusado na leitura: o `MEMBER` recebe o
     * acervo, não um erro.
     *
     * O nome antigo (`never raises ForbiddenRoleError on a read`) prometia mais
     * do que provava: o valor resolvido é `Note[]` e NUNCA poderia ser um
     * `Error`, então o `resolves.not.toBeInstanceOf` não assertava nada — só o
     * `resolves` mordia. É o mesmo veredito da auditoria da Tarefa 08
     * (`upsert-plan-note.test.ts`), e agora o teste asserta o que o `resolves`
     * de fato entrega. → CONVENCOES-CODIGO §7.4.
     */
    it('hands a plain MEMBER the notes of the club instead of demanding a role', async () => {
      await notes.save(
        aFreeNote({ id: 'note-do-clube', userId: OTHER_MEMBER_ID }),
      );

      const found = await useCase.execute(
        validInput({ actorUserId: MEMBER_ID }),
      );

      expect(ids(found)).toEqual(['note-do-clube']);
    });

    /**
     * Regra 14 + ADR 0002 — a nota de OUTRA pessoa aparece, e aparece desde o
     * instante em que foi salva. Não existe conteúdo privado dentro do clube.
     */
    it('returns the notes of the other members, not only the actor own', async () => {
      await notes.save(
        aFreeNote({ id: 'note-deles', userId: OTHER_MEMBER_ID }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['note-deles']);
    });
  });

  describe('tenant cut', () => {
    // Regra 24 — o `clubId` do input É o parâmetro legítimo; o que este teste
    // prova é que o `authorId` não abre um caminho para ler outro clube.
    it('never crosses clubs through authorId, even for a legitimate actor', async () => {
      await notes.save(
        aFreeNote({ id: 'note-de-outro-clube', clubId: OTHER_CLUB_ID }),
      );
      await notes.save(aFreeNote({ id: 'note-deste-clube' }));

      const found = await useCase.execute(validInput({ authorId: MEMBER_ID }));

      expect(ids(found)).toEqual(['note-deste-clube']);
    });

    // Regra 24 — e o mesmo pelo `planItemId`, que atravessa livro e clube com a
    // mesma facilidade se o `clubId` deixar de ir no filtro.
    it('never crosses clubs through planItemId', async () => {
      await notes.save(
        aFreeNote({
          id: 'note-de-outro-clube',
          clubId: OTHER_CLUB_ID,
          kind: 'PLAN',
          planItemId: PLAN_ITEM_ID,
        }),
      );

      const found = await useCase.execute(
        validInput({ planItemId: PLAN_ITEM_ID }),
      );

      expect(found).toEqual([]);
    });

    // Regra 18 — livro de outro clube dá lista VAZIA, não erro: o AND por
    // `clubId` já corta, e um 404 aqui só diria "esse livro existe em outro
    // lugar".
    it('returns an empty list for a book of another club, instead of raising', async () => {
      await notes.save(
        aFreeNote({
          id: 'note-de-outro-clube',
          clubId: OTHER_CLUB_ID,
          bookId: OTHER_BOOK_ID,
        }),
      );

      await expect(
        useCase.execute(validInput({ bookId: OTHER_BOOK_ID })),
      ).resolves.toEqual([]);
    });
  });

  describe('archived notes', () => {
    // Regra 15 — arquivada é invisível: não há tela de arquivadas no MVP 1.
    it('never returns an archived note', async () => {
      await notes.save(
        aFreeNote({
          id: 'note-arquivada',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      await notes.save(aFreeNote({ id: 'note-ativa' }));

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['note-ativa']);
    });

    // Regra 15 — o mecanismo: o UseCase manda `status: 'ACTIVE'` no filtro. Sem
    // esta asserção, o teste de cima também passaria com um UseCase que
    // filtrasse em memória DEPOIS de carregar tudo — que é o mesmo bug com uma
    // fatura de banco maior.
    it('asks the repository for the ACTIVE ones, instead of filtering afterwards', async () => {
      await useCase.execute(validInput());

      expect(notes.findFilters).toStrictEqual([
        { clubId: CLUB_ID, status: 'ACTIVE' },
      ]);
    });

    // Regra 15 — e não há como pedir as arquivadas: a flag não existe (decisão
    // C da spec — flag sem chamador é especulação).
    it('returns an empty list when every note of the club is archived', async () => {
      await notes.save(
        aFreeNote({
          id: 'note-arquivada',
          status: 'ARCHIVED',
          archivedAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );

      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });
  });

  describe('order', () => {
    /**
     * Regra 16 — `createdAt` **decrescente**: a anotação mais recente do clube
     * primeiro. (Decisão B da spec: não é `updatedAt`, porque a nota do dia é
     * reescrita a cada autosave e a lista pularia embaixo do dedo de quem
     * digita.)
     *
     * A ordem de inserção é embaralhada de propósito, e a pré-condição do fake
     * — que enumera INVERTIDO — é afirmada: sem ela este teste não distinguiria
     * "o UseCase ordenou" de "os fixtures já vinham na ordem certa", que é
     * exatamente o falso verde que a Tarefa 07 descobriu.
     */
    it('orders by createdAt descending, against a repository that enumerates reversed', async () => {
      await notes.save(
        aFreeNote({
          id: 'aa-do-meio',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
        }),
      );
      await notes.save(
        aFreeNote({
          id: 'zz-mais-nova',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        }),
      );
      await notes.save(
        aFreeNote({
          id: 'mm-mais-antiga',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      // Pré-condição: nem a ordem do repositório, nem a de id, nem a inversa de
      // id coincidem com a esperada.
      expect(ids(await notes.find({ clubId: CLUB_ID }))).toEqual([
        'mm-mais-antiga',
        'zz-mais-nova',
        'aa-do-meio',
      ]);

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual([
        'zz-mais-nova',
        'aa-do-meio',
        'mm-mais-antiga',
      ]);
    });

    /**
     * Regra 16 — o desempate por `id`, que é o que torna a ordem
     * DETERMINÍSTICA. Duas notas com o mesmo `createdAt` é o caso real do
     * autosave de duas pessoas no mesmo segundo, e aí a ordem não pode depender
     * de como o repositório enumerou.
     *
     * A inserção é `a-primeiro` e depois `b-segundo`: o fake devolve
     * `[b, a]`, então um `sort` estável SEM desempate manteria `b` na frente e
     * este teste falharia.
     */
    it('breaks a createdAt tie by id, so the order never depends on the repository', async () => {
      const createdAt = new Date('2026-02-01T00:00:00.000Z');
      await notes.save(aFreeNote({ id: 'a-primeiro', createdAt }));
      await notes.save(aFreeNote({ id: 'b-segundo', createdAt }));

      expect(ids(await notes.find({ clubId: CLUB_ID }))).toEqual([
        'b-segundo',
        'a-primeiro',
      ]);

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['a-primeiro', 'b-segundo']);
    });

    /**
     * Regra 17 — o array devolvido é **cópia**: ordenar não muta o array do
     * repositório. O array é do repositório, e mutá-lo é smell de fronteira —
     * vira hábito e um dia o repositório o guarda em cache.
     */
    it('sorts a copy, never the array the repository returned', async () => {
      // A ordem de inserção é a que faz o array do repositório sair
      // DIFERENTE da ordem devolvida — sem isso, um `sort` in loco deixaria o
      // array na ordem esperada e a asserção de baixo seria vazia.
      await notes.save(
        aFreeNote({
          id: 'nota-nova',
          createdAt: new Date('2026-03-01T00:00:00.000Z'),
        }),
      );
      await notes.save(
        aFreeNote({
          id: 'nota-antiga',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );

      const found = await useCase.execute(validInput());

      expect(ids(found)).toEqual(['nota-nova', 'nota-antiga']);
      expect(notes.arraysReturnedByFind).toHaveLength(1);
      // O array que saiu do repositório continua na ordem em que saiu — a
      // inversa da inserção, que aqui é o OPOSTO da ordenada.
      expect(ids(required(notes.arraysReturnedByFind[0]))).toEqual([
        'nota-antiga',
        'nota-nova',
      ]);
    });
  });

  describe('filters', () => {
    // Regra 19
    it('returns an empty list for an author who wrote nothing', async () => {
      await notes.save(aFreeNote({ id: 'note-1', userId: OTHER_MEMBER_ID }));

      await expect(
        useCase.execute(validInput({ authorId: MEMBER_ID })),
      ).resolves.toEqual([]);
    });

    it('returns an empty list for a club with no notes', async () => {
      await expect(useCase.execute(validInput())).resolves.toEqual([]);
    });

    // Regra 19 — e o filtro "de X" de fato seleciona, senão o teste de cima
    // passaria com um UseCase que devolvesse sempre vazio.
    it('returns only the notes of the author asked for', async () => {
      await notes.save(
        aFreeNote({ id: 'note-deles', userId: OTHER_MEMBER_ID }),
      );
      await notes.save(aFreeNote({ id: 'note-minha', userId: MEMBER_ID }));

      const found = await useCase.execute(validInput({ authorId: MEMBER_ID }));

      expect(ids(found)).toEqual(['note-minha']);
    });

    /**
     * Regra 21 — os filtros chegam ao repositório como **um** `NoteFilter` só,
     * com o `status: 'ACTIVE'` que o UseCase acrescenta. Uma consulta por
     * filtro seria N idas ao banco por request, e uma interseção em memória
     * carregaria o acervo inteiro para descartá-lo.
     */
    it('passes every filter to the repository in a single NoteFilter', async () => {
      await useCase.execute(
        validInput({
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          kind: 'PLAN',
          planItemId: PLAN_ITEM_ID,
          text: 'poder',
        }),
      );

      expect(notes.findCalls).toBe(1);
      expect(notes.findFilters).toStrictEqual([
        {
          clubId: CLUB_ID,
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          kind: 'PLAN',
          planItemId: PLAN_ITEM_ID,
          text: 'poder',
          status: 'ACTIVE',
        },
      ]);
    });

    // Regra 21 — e o resultado é a interseção de verdade: cada nota abaixo erra
    // em UM filtro só, então cada filtro que deixasse de ir traria uma nota a
    // mais.
    it('combines the filters with AND', async () => {
      await notes.save(aFreeNote({ id: 'wrong-club', clubId: OTHER_CLUB_ID }));
      await notes.save(aFreeNote({ id: 'wrong-book', bookId: OTHER_BOOK_ID }));
      await notes.save(
        aFreeNote({ id: 'wrong-author', userId: OTHER_MEMBER_ID }),
      );
      await notes.save(
        aFreeNote({ id: 'wrong-kind', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );
      await notes.save(
        aFreeNote({ id: 'wrong-text', doc: aDoc('nada a ver') }),
      );
      await notes.save(aFreeNote({ id: 'the-one' }));

      const found = await useCase.execute(
        validInput({
          bookId: BOOK_ID,
          authorId: MEMBER_ID,
          kind: 'FREE',
          text: 'poder',
        }),
      );

      expect(ids(found)).toEqual(['the-one']);
    });

    // Regra 21 — o filtro por dia de leitura, isolado: é o que a tela do livro
    // usa para mostrar o que o clube escreveu naquele dia.
    it('returns only the notes of the plan item asked for', async () => {
      await notes.save(
        aFreeNote({
          id: 'day-2',
          kind: 'PLAN',
          planItemId: OTHER_PLAN_ITEM_ID,
        }),
      );
      await notes.save(
        aFreeNote({ id: 'day-1', kind: 'PLAN', planItemId: PLAN_ITEM_ID }),
      );

      const found = await useCase.execute(
        validInput({ planItemId: PLAN_ITEM_ID }),
      );

      expect(ids(found)).toEqual(['day-1']);
    });

    // Regra 21 — e o `bookId`, que é o corte da estante.
    it('returns only the notes of the book asked for', async () => {
      await notes.save(aFreeNote({ id: 'outro-livro', bookId: OTHER_BOOK_ID }));
      await notes.save(aFreeNote({ id: 'este-livro' }));

      const found = await useCase.execute(validInput({ bookId: BOOK_ID }));

      expect(ids(found)).toEqual(['este-livro']);
    });

    /**
     * Regra 20 — `text` vazio ou só espaços é **ignorado**, e a normalização é
     * do UseCase (o mesmo `optionalText` do livro e do item do plano). Passar
     * `'   '` adiante filtraria por três espaços e devolveria vazio: um campo
     * de busca em que apertar espaço esconde o acervo.
     */
    it.each([
      ['empty', ''],
      ['blank', '   '],
      ['tab', '\t\n'],
    ])('ignores a %s text instead of filtering by it', async (_label, text) => {
      await notes.save(aFreeNote({ id: 'note-1' }));

      const found = await useCase.execute(validInput({ text }));

      expect(ids(found)).toEqual(['note-1']);
      expect(notes.findFilters).toStrictEqual([
        { clubId: CLUB_ID, status: 'ACTIVE' },
      ]);
    });

    // Regra 20 — e o texto de verdade chega SEM as pontas: quem digita num
    // campo de busca deixa espaço, e `' poder '` não acha nada no `ILIKE`.
    it('trims the text before handing it to the repository', async () => {
      await notes.save(aFreeNote({ id: 'note-1' }));

      const found = await useCase.execute(validInput({ text: '  poder  ' }));

      expect(ids(found)).toEqual(['note-1']);
      expect(notes.findFilters).toStrictEqual([
        { clubId: CLUB_ID, text: 'poder', status: 'ACTIVE' },
      ]);
    });
  });

  /**
   * Estado acidental entre chamadas seria bug de produção invisível: a Tarefa 11
   * compõe o UseCase uma vez e reusa por request. Aqui o vazamento mais
   * perigoso é o acervo de um clube aparecendo no outro.
   */
  it('does not leak state between two executes of the same instance', async () => {
    await notes.save(aFreeNote({ id: 'note-deste-clube' }));
    await notes.save(
      aFreeNote({ id: 'note-do-outro-clube', clubId: OTHER_CLUB_ID }),
    );

    const first = await useCase.execute(validInput());
    const second = await useCase.execute(
      validInput({ clubId: OTHER_CLUB_ID, text: 'poder' }),
    );
    const third = await useCase.execute(validInput());

    expect(ids(first)).toEqual(['note-deste-clube']);
    expect(ids(second)).toEqual(['note-do-outro-clube']);
    // A terceira chamada repete a primeira: um filtro que tivesse ficado
    // "grudado" na instância mudaria o resultado dela.
    expect(ids(third)).toEqual(['note-deste-clube']);
  });
});
