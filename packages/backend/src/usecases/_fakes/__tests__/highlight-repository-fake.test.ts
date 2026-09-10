import { beforeEach, describe, expect, it } from 'vitest';

import type { Highlight } from '../../../domain/highlight';
import { aDoc, aHighlight, required } from '../../../test-support/builders';
import type { HighlightPatch } from '../../ports/highlight-repository';
import { HighlightRepositoryFake } from '../highlight-repository-fake';

const CREATED_ISO = '2026-01-01T00:00:00.000Z';
const ARCHIVED_ISO = '2026-02-01T00:00:00.000Z';
const AUTHOR_ID = 'user-maria';
const OTHER_AUTHOR_ID = 'user-marcos';
const CLUB_ID = 'club-1';
const OTHER_CLUB_ID = 'club-2';
const BOOK_ID = 'book-1';
const OTHER_BOOK_ID = 'book-2';
const YELLOW = '#facc15';
const GREEN = '#22c55e';
const PAGE = 45;
const OTHER_PAGE = 46;

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error(`expected an Error, got ${typeof error}`);
  }
  throw new Error('expected the promise to reject, but it resolved');
}

/**
 * Regra 21 — o fake do grifo tem suíte própria, como os dez fakes anteriores.
 *
 * O port tem `save` · `byId` · `update` (Tarefa 22) e o `find` (Tarefa 23, que
 * chegou junto do `listHighlights` que o usa). `delete` não existe — hard delete
 * não está no escopo. Método de port sem chamador é especulação.
 */
describe('HighlightRepositoryFake', () => {
  let highlights: HighlightRepositoryFake;

  beforeEach(() => {
    highlights = new HighlightRepositoryFake();
  });

  describe('save is an upsert by id', () => {
    it('returns the highlight it stored', async () => {
      const highlight = aHighlight({ userId: AUTHOR_ID });

      const returned = await highlights.save(highlight);

      expect(returned).toEqual(highlight);
      expect(highlights.saved).toEqual([highlight]);
    });

    it('overwrites the same id in place instead of adding a second row', async () => {
      const first = aHighlight({ id: 'highlight-a', quote: 'a coragem' });
      await highlights.save(first);

      await highlights.save({ ...first, quote: 'a coragem de continuar' });

      expect(highlights.saved).toHaveLength(1);
      expect(required(highlights.saved[0]).quote).toBe(
        'a coragem de continuar',
      );
    });

    it('keeps two highlights with different ids', async () => {
      await highlights.save(aHighlight({ id: 'highlight-a' }));
      await highlights.save(aHighlight({ id: 'highlight-b' }));

      expect(highlights.saved).toHaveLength(2);
    });

    /**
     * ⚠️ **NÃO HÁ ÍNDICE ÚNICO NENHUM AQUI, e é a metade em que um fake
     * "cuidadoso" erraria** — a direção restritiva do §7.1, que esconde melhor
     * porque a suíte fica verde.
     *
     * O grifo é **ilimitado** (regra 11): não há chave natural, e o
     * `schema.prisma` da Tarefa 24 não declara `@@unique` nenhum — os índices
     * do ADR 0004 são `@@index([bookId, color])` e `@@index([bookId, userId])`,
     * que não são únicos. Um fake que recusasse o segundo grifo idêntico
     * reprovaria o caso legítimo (grifei duas vezes o mesmo trecho, com cores
     * diferentes, em releituras diferentes) e o teste do "ilimitado" nasceria
     * provando o comportamento errado.
     */
    it('keeps two identical highlights of the same author in the same book', async () => {
      const shared = {
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        quote: 'a coragem de continuar',
        page: 45,
      } as const;

      await highlights.save(aHighlight({ id: 'highlight-a', ...shared }));
      await highlights.save(aHighlight({ id: 'highlight-b', ...shared }));
      await highlights.save(aHighlight({ id: 'highlight-c', ...shared }));

      expect(highlights.saved).toHaveLength(3);
    });

    // Mesmo padrão do `saveCalls` do `NoteRepositoryFake` e do `compareCalls` do
    // `PasswordHasherFake` (CONVENCOES-CODIGO §6.4 e §7.3): é o que deixa os
    // testes de caminho de erro dos UseCases afirmarem "nada foi escrito" — e o
    // lado POSITIVO, sem o qual um incremento apagado deixa todo `toBe(0)`
    // passar por acidente.
    it('counts every save call', async () => {
      expect(highlights.saveCalls).toBe(0);

      await highlights.save(aHighlight({ id: 'highlight-a' }));
      await highlights.save(aHighlight({ id: 'highlight-b' }));

      expect(highlights.saveCalls).toBe(2);
    });
  });

  describe('byId', () => {
    it('returns the highlight of that id', async () => {
      const highlight = aHighlight({ id: 'highlight-x' });
      await highlights.save(highlight);

      await expect(highlights.byId('highlight-x')).resolves.toEqual(highlight);
    });

    it('returns null for an id that was never saved', async () => {
      await highlights.save(aHighlight({ id: 'highlight-x' }));

      await expect(highlights.byId('highlight-fantasma')).resolves.toBeNull();
    });

    /**
     * ⚠️ A ARQUIVADA TAMBÉM, como o port manda. Esconder aqui faria o
     * `archiveHighlight` de um grifo já arquivado cair no ramo "inexistente" por
     * acidente e não por decisão — e o `highlightForAuthor` perderia a chance de
     * tratar os dois casos igual DE PROPÓSITO (regra 19).
     */
    it('returns the highlight even when it is archived', async () => {
      const archived = aHighlight({
        id: 'highlight-x',
        status: 'ARCHIVED',
        archivedAt: new Date(ARCHIVED_ISO),
      });
      await highlights.save(archived);

      const found = await highlights.byId('highlight-x');

      expect(found).toEqual(archived);
      expect(found?.status).toBe('ARCHIVED');
    });

    it('does not let the caller corrupt the store through the highlight it read', async () => {
      await highlights.save(
        aHighlight({ id: 'highlight-x', commentDoc: aDoc('um') }),
      );

      const first = required(await highlights.byId('highlight-x'));
      first.quote = 'adulterado';
      const paragraph = first.commentDoc?.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      const second = required(await highlights.byId('highlight-x'));
      expect(second.quote).not.toBe('adulterado');
      expect(JSON.stringify(second.commentDoc)).not.toContain('adulterado');
    });
  });

  describe('update', () => {
    // A semântica do Prisma: só as chaves presentes mexem.
    it('applies only the keys present in the patch', async () => {
      const highlight = aHighlight({
        id: 'highlight-x',
        quote: 'a coragem',
        page: 45,
        reference: 'cap. 3',
      });
      await highlights.save(highlight);

      const updated = await highlights.update('highlight-x', {
        quote: 'a coragem de continuar',
      });

      expect(updated.quote).toBe('a coragem de continuar');
      expect(updated.page).toBe(45);
      expect(updated.reference).toBe('cap. 3');
      expect(updated.commentText).toBe(highlight.commentText);
      expect(required(highlights.saved[0]).quote).toBe(
        'a coragem de continuar',
      );
    });

    // `undefined` é "não mexe", NÃO "apague".
    it('treats an undefined value in the patch as "do not touch"', async () => {
      await highlights.save(
        aHighlight({ id: 'highlight-x', page: 45, reference: 'cap. 3' }),
      );

      const updated = await highlights.update('highlight-x', {
        page: undefined,
        reference: undefined,
      });

      expect(updated.page).toBe(45);
      expect(updated.reference).toBe('cap. 3');
    });

    /**
     * E `null` GRAVA nulo, que é como o `editHighlight` limpa a página, a
     * referência e o comentário (regra 14).
     *
     * Os quatro campos anuláveis num patch só, e as quatro asserções escritas à
     * mão em vez de uma tabela: o campo é o SUJEITO de cada asserção, e uma
     * tabela indexada por nome de campo exigiria um cast (`as keyof`) que
     * desligaria justamente a checagem que interessa.
     */
    it('writes null when the patch says null', async () => {
      await highlights.save(
        aHighlight({
          id: 'highlight-x',
          page: 45,
          reference: 'cap. 3',
          commentDoc: aDoc('um comentário'),
          status: 'ARCHIVED',
          archivedAt: new Date(ARCHIVED_ISO),
        }),
      );

      const updated = await highlights.update('highlight-x', {
        page: null,
        reference: null,
        commentDoc: null,
        archivedAt: null,
      });

      expect(updated.page).toBeNull();
      expect(updated.reference).toBeNull();
      expect(updated.commentDoc).toBeNull();
      expect(updated.archivedAt).toBeNull();

      const row = required(highlights.saved[0]);
      expect(row.page).toBeNull();
      expect(row.reference).toBeNull();
      expect(row.commentDoc).toBeNull();
      expect(row.archivedAt).toBeNull();
    });

    /**
     * ⚠️ O buraco que o TIPO SOZINHO não fecha — e é por isso que o `update`
     * copia campo a campo em vez de espalhar o patch. → §7.1.1.
     *
     * A checagem de propriedade em excesso do TypeScript só vale para **objeto
     * literal fresco**: `update(id, { userId })` é recusado (o teste abaixo
     * prova os 5 casos), mas um patch montado por **variável** atravessa sem o
     * compilador dizer nada — e um `{ ...existing, ...patch }` obedeceria,
     * enquanto o `toUpdateData` do Prisma (Tarefa 24) ignoraria em silêncio.
     * Seria a divergência do §7.1 de volta, na direção que a suíte não vê.
     */
    it('never changes the authorship, even for a patch the compiler cannot check', async () => {
      await highlights.save(
        aHighlight({
          id: 'highlight-x',
          userId: AUTHOR_ID,
          quote: 'a coragem',
        }),
      );

      // Variável, não literal: é o que desliga a checagem de excesso.
      const loose = {
        quote: 'a coragem de continuar',
        userId: OTHER_AUTHOR_ID,
      };

      const updated = await highlights.update('highlight-x', loose);

      // O campo patcheável mudou...
      expect(updated.quote).toBe('a coragem de continuar');
      // ...e a AUTORIA não, nem no que voltou nem no que ficou no store.
      expect(updated.userId).toBe(AUTHOR_ID);
      expect(required(highlights.saved[0]).userId).toBe(AUTHOR_ID);
    });

    // E o mesmo, para tenant e identidade: um patch por variável não move o
    // grifo de clube, de livro nem reescreve quando ele nasceu.
    it('never moves the highlight or rewrites its birth, even by variable', async () => {
      await highlights.save(
        aHighlight({
          id: 'highlight-x',
          clubId: CLUB_ID,
          bookId: BOOK_ID,
          quote: 'a coragem',
        }),
      );

      const loose = {
        quote: 'a coragem de continuar',
        id: 'highlight-inventado',
        clubId: OTHER_CLUB_ID,
        bookId: OTHER_BOOK_ID,
        createdAt: new Date('1999-01-01T00:00:00.000Z'),
      };

      const updated = await highlights.update('highlight-x', loose);

      expect(updated.quote).toBe('a coragem de continuar');
      expect(updated.id).toBe('highlight-x');
      expect(updated.clubId).toBe(CLUB_ID);
      expect(updated.bookId).toBe(BOOK_ID);
      expect(updated.createdAt).toEqual(new Date(CREATED_ISO));
      // E não nasceu uma linha nova com o id contrabandeado.
      expect(highlights.saved).toHaveLength(1);
      await expect(highlights.byId('highlight-inventado')).resolves.toBeNull();
    });

    /**
     * ⚠️ O assunto deste teste é o COMPILADOR, e a asserção que morde é o
     * `@ts-expect-error` — `pnpm -r typecheck` falha se qualquer uma daquelas
     * linhas passar a compilar.
     *
     * O `HighlightPatch` nasce estreito por decisão registrada: o §7.1.1 do
     * CONVENCOES-CODIGO diz, com esta fatia pelo nome, que "quem escrever o port
     * de `Highlight` (Tarefa 22) já nasce com o tipo estreito". `Partial<Highlight>`
     * prometeria o que o repositório Prisma não vai cumprir.
     */
    it('refuses, at compile time, a patch that would move the highlight or change its author', () => {
      // @ts-expect-error `id` não é patcheável: trocaria a chave primária.
      const changeId: HighlightPatch = { id: 'highlight-outro' };
      // @ts-expect-error `userId` não é patcheável: autoria não se transfere.
      const changeAuthor: HighlightPatch = { userId: OTHER_AUTHOR_ID };
      // @ts-expect-error `clubId` não é patcheável: conteúdo não muda de clube.
      const changeClub: HighlightPatch = { clubId: OTHER_CLUB_ID };
      // @ts-expect-error `bookId` não é patcheável, pelo mesmo motivo.
      const changeBook: HighlightPatch = { bookId: OTHER_BOOK_ID };
      // @ts-expect-error `createdAt` não é patcheável: nascer é uma vez só.
      const rewriteBirth: HighlightPatch = { createdAt: new Date(CREATED_ISO) };

      // Formalidade de runtime — o veredito acima é do tsc.
      expect([
        changeId,
        changeAuthor,
        changeClub,
        changeBook,
        rewriteBirth,
      ]).toHaveLength(5);
    });

    /**
     * ⚠️ E o outro lado do tipo estreito: a `color` **é** patcheável, porque
     * corrigir a cor da caneta é a edição mais provável de um grifo. Sem este
     * teste, um `HighlightPatch` que a esquecesse passaria em tudo acima.
     */
    it('patches the colour, which is the correction a highlight most often gets', async () => {
      await highlights.save(
        aHighlight({ id: 'highlight-x', color: '#facc15' }),
      );

      const updated = await highlights.update('highlight-x', {
        color: '#22c55e',
      });

      expect(updated.color).toBe('#22c55e');
      expect(required(highlights.saved[0]).color).toBe('#22c55e');
    });

    // Contrato do fake, não regra de domínio: quem cair aqui atualizou uma linha
    // que não existe, e isso é bug de código.
    it('signals an unknown id with a raw Error, never a domain error', async () => {
      const error = await caught(
        highlights.update('highlight-fantasma', { quote: 'x' }),
      );

      expect(error.name).toBe('Error');
      expect(error.message).toMatch(/never saved/);
    });

    /**
     * Mesmo padrão do `saveCalls`: sem contador, um `saved` inalterado não
     * distingue "não chamou o repo" de "chamou e o patch não mudou nada" — e é
     * essa a diferença que a regra 15 do `editHighlight` afirma (patch vazio não
     * custa um `UPDATE`).
     */
    it('counts every update call, including the one it refused', async () => {
      expect(highlights.updateCalls).toBe(0);

      await highlights.save(aHighlight({ id: 'highlight-a' }));

      await highlights.update('highlight-a', { quote: 'outra coisa' });
      await expect(
        highlights.update('highlight-fantasma', { quote: 'x' }),
      ).rejects.toThrow(/never saved/);

      expect(highlights.updateCalls).toBe(2);
    });

    it('does not let the caller corrupt the store through a Date in the patch', async () => {
      await highlights.save(aHighlight({ id: 'highlight-x' }));
      const updatedAt = new Date('2026-03-01T00:00:00.000Z');

      await highlights.update('highlight-x', { updatedAt });
      updatedAt.setFullYear(1999);

      expect(required(highlights.saved[0]).updatedAt).toEqual(
        new Date('2026-03-01T00:00:00.000Z'),
      );
    });

    it('does not let the caller corrupt the stored commentDoc through the tree in the patch', async () => {
      await highlights.save(aHighlight({ id: 'highlight-x' }));
      const commentDoc = aDoc('original');

      await highlights.update('highlight-x', { commentDoc });
      const paragraph = commentDoc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      expect(
        JSON.stringify(required(highlights.saved[0]).commentDoc),
      ).toContain('original');
      expect(
        JSON.stringify(required(highlights.saved[0]).commentDoc),
      ).not.toContain('adulterado');
    });
  });

  // Clona nos dois sentidos, como os outros fakes: nem o chamador contamina o
  // store, nem o store devolve referência sua. O Prisma devolve `Date` nova e
  // JSON reparseado a cada leitura.
  describe('fidelity of what crosses the boundary', () => {
    it('does not let the caller corrupt the store through a Date it saved', async () => {
      const createdAt = new Date(CREATED_ISO);
      await highlights.save(aHighlight({ createdAt }));

      createdAt.setFullYear(1999);

      expect(required(highlights.saved[0]).createdAt).toEqual(
        new Date(CREATED_ISO),
      );
    });

    it('does not let the caller corrupt the store through the highlight it got back', async () => {
      const returned = await highlights.save(aHighlight());

      returned.updatedAt.setFullYear(1999);

      expect(required(highlights.saved[0]).updatedAt).toEqual(
        new Date(CREATED_ISO),
      );
    });

    it('keeps a null archivedAt null instead of turning it into the epoch', async () => {
      await highlights.save(aHighlight({ archivedAt: null }));

      expect(required(highlights.saved[0]).archivedAt).toBeNull();
    });

    it('clones the archivedAt of an archived highlight', async () => {
      const archivedAt = new Date(ARCHIVED_ISO);
      await highlights.save(aHighlight({ status: 'ARCHIVED', archivedAt }));

      archivedAt.setFullYear(1999);

      expect(required(highlights.saved[0]).archivedAt).toEqual(
        new Date(ARCHIVED_ISO),
      );
    });

    // O `commentDoc` é uma árvore, e é o único campo mutável por dentro. Sem
    // clone profundo, um UseCase que reusasse o objeto do input mexeria no que
    // já está "no banco" — algo que o Prisma nunca deixaria acontecer.
    it('does not let the caller corrupt the stored commentDoc through the tree it saved', async () => {
      const commentDoc = aDoc('original');
      await highlights.save(aHighlight({ commentDoc }));

      const paragraph = commentDoc.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      expect(required(highlights.saved[0]).commentText).toBe('original');
      expect(
        JSON.stringify(required(highlights.saved[0]).commentDoc),
      ).toContain('original');
      expect(
        JSON.stringify(required(highlights.saved[0]).commentDoc),
      ).not.toContain('adulterado');
    });

    // ⚠️ `structuredClone(null)` é `null`, mas um clone que assumisse árvore
    // sempre presente (`{ ...doc }`) transformaria o `null` num `{}` — e um
    // grifo sem comentário passaria a ter um doc vazio no lugar de nada.
    it('keeps a null commentDoc null instead of turning it into an empty object', async () => {
      await highlights.save(aHighlight({ commentDoc: null }));

      expect(required(highlights.saved[0]).commentDoc).toBeNull();
      expect(required(highlights.saved[0]).commentText).toBe('');
    });

    it('returns a different Date instance on every read', async () => {
      await highlights.save(aHighlight());

      const first = required(highlights.saved[0]);
      const second = required(highlights.saved[0]);

      expect(first.createdAt).not.toBe(second.createdAt);
      expect(first.createdAt).toEqual(second.createdAt);
    });
  });

  /**
   * Tarefa 23 — o `find` do acervo de grifos do clube.
   *
   * O `clubId` é obrigatório porque é o corte de tenant, e todo filtro entra em
   * **AND** com ele. O port **não promete ordem**: quem ordena é o
   * `listHighlights`, porque ordem é regra de produto, não de persistência.
   */
  describe('find', () => {
    // Fixture como FACTORY, nunca `const` de describe (§7.7): um objeto
    // compartilhado entre testes é estado escondido, e o `commentDoc` é uma
    // árvore mutável por dentro.
    function aClubHighlight(overrides: Partial<Highlight> = {}): Highlight {
      return aHighlight({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        userId: AUTHOR_ID,
        color: YELLOW,
        page: PAGE,
        ...overrides,
      });
    }

    function anArchivedClubHighlight(
      overrides: Partial<Highlight> = {},
    ): Highlight {
      return aClubHighlight({
        status: 'ARCHIVED',
        archivedAt: new Date(ARCHIVED_ISO),
        ...overrides,
      });
    }

    function ids(found: readonly Highlight[]): string[] {
      return found.map((highlight) => highlight.id);
    }

    /**
     * O `clubId` é **sempre** AND.
     *
     * O grifo gêmeo do outro clube casa TODOS os outros filtros de propósito: é
     * o que faz este teste falhar se o corte de tenant deixar de ser aplicado
     * (ou se algum filtro passar a substituí-lo em vez de somar-se a ele).
     */
    it('never returns a highlight of another club, even when every other filter matches', async () => {
      await highlights.save(
        aClubHighlight({ id: 'theirs', clubId: OTHER_CLUB_ID }),
      );
      await highlights.save(aClubHighlight({ id: 'mine' }));

      const found = await highlights.find({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        authorId: AUTHOR_ID,
        color: YELLOW,
        page: PAGE,
      });

      expect(ids(found)).toEqual(['mine']);
    });

    it('filters by bookId', async () => {
      await highlights.save(
        aClubHighlight({ id: 'other-book', bookId: OTHER_BOOK_ID }),
      );
      await highlights.save(aClubHighlight({ id: 'this-book' }));

      const found = await highlights.find({ clubId: CLUB_ID, bookId: BOOK_ID });

      expect(ids(found)).toEqual(['this-book']);
    });

    // O `authorId` do filtro é o `userId` do grifo: o AUTOR. É o "de \<pessoa\>"
    // do filtro de navegação — nunca uma permissão (ADR 0002).
    it('filters by authorId', async () => {
      await highlights.save(
        aClubHighlight({ id: 'theirs', userId: OTHER_AUTHOR_ID }),
      );
      await highlights.save(aClubHighlight({ id: 'mine' }));

      const found = await highlights.find({
        clubId: CLUB_ID,
        authorId: AUTHOR_ID,
      });

      expect(ids(found)).toEqual(['mine']);
    });

    // Nos dois sentidos, senão um `find` que ignorasse a `color` passaria na
    // metade dos casos.
    it.each([
      [YELLOW, 'amarelo'],
      [GREEN, 'verde'],
    ] as const)('filters by the exact colour %s', async (color, expected) => {
      await highlights.save(aClubHighlight({ id: 'amarelo', color: YELLOW }));
      await highlights.save(aClubHighlight({ id: 'verde', color: GREEN }));

      const found = await highlights.find({ clubId: CLUB_ID, color });

      expect(ids(found)).toEqual([expected]);
    });

    // Igualdade exata, não faixa (decisão C): a faixa é aditiva e ninguém pediu.
    it('filters by the exact page', async () => {
      await highlights.save(
        aClubHighlight({ id: 'pagina-46', page: OTHER_PAGE }),
      );
      await highlights.save(aClubHighlight({ id: 'pagina-45', page: PAGE }));

      const found = await highlights.find({ clubId: CLUB_ID, page: PAGE });

      expect(ids(found)).toEqual(['pagina-45']);
    });

    /**
     * ⚠️ **`page` CONTRA COLUNA NULA** — a 4ª aparição da classe do §7.1, e a
     * metade em que um fake "cuidadoso" erraria.
     *
     * No Postgres `WHERE "page" = 45` contra uma coluna nula é **falso** —
     * `NULL` não é igual a nada, nem a `45` —, então o grifo **sem página** fica
     * fora de todo filtro por página. `page` é o único campo filtrável que pode
     * ser nulo, e um fake que tratasse "coluna nula" como "casa qualquer filtro"
     * seria infiel na direção PERMISSIVA: o teste passaria verde e a tela da
     * página 45 mostraria o grifo que não é dela.
     *
     * **Fidelidade afirmada em comentário e não em teste é fidelidade que o
     * próximo refactor apaga** — é por isso que este teste existe.
     */
    it('never matches a highlight with no page when the filter asks for one, just like WHERE "page" = 45', async () => {
      await highlights.save(aClubHighlight({ id: 'sem-pagina', page: null }));
      await highlights.save(aClubHighlight({ id: 'com-pagina', page: PAGE }));

      const found = await highlights.find({ clubId: CLUB_ID, page: PAGE });

      expect(ids(found)).toEqual(['com-pagina']);
    });

    // E o outro lado da mesma moeda: sem filtro de página, o grifo sem página
    // aparece. Sem este teste, um fake que descartasse toda linha de página nula
    // passaria no de cima por acidente.
    it('returns a highlight with no page when the filter asks for no page', async () => {
      await highlights.save(aClubHighlight({ id: 'sem-pagina', page: null }));

      const found = await highlights.find({ clubId: CLUB_ID });

      expect(ids(found)).toEqual(['sem-pagina']);
    });

    /**
     * ⚠️ **REGRA 2 DA TAREFA 29 — o `text` casa `quote` OU `commentText`, e os
     * QUATRO casos estão aqui.**
     *
     * A decisão fechada do MVP 2 nomeia os campos **derivados** de cada
     * entidade e **não** menciona o `quote` — mas o `quote` é o **conteúdo** do
     * grifo (o ADR 0004 o chama de "o trecho grifado"; o comentário é o que a
     * pessoa achou dele), e uma busca que o ignore não acha *a frase que a
     * pessoa grifou*, que é o caso de uso inteiro ("qual era aquela frase do
     * capítulo 3?"). É a **decisão A** da Tarefa 29, e está **registrada como
     * pergunta do dono** na spec da Tarefa 29: se ele discordar, é uma coluna
     * a remover na chamada do `matchesText`.
     *
     * Os quatro casos existem porque cada um mata um mutante diferente:
     * "só o `quote`" (o mais provável, porque é a coluna que a decisão fechada
     * não nomeia), "só o `commentText`" (o desenho literal da decisão fechada),
     * "nos dois" (que sozinho não distingue nada) e "em nenhum" — sem o último,
     * um `find` que devolvesse tudo passaria nos três primeiros.
     */
    describe('the text filter (task 29, rules 1 to 3)', () => {
      /** O termo mora SÓ no trecho grifado. */
      const IN_QUOTE = 'esmeralda';
      /** O termo mora SÓ no comentário. */
      const IN_COMMENT = 'penumbra';

      /**
       * ⚠️ Fixture com as duas colunas escritas EXPLICITAMENTE, e o comentário
       * pelo `aDoc` — nunca um `commentText` cravado à mão: ele é DERIVADO do
       * `commentDoc` no backend (ADR 0001), e um fixture com as duas pontas em
       * desacordo afirmaria uma regra que a produção não tem (§7.1).
       */
      function aSearchable(
        id: string,
        quote: string,
        comment: string,
      ): Highlight {
        return aClubHighlight({ id, quote, commentDoc: aDoc(comment) });
      }

      beforeEach(async () => {
        await highlights.save(
          aSearchable('so-no-trecho', `a ${IN_QUOTE} do anel`, 'sem o termo'),
        );
        await highlights.save(
          aSearchable(
            'so-no-comentario',
            'um trecho qualquer',
            `a ${IN_COMMENT} do vale`,
          ),
        );
        await highlights.save(
          aSearchable(
            'nos-dois',
            `a ${IN_QUOTE} do anel`,
            `a ${IN_QUOTE} outra vez`,
          ),
        );
        await highlights.save(
          aSearchable('em-nenhum', 'um trecho qualquer', 'sem o termo'),
        );
      });

      it('matches the quote, which the closed decision does not name', async () => {
        const found = await highlights.find({
          clubId: CLUB_ID,
          text: IN_QUOTE,
        });

        expect(ids(found).sort()).toEqual(['nos-dois', 'so-no-trecho']);
      });

      it('matches the commentText', async () => {
        const found = await highlights.find({
          clubId: CLUB_ID,
          text: IN_COMMENT,
        });

        expect(ids(found)).toEqual(['so-no-comentario']);
      });

      // "Em nenhum dos dois" — sem este lado, um `find` que ignorasse o `text`
      // passaria nos dois testes acima.
      it('matches neither column when the term is in neither', async () => {
        await expect(
          highlights.find({ clubId: CLUB_ID, text: 'inexistente' }),
        ).resolves.toEqual([]);
      });

      // O quarto caso, e ele é a precondição dos três: os quatro grifos estão
      // lá, e `text` ausente não recorta nada.
      it('does not filter at all when the text is absent', async () => {
        const found = await highlights.find({ clubId: CLUB_ID });

        expect(ids(found)).toHaveLength(4);
      });

      // Regra 1 — `ILIKE` compara sem olhar caixa, e a caixa pode divergir dos
      // DOIS lados: na consulta e no texto gravado.
      it.each(['ESMERALDA', 'esmeralda', 'EsMeRaLdA'])(
        'matches the quote case-insensitively when the query is %s',
        async (text) => {
          const found = await highlights.find({ clubId: CLUB_ID, text });

          expect(ids(found).sort()).toEqual(['nos-dois', 'so-no-trecho']);
        },
      );

      it('matches a lowercase query against an uppercase quote', async () => {
        await highlights.save(
          aSearchable('grito', 'A ESMERALDA GRITADA', 'sem o termo'),
        );

        const found = await highlights.find({
          clubId: CLUB_ID,
          text: 'esmeralda',
        });

        expect(ids(found).sort()).toEqual([
          'grito',
          'nos-dois',
          'so-no-trecho',
        ]);
      });

      /**
       * ⚠️ **REGRA 3 — ACCENT-SENSITIVE, e é a 3ª aparição da tabela do §7.1.**
       *
       * `'coração' ILIKE '%coracao%'` é **falso** no Postgres. Um fake que
       * normalizasse acento seria infiel na direção **PERMISSIVA**: este teste
       * ficaria verde e a busca real não acharia nada.
       *
       * ⚠️ **E ISTO É DECISÃO FECHADA, NÃO PENDÊNCIA.** A decisão do MVP 2 diz
       * `ILIKE`, e o irmão deste teste contra o **Postgres** existe desde a
       * Tarefa 11 no lado da nota (`matches case but not accent`) e desde a
       * Tarefa 29 no lado do grifo. Busca sem acento exige a extensão
       * `unaccent` + índice funcional + ADR, é **fatia própria**, e está
       * **registrada como pergunta do dono** na spec da Tarefa 29. Não
       * conserte aqui.
       */
      it.each([
        ['coracao', 'coração'],
        ['coração', 'coracao'],
      ])(
        'does not match the query %s against the stored %s, just like ILIKE',
        async (text, stored) => {
          await highlights.save(
            aSearchable('acento', `o ${stored} do anao`, 'sem o termo'),
          );

          await expect(
            highlights.find({ clubId: CLUB_ID, text }),
          ).resolves.toEqual([]);
        },
      );

      // Regra 3, o lado POSITIVO: a caixa continua sendo dobrada NO caractere
      // acentuado (`Ç` acha `ç`). Sem ele, um fake que só comparasse ASCII
      // passaria no de cima por acidente.
      it('matches an accented word when the query carries the same accent', async () => {
        await highlights.save(
          aSearchable('acento', 'o coração do anao', 'sem o termo'),
        );

        const found = await highlights.find({
          clubId: CLUB_ID,
          text: 'CORAÇÃO',
        });

        expect(ids(found)).toEqual(['acento']);
      });

      // E o mesmo acento no COMENTÁRIO, senão a fidelidade valeria para uma
      // coluna só — que é exatamente o defeito que a decisão A cria espaço para.
      it('is accent-sensitive in the commentText too, not only in the quote', async () => {
        await highlights.save(
          aSearchable(
            'acento-comentario',
            'um trecho qualquer',
            'o coração dela',
          ),
        );

        await expect(
          highlights.find({ clubId: CLUB_ID, text: 'coracao' }),
        ).resolves.toEqual([]);
        // A precondição que dá dente à asserção: COM o acento, ele é achado.
        expect(
          ids(await highlights.find({ clubId: CLUB_ID, text: 'coração' })),
        ).toEqual(['acento-comentario']);
      });

      /**
       * ⚠️ **REGRA 1 — `%`, `_` e `\` são LITERAIS no contrato do port**, e este
       * é o lado do fake.
       *
       * Aqui a propriedade é trivial (para uma `String.includes` eles já são
       * literais) e é justamente por isso que ela **não** se prova aqui: o bug
       * é invisível em memória. Quem a prova é o **teste de contrato** contra o
       * Postgres, onde `%` e `_` são curinga de verdade
       * (`prisma-highlight-repository.contract.integration.test.ts`,
       * `treats % and _ in the text query as literal characters`) — e é o
       * `toLikePattern` de `repositories/like-pattern.ts` que os escapa, uma vez
       * para os dois repositórios.
       *
       * Este teste existe para o contrato do port ficar **afirmado nos dois
       * lados**: um fake que passasse a interpretar curinga divergiria do
       * Postgres escapado, e a divergência ficaria verde (§7.10 — a afirmação
       * de indecidibilidade vem com o endereço da prova).
       */
      it('treats % and _ in the text as literal characters, like the escaped ILIKE does', async () => {
        await highlights.save(
          aSearchable('curinga', 'o a_b e o 100% do plano', 'sem o termo'),
        );
        await highlights.save(
          aSearchable('quase', 'o axb e o 100 do plano', 'sem o termo'),
        );

        expect(
          ids(await highlights.find({ clubId: CLUB_ID, text: 'a_b' })),
        ).toEqual(['curinga']);
        expect(
          ids(await highlights.find({ clubId: CLUB_ID, text: '100%' })),
        ).toEqual(['curinga']);
      });
    });

    // Cada grifo erra em UM filtro só, então cada filtro que deixasse de ser
    // aplicado traria um grifo a mais.
    it('combines every filter with AND', async () => {
      await highlights.save(
        aClubHighlight({ id: 'wrong-club', clubId: OTHER_CLUB_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-book', bookId: OTHER_BOOK_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-author', userId: OTHER_AUTHOR_ID }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-colour', color: GREEN }),
      );
      await highlights.save(
        aClubHighlight({ id: 'wrong-page', page: OTHER_PAGE }),
      );
      // ⚠️ O `text` entra no AND como qualquer outro filtro: este grifo tem o
      // termo em nenhuma das duas colunas de conteúdo.
      await highlights.save(
        aClubHighlight({
          id: 'wrong-text',
          quote: 'nada a ver',
          commentDoc: aDoc('nada a ver também'),
        }),
      );
      await highlights.save(
        aClubHighlight({
          id: 'the-one',
          quote: 'a esmeralda do anel',
          commentDoc: aDoc('vale o que custa'),
        }),
      );

      const found = await highlights.find({
        clubId: CLUB_ID,
        bookId: BOOK_ID,
        authorId: AUTHOR_ID,
        color: YELLOW,
        page: PAGE,
        text: 'esmeralda',
      });

      expect(ids(found)).toEqual(['the-one']);
    });

    // `status` ausente é "os dois", como no `NoteFilter`. Quem esconde o
    // arquivado é o UseCase, não o repositório.
    //
    // Ordena antes de comparar: o assunto aqui é COBERTURA de status, não a
    // ordem — que tem teste dedicado (`enumerates in reverse insertion order`).
    // Pinar a ordem aqui faria este teste quebrar por um motivo que não tem nada
    // a ver com o nome dele se a armadilha do fake um dia virar outro critério
    // legítimo (§7.2, o corolário).
    it('returns both statuses when the filter carries no status', async () => {
      await highlights.save(anArchivedClubHighlight({ id: 'archived' }));
      await highlights.save(aClubHighlight({ id: 'active' }));

      const found = await highlights.find({ clubId: CLUB_ID });

      expect(ids(found).sort()).toEqual(['active', 'archived']);
    });

    it('returns only the ACTIVE ones when the filter says ACTIVE', async () => {
      await highlights.save(anArchivedClubHighlight({ id: 'archived' }));
      await highlights.save(aClubHighlight({ id: 'active' }));

      const found = await highlights.find({
        clubId: CLUB_ID,
        status: 'ACTIVE',
      });

      expect(ids(found)).toEqual(['active']);
    });

    // E o outro sentido, senão um `find` que ignorasse o `status` passaria no de
    // cima quando só houvesse grifo ativo.
    it('returns only the ARCHIVED ones when the filter says ARCHIVED', async () => {
      await highlights.save(anArchivedClubHighlight({ id: 'archived' }));
      await highlights.save(aClubHighlight({ id: 'active' }));

      const found = await highlights.find({
        clubId: CLUB_ID,
        status: 'ARCHIVED',
      });

      expect(ids(found)).toEqual(['archived']);
    });

    /**
     * ⚠️ **A ARMADILHA DELIBERADA, agora no `find`.** O fake enumera na ordem
     * INVERSA à de inserção, e isso NÃO é bug: a Tarefa 07 descobriu um teste de
     * ordenação que passava com a implementação errada porque os fixtures
     * estavam na ordem esperada. Com o fake invertido, um `listHighlights` sem
     * `sort` FALHA. → §7.2.
     *
     * Três grifos, e não dois: com dois, "invertido" e "ordenado por id
     * decrescente" dariam o mesmo resultado. A pré-condição vem do `byId`, e não
     * do `saved`, porque o `saved` tem a mesma armadilha sob teste em outro
     * lugar.
     */
    it('enumerates in reverse insertion order', async () => {
      await highlights.save(aClubHighlight({ id: 'b-inserido-1o' }));
      await highlights.save(aClubHighlight({ id: 'a-inserido-2o' }));
      await highlights.save(aClubHighlight({ id: 'c-inserido-3o' }));

      for (const id of ['b-inserido-1o', 'a-inserido-2o', 'c-inserido-3o']) {
        await expect(highlights.byId(id)).resolves.not.toBeNull();
      }

      const found = await highlights.find({ clubId: CLUB_ID });

      expect(ids(found)).toEqual([
        'c-inserido-3o',
        'a-inserido-2o',
        'b-inserido-1o',
      ]);
    });

    it('returns an empty list for a club with no highlights', async () => {
      await highlights.save(
        aClubHighlight({ id: 'theirs', clubId: OTHER_CLUB_ID }),
      );

      await expect(highlights.find({ clubId: CLUB_ID })).resolves.toEqual([]);
    });

    // Clona na saída, como as outras leituras: o `listHighlights` ordena o array
    // que recebe daqui, e o store não pode sentir isso.
    it('does not let the caller corrupt the store through what find returned', async () => {
      await highlights.save(
        aClubHighlight({ id: 'highlight-x', commentDoc: aDoc('um') }),
      );

      const first = required((await highlights.find({ clubId: CLUB_ID }))[0]);
      first.quote = 'adulterado';
      const paragraph = first.commentDoc?.content?.[0];
      if (paragraph?.content?.[0]) paragraph.content[0].text = 'adulterado';

      const second = required((await highlights.find({ clubId: CLUB_ID }))[0]);
      expect(second.quote).not.toBe('adulterado');
      expect(JSON.stringify(second.commentDoc)).not.toContain('adulterado');
    });

    // Mesmo padrão do `saveCalls` e do `compareCalls` do `PasswordHasherFake`
    // (§6.4 e §7.3): é o que deixa o teste do `listHighlights` afirmar que "o
    // corte de tenant veio ANTES da consulta" sem depender do resultado. E o
    // lado POSITIVO junto, senão um incremento apagado deixa todo `toBe(0)`
    // passar por acidente.
    it('counts every find call', async () => {
      expect(highlights.findCalls).toBe(0);

      await highlights.find({ clubId: CLUB_ID });
      await highlights.find({ clubId: OTHER_CLUB_ID });

      expect(highlights.findCalls).toBe(2);
    });

    // E guarda o filtro de cada chamada: é o que prova que o UseCase manda UM
    // `HighlightFilter` só, com `status: 'ACTIVE'` e sem chave à toa — nada
    // disso muda o resultado num cenário sem grifo arquivado (§7.3).
    it('records the filter of every find call', async () => {
      await highlights.find({ clubId: CLUB_ID, status: 'ACTIVE' });
      await highlights.find({ clubId: OTHER_CLUB_ID, color: GREEN });

      expect(highlights.findFilters).toStrictEqual([
        { clubId: CLUB_ID, status: 'ACTIVE' },
        { clubId: OTHER_CLUB_ID, color: GREEN },
      ]);
    });

    // O registro é uma CÓPIA: um chamador que reusasse o objeto do filtro entre
    // duas consultas reescreveria o histórico e o teste do UseCase mentiria.
    it('records a copy of the filter, not the caller object', async () => {
      const filter = { clubId: CLUB_ID, page: PAGE };

      await highlights.find(filter);
      filter.page = OTHER_PAGE;

      expect(highlights.findFilters).toStrictEqual([
        { clubId: CLUB_ID, page: PAGE },
      ]);
    });
  });

  /**
   * Regra 21 — **A ARMADILHA DELIBERADA, no `saved`.**
   *
   * A enumeração de coleção vem na ordem INVERSA à de inserção. Não é bug: a
   * Tarefa 07 descobriu um teste de ordenação que passava com a implementação
   * errada só porque os fixtures estavam na ordem esperada, e a ordem que o
   * Postgres devolve sem `ORDER BY` é indefinida de verdade (depende de plano de
   * execução e de `VACUUM`). "Invertida" é tão fiel quanto qualquer outra — e é
   * a única que FALHA quando alguém confia na ordem do repositório. → §7.2.
   *
   * Três grifos, e não dois: com dois, "invertido" e "ordenado por id
   * decrescente" dariam o mesmo resultado. A pré-condição vem do `byId`, e não
   * do `saved`, porque é justamente o `saved` que está sob teste aqui.
   */
  describe('enumerates in reverse insertion order', () => {
    it('gives back the three highlights from the last inserted to the first', async () => {
      await highlights.save(aHighlight({ id: 'b-inserido-1o' }));
      await highlights.save(aHighlight({ id: 'a-inserido-2o' }));
      await highlights.save(aHighlight({ id: 'c-inserido-3o' }));

      // Pré-condição: os três estão lá, e a inserção foi nesta ordem.
      for (const id of ['b-inserido-1o', 'a-inserido-2o', 'c-inserido-3o']) {
        await expect(highlights.byId(id)).resolves.not.toBeNull();
      }

      expect(highlights.saved.map((highlight) => highlight.id)).toEqual([
        'c-inserido-3o',
        'a-inserido-2o',
        'b-inserido-1o',
      ]);
    });

    // Reescrever um grifo NÃO o move para o fim da fila: o `Map` do JS mantém a
    // posição de uma chave que já existe, e é o que o `save` como upsert faz.
    it('keeps the position of an id that is rewritten', async () => {
      await highlights.save(aHighlight({ id: 'highlight-a' }));
      await highlights.save(aHighlight({ id: 'highlight-b' }));

      await highlights.save(aHighlight({ id: 'highlight-a', quote: 'outra' }));

      expect(highlights.saved.map((highlight) => highlight.id)).toEqual([
        'highlight-b',
        'highlight-a',
      ]);
    });

    it('gives back an empty list when nothing was saved', () => {
      expect(highlights.saved).toEqual([]);
    });
  });
});
