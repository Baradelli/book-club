// Builders de teste. UMA estratégia de id só: derivada da chave natural da
// entidade (`membership-${userId}-${clubId}`, `user-${email}`,
// `invite-${code}`, `settings-${userId}`), para a mesma chave sempre gerar o
// mesmo id — é o que os índices únicos do banco esperam. Quem precisa de dois
// ids diferentes para a mesma chave — os testes de unicidade — passa `id`
// explícito.

import type { Book, ReadingPlanItem } from '../domain/book';
import type { Club, Membership } from '../domain/club';
import { docToText } from '../domain/doc-to-text';
import type { Highlight } from '../domain/highlight';
import type { Invite } from '../domain/invite';
import { normalizeEmail } from '../domain/normalize-email';
import type { Note, NoteDoc } from '../domain/note';
import type { Settings } from '../domain/settings';
import { DEFAULT_SETTINGS } from '../domain/settings';
import type { User } from '../domain/user';

export const FIXED_ISO = '2026-01-01T00:00:00.000Z';
export const EXPIRES_ISO = '2026-01-08T00:00:00.000Z';

export function aClub(overrides: Partial<Club> = {}): Club {
  const id = overrides.id ?? 'club-1';
  return {
    id,
    name: 'Clube do Casal',
    timezone: 'America/Sao_Paulo',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

export function aMembership(overrides: Partial<Membership> = {}): Membership {
  const userId = overrides.userId ?? 'user-1';
  const clubId = overrides.clubId ?? 'club-1';
  return {
    id: `membership-${userId}-${clubId}`,
    userId,
    clubId,
    role: 'MEMBER',
    status: 'ACTIVE',
    joinedAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

export function aUser(overrides: Partial<User> = {}): User {
  const email = normalizeEmail(overrides.email ?? 'maria@exemplo.com');
  return {
    name: 'Maria',
    passwordHash: null,
    isSuperAdmin: false,
    createdAt: new Date(FIXED_ISO),
    ...overrides,
    // Depois do spread: o builder garante o invariante "e-mail normalizado",
    // e o id deriva dele.
    email,
    id: overrides.id ?? `user-${email}`,
  };
}

export function anInvite(overrides: Partial<Invite> = {}): Invite {
  const code = overrides.code ?? 'CODE-1';
  return {
    id: `invite-${code}`,
    clubId: 'club-1',
    code,
    role: 'MEMBER',
    createdById: 'user-admin',
    expiresAt: new Date(EXPIRES_ISO),
    usedAt: null,
    usedById: null,
    createdAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

// O `Book` não tem chave natural única — o plano do projeto não declara índice
// em (clubId, month) de propósito (§11: "livro corrente" é decisão em aberto).
// Daí o id fixo, sobrescrevível.
export function aBook(overrides: Partial<Book> = {}): Book {
  return {
    id: 'book-1',
    clubId: 'club-1',
    title: 'O Hobbit',
    author: 'J. R. R. Tolkien',
    month: '2026-10',
    coverUrl: null,
    totalPages: 320,
    createdById: 'user-admin',
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

export function aPlanItem(
  overrides: Partial<ReadingPlanItem> = {},
): ReadingPlanItem {
  const bookId = overrides.bookId ?? 'book-1';
  const date = overrides.date ?? '2026-10-01';
  return {
    id: `plan-${bookId}-${date}`,
    bookId,
    order: 0,
    date,
    title: 'Cap. 1 — Uma reunião inesperada',
    reference: 'p. 1-20',
    createdAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

/**
 * Um `doc` de ProseMirror com um parágrafo por texto — o formato que o editor
 * manda. `aDoc()` sem argumento é o doc vazio do autosave da primeira
 * digitação.
 */
export function aDoc(...texts: string[]): NoteDoc {
  return {
    type: 'doc',
    content: texts.map((text) => ({
      type: 'paragraph',
      content: [{ type: 'text', text }],
    })),
  };
}

/**
 * A anotação. O id do PLAN deriva da chave natural `unique(planItemId, userId)`
 * — a mesma estratégia do `aMembership` —, para a mesma chave sempre gerar o
 * mesmo id. A avulsa não tem chave natural (é ilimitada por decisão de
 * produto), então leva id fixo, sobrescrevível.
 *
 * `plainText` é derivado do `doc` por padrão, mas **um `plainText` explícito
 * vence** — o `docToText(doc)` está ANTES do `...overrides` de propósito,
 * diferente do `email`/`id` do `aUser`, que vêm DEPOIS justamente para o
 * invariante ser inescapável.
 *
 * A assimetria é deliberada: a **regra 15** do `editNote` ("renomear NÃO
 * recalcula o `plainText`") só é MENSURÁVEL com uma nota cujo `plainText`
 * divirja do `doc`. Com os dois coerentes, "não recalculou" e "recalculou e deu
 * no mesmo" dão o mesmo resultado, e o teste não prova nada.
 *
 * E o estado é realista, não um impossível: o `plainText` gravado pode ter sido
 * derivado por uma versão ANTERIOR do `docToText` — o próprio ADR 0001
 * pressupõe que os dois possam divergir quando diz que reconstruir o
 * `plainText` de tudo é trivial. → ADR 0001.
 */
export function aNote(overrides: Partial<Note> = {}): Note {
  const userId = overrides.userId ?? 'user-1';
  const kind = overrides.kind ?? 'PLAN';
  const planItemId =
    overrides.planItemId ?? (kind === 'PLAN' ? aPlanItem().id : null);
  const doc = overrides.doc ?? aDoc('Gostei do começo.');

  return {
    id: kind === 'PLAN' ? `note-${planItemId}-${userId}` : 'note-1',
    clubId: 'club-1',
    bookId: 'book-1',
    userId,
    kind,
    planItemId,
    title: 'Cap. 1 — Uma reunião inesperada',
    reference: null,
    doc,
    plainText: docToText(doc),
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date(FIXED_ISO),
    updatedAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

/**
 * O grifo do livro de papel. **Sem chave natural** — o grifo é ilimitado por
 * decisão de produto (não há `@@unique` nenhum na tabela) —, então leva id
 * fixo, sobrescrevível, como o `aBook`.
 *
 * `commentText` é derivado do `commentDoc` por padrão, mas **um `commentText`
 * explícito vence** — o `docToText` está ANTES do `...overrides` de propósito,
 * pela mesma assimetria deliberada do `aNote`: a regra 14 do `editHighlight`
 * ("editar o trecho não recalcula o `commentText`") só é MENSURÁVEL com um
 * grifo cujo `commentText` divirja do `commentDoc`. Com os dois coerentes, "não
 * recalculou" e "recalculou e deu no mesmo" dão o mesmo resultado.
 *
 * E o estado é realista: o `commentText` gravado pode ter sido derivado por uma
 * versão ANTERIOR do `docToText`. → ADR 0001.
 *
 * A `color` é o literal `'#facc15'` e não `HIGHLIGHT_COLORS[0]`: um reordenamento
 * da paleta não pode trocar o fixture em silêncio.
 */
export function aHighlight(overrides: Partial<Highlight> = {}): Highlight {
  const commentDoc =
    overrides.commentDoc === undefined
      ? aDoc('me lembrou da coragem de continuar.')
      : overrides.commentDoc;

  return {
    id: 'highlight-1',
    clubId: 'club-1',
    bookId: 'book-1',
    userId: 'user-1',
    quote: 'não é o que você tem, é o que você faz com o que tem',
    color: '#facc15',
    page: 45,
    reference: null,
    commentDoc,
    commentText: commentDoc === null ? '' : docToText(commentDoc),
    status: 'ACTIVE',
    archivedAt: null,
    createdAt: new Date(FIXED_ISO),
    updatedAt: new Date(FIXED_ISO),
    ...overrides,
  };
}

export function aSettings(overrides: Partial<Settings> = {}): Settings {
  const userId = overrides.userId ?? 'user-1';
  return {
    id: `settings-${userId}`,
    userId,
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

// Estreita `T | null | undefined` num idioma só: serve para o retorno das
// leituras dos repositórios (`| null`) e para acesso indexado sob
// noUncheckedIndexedAccess (`| undefined`).
export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error('expected a value, got null or undefined');
  }
  return value;
}
