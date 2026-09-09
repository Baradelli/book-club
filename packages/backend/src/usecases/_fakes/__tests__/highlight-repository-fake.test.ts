import { beforeEach, describe, expect, it } from 'vitest';

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
 * O port tem SÓ `save` · `byId` · `update` (decisão F): `find` é a Tarefa 23 e
 * `delete` não existe (hard delete não está no escopo). Método de port sem
 * chamador é especulação.
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
   * Regra 21 — **A ARMADILHA DELIBERADA, herdada mesmo sem `find` ainda.**
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
