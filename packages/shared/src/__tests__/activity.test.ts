import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ACTIVITY_FEED_DEFAULT_LIMIT,
  ACTIVITY_FEED_MAX_LIMIT,
  ACTIVITY_TYPES,
  activityEventResponseSchema,
  activityResponseSchema,
  activityType,
  isActivityType,
  listActivityQuerySchema,
} from '../activity';

/**
 * Regras 1 e 2 da Tarefa 33 — o vocabulário de tipos do `ActivityEvent`, no
 * molde medido do `HIGHLIGHT_COLORS` (Tarefa 22).
 *
 * Mora em `packages/shared` porque **três chamadores precisam da MESMA lista**:
 * o domínio do backend (`domain/activity-event.ts`), o `z.enum` da borda
 * (Tarefa 34) e o feed da home (Tarefa 35). O `CLAUDE.md` já nomeia
 * `ActivityEvent.type` ao lado de `NotificationDelivery.kind` e
 * `PushSubscription.platform` como a **mesma classe** do `Highlight.color`, e a
 * lição nº 3 do MVP 1 ("vocabulário compartilhado mora num arquivo só") custou
 * dois bugs.
 */

/** Os quatro tipos, escritos à mão: é a decisão F da spec, pinada. */
const EXPECTED_TYPES = ['PLAN_NOTE', 'FREE_NOTE', 'HIGHLIGHT', 'READ'] as const;

/**
 * A raiz do monorepo, a partir deste arquivo
 * (`packages/shared/src/__tests__/` → quatro níveis acima).
 *
 * `import.meta.url` e não `process.cwd()`, pelo motivo do
 * `highlight-color.test.ts`: o projeto de teste de `shared` roda em ambiente
 * `node`, e o caminho do monorepo é fixo.
 */
const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));

const PACKAGES = ['shared', 'backend', 'ui', 'app'];

/**
 * O único arquivo que tem o direito de conter a lista inteira. Qualquer outro
 * arquivo de PRODUÇÃO que enumere os quatro está declarando uma segunda lista
 * — que é o achado que a regra 2 pede.
 */
const OWNER = 'activity.ts';

/**
 * ⚠️ **Só os arquivos `*.test.ts(x)` ficam de fora — o diretório `__tests__`
 * NÃO.** Um teste que enumera os quatro está **pinando** o vocabulário, que é o
 * oposto de duplicá-lo: este arquivo mesmo escreve os quatro à mão (é o pino),
 * e o `record-activity.test.ts` os enumera numa tabela de `it.each` que mapeia
 * tipo → dia → assunto; incluí-los faria a guarda acusar justamente quem a
 * cumpre.
 *
 * Mas **excluir o diretório inteiro era largo demais**: dentro de `__tests__`
 * moram helpers que não são testes — `adr-0002-dom.ts`, `anti-guilt-dom.ts`,
 * `harness.tsx` —, e são justamente arquivos de **vocabulário de tela**, a
 * família onde a segunda lista tem mais chance de nascer. Uma guarda no lugar
 * errado é pior que nenhuma (§7.9): ela dá a sensação de cobertura.
 *
 * O que ela protege é onde o estrago acontece: a tela do feed (Tarefa 35)
 * precisando dos quatro rótulos e achando mais curto reescrever a lista.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'node_modules' ? [] : sourceFiles(full);
    }
    if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) return [];
    return entry.endsWith('.ts') || entry.endsWith('.tsx') ? [full] : [];
  });
}

function allSourceFiles(): string[] {
  return PACKAGES.flatMap((pkg) =>
    sourceFiles(join(REPO_ROOT, 'packages', pkg, 'src')),
  );
}

describe('ACTIVITY_TYPES', () => {
  it('is exactly the four types of the feed', () => {
    expect(ACTIVITY_TYPES).toEqual(EXPECTED_TYPES);
    expect(ACTIVITY_TYPES).toHaveLength(4);
  });

  it('has no repeated type', () => {
    expect(new Set(ACTIVITY_TYPES).size).toBe(4);
  });

  /**
   * Sem isto, um `'plan_note'` na lista passaria no `toEqual` acima e viraria
   * uma segunda grafia do mesmo tipo na coluna — o mesmo argumento do
   * "minúsculo e sem alpha" da paleta de grifo: duas grafias fazem o filtro
   * perder metade das linhas.
   */
  it('is written in SCREAMING_SNAKE_CASE', () => {
    for (const type of ACTIVITY_TYPES) {
      expect(type).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });

  /**
   * ⚠️ Regra 2 — **nada duplica a lista**, e a guarda é automática.
   *
   * Um `grep` colado num relatório é medição de um instante, não guarda
   * (`docs/CONVENCOES-CODIGO.md` §7.9): a segunda lista não nasce hoje, nasce
   * na tela da Tarefa 35, quando alguém precisar dos quatro rótulos e achar
   * mais curto reescrevê-los.
   *
   * O detector é preciso porque **um chamador legítimo cita UM tipo só** — o
   * `upsertPlanNote` escreve `'PLAN_NOTE'`, o `markRead` escreve `'READ'` —,
   * enquanto uma segunda declaração cita os quatro. O `ENTRY_TYPES` do acervo
   * (`packages/app/src/pages/acervo-entries.ts`) tem `'HIGHLIGHT'` e não é
   * falso positivo: ele é outro vocabulário (o chip de tipo da tela), com três
   * valores, e não enumera os quatro.
   */
  it('is declared in one file, and nothing else enumerates the four', () => {
    const files = allSourceFiles();
    // Sem isto, um `sourceFiles` quebrado devolveria `[]` e o teste passaria
    // sem olhar nada (§7.4).
    expect(files.length).toBeGreaterThan(100);

    const offenders = files.filter((file) => {
      if (basename(file) === OWNER) return false;
      const source = readFileSync(file, 'utf8');
      return EXPECTED_TYPES.every((type) => source.includes(`'${type}'`));
    });

    expect(offenders).toEqual([]);
  });

  // A pré-condição do detector: ele ENCONTRA o dono. Um filtro que excluísse
  // arquivos demais devolveria `[]` acima sem ter olhado nada — a asserção
  // vazia do §7.4 com outra roupa.
  it('finds the vocabulary file itself when the owner is not excluded', () => {
    const declaring = allSourceFiles().filter((file) => {
      const source = readFileSync(file, 'utf8');
      return EXPECTED_TYPES.every((type) => source.includes(`'${type}'`));
    });

    expect(declaring.map((file) => basename(file))).toEqual([OWNER]);
  });
});

describe('isActivityType', () => {
  it.each(EXPECTED_TYPES)('accepts %s', (type) => {
    expect(isActivityType(type)).toBe(true);
  });

  /**
   * Os cinco UseCases que a decisão B deixou de fora (`editNote`,
   * `archiveNote`, `editHighlight`, `archiveHighlight`, `unmarkRead`) não têm
   * tipo — e é isso que o portão recusa se alguém inventar um.
   */
  it.each([
    ['a type that the decision B left out', 'NOTE_EDITED'],
    ['the non-event of unmarking', 'UNREAD'],
    ['the same type in lowercase', 'plan_note'],
    ['the same type in mixed case', 'Plan_Note'],
    ['the entity name instead of the type', 'NOTE'],
    ['the screen vocabulary of the acervo', 'PLAN'],
    ['an empty string', ''],
    ['only spaces', '   '],
    ['a type with a leading space', ' READ'],
    ['a type with a trailing space', 'READ '],
  ])('refuses %s (%s)', (_label, value) => {
    expect(isActivityType(value)).toBe(false);
  });

  // O tipo diz `unknown`, então o valor pode vir de qualquer lugar: nenhum
  // deles pode estourar aqui.
  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['a number', 42],
    ['a boolean', true],
    ['an object', { type: 'READ' }],
    ['an array with a valid type inside', ['READ']],
  ])('refuses %s without throwing', (_label, value) => {
    expect(isActivityType(value)).toBe(false);
  });

  /**
   * O predicado ESTREITA — é o que faz o domínio sair de `unknown` para
   * `ActivityType` sem um `as`. Sem esta prova, um
   * `(value: unknown) => boolean` passaria em tudo acima e obrigaria um cast no
   * primeiro chamador.
   */
  it('narrows the value to ActivityType', () => {
    const value: unknown = 'HIGHLIGHT';

    if (!isActivityType(value)) throw new Error('expected an activity type');

    // `value` é `ActivityType` daqui para baixo: o `includes` de uma lista de
    // literais só compila com o tipo estreito.
    expect(ACTIVITY_TYPES.includes(value)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa 34 — os schemas de borda do feed
// ─────────────────────────────────────────────────────────────────────────────

describe('activityType (the z.enum of the border)', () => {
  /**
   * ⚠️ **REGRA 15 — o `z.enum` da borda É `ACTIVITY_TYPES`, e a asserção é de
   * IDENTIDADE.**
   *
   * É o molde medido do `highlightColor` (Tarefa 24), com um aperto: lá o pino
   * é `toEqual([...HIGHLIGHT_COLORS])`, aqui é `toBe`. `z.enum(X)` guarda a
   * MESMA referência em `_def.values`, e `.options` a devolve — então a
   * identidade é decidível, e ela recusa também o caso que o `toEqual` deixa
   * passar: uma cópia literal escrita à mão com os mesmos quatro valores de
   * hoje, que ficaria verde e divergiria no dia em que a lista crescesse.
   *
   * Uma segunda lista escrita à mão aqui é a lição nº 3 do MVP 1 — e a guarda
   * `is declared in one file, and nothing else enumerates the four`, logo
   * acima, varre produção justamente atrás dela.
   */
  it('is built from ACTIVITY_TYPES itself, by identity', () => {
    expect(activityType.options).toBe(ACTIVITY_TYPES);
    // ...e o valor, para o vermelho dizer o que quebrou.
    expect(activityType.options).toEqual([...ACTIVITY_TYPES]);
  });

  it.each(ACTIVITY_TYPES)('accepts %s', (type) => {
    expect(activityType.safeParse(type).success).toBe(true);
  });

  /**
   * A borda **não normaliza caixa nem dá `trim`**, pelo motivo do
   * `isActivityType`: normalizar aqui criaria uma segunda grafia aceita que o
   * `=` byte-sensível do Postgres não reconhece como o mesmo tipo — a
   * divergência do ADR 0007 com outra roupa.
   */
  it.each([
    ['the same type in lower case', 'plan_note'],
    ['the same type with a leading space', ' READ'],
    ['a verb the decision B left out', 'NOTE_EDITED'],
    ['the non-event of unmarking', 'UNREAD'],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(activityType.safeParse(value).success).toBe(false);
  });
});

describe('activityEventResponseSchema', () => {
  function anEventBody(): Record<string, unknown> {
    return {
      id: 'activity-1',
      clubId: 'club-1',
      userId: 'user-maria',
      type: 'PLAN_NOTE',
      bookId: 'book-1',
      planItemId: 'day-3',
      subjectId: 'note-9',
      createdAt: '2026-10-01T18:30:45.123Z',
    };
  }

  it('accepts the eight fields of the entity', () => {
    expect(activityEventResponseSchema.parse(anEventBody())).toEqual(
      anEventBody(),
    );
  });

  /**
   * `planItemId` é **obrigatório e anulável**, nunca `optional()`: a anotação
   * avulsa e o grifo gravam `null`, e o `null` é estado real que a tela do feed
   * usa para decidir a frase. A AUSÊNCIA do campo quebraria o front em cheio,
   * porque o cliente valida a resposta de sucesso (§6.8).
   */
  it('takes a null planItemId, and refuses the field missing', () => {
    const withoutTheDay = { ...anEventBody() };
    delete withoutTheDay['planItemId'];

    expect(
      activityEventResponseSchema.parse({ ...anEventBody(), planItemId: null })
        .planItemId,
    ).toBeNull();
    expect(activityEventResponseSchema.safeParse(withoutTheDay).success).toBe(
      false,
    );
  });

  /**
   * ⚠️ **§6.1 — o `response` schema é FRONTEIRA DE SEGURANÇA**: é o strip do
   * Zod que corta o que não está declarado, e é o que impede um objeto de
   * domínio inteiro de ir para a rede.
   */
  it('strips a field nobody declared', () => {
    const parsed = activityEventResponseSchema.parse({
      ...anEventBody(),
      passwordHash: 'nao-vaza',
      plainText: 'nem o conteudo',
    });

    expect(Object.keys(parsed).sort()).toEqual([
      'bookId',
      'clubId',
      'createdAt',
      'id',
      'planItemId',
      'subjectId',
      'type',
      'userId',
    ]);
  });

  it('refuses a type outside the four', () => {
    expect(
      activityEventResponseSchema.safeParse({
        ...anEventBody(),
        type: 'NOTE_EDITED',
      }).success,
    ).toBe(false);
  });

  it('is an array in activityResponseSchema', () => {
    expect(activityResponseSchema.parse([])).toEqual([]);
    expect(activityResponseSchema.parse([anEventBody()])).toHaveLength(1);
    expect(activityResponseSchema.safeParse(anEventBody()).success).toBe(false);
  });
});

describe('listActivityQuerySchema', () => {
  /**
   * ⚠️ **DECISÃO D — o limite é PARÂMETRO EXPLÍCITO, não um teto escondido no
   * repositório.** Query string é texto, então `z.coerce` — é o precedente
   * exato do `page` do `listHighlightsQuerySchema`.
   */
  it('coerces the text of a query string into a number', () => {
    expect(listActivityQuerySchema.parse({ limit: '20' })).toEqual({
      limit: 20,
    });
  });

  it('leaves the limit undefined when nobody asked for one', () => {
    expect(listActivityQuerySchema.parse({})).toEqual({});
  });

  it.each([
    ['zero', '0'],
    ['a negative', '-1'],
    ['a fraction', '1.5'],
    ['text', 'vinte'],
    ['one past the ceiling', String(ACTIVITY_FEED_MAX_LIMIT + 1)],
  ])('refuses %s', (_label, value) => {
    expect(listActivityQuerySchema.safeParse({ limit: value }).success).toBe(
      false,
    );
  });

  it('accepts the ceiling itself', () => {
    expect(
      listActivityQuerySchema.parse({ limit: String(ACTIVITY_FEED_MAX_LIMIT) }),
    ).toEqual({ limit: ACTIVITY_FEED_MAX_LIMIT });
  });
});

describe('the two numbers of the feed limit', () => {
  /**
   * O padrão e o teto são **dois números declarados**, e a relação entre eles é
   * o que faz o padrão ser alcançável pela borda: um padrão acima do teto seria
   * um valor que nenhum cliente consegue pedir de volta depois de mudá-lo.
   */
  it('has a default inside the ceiling, and both are whole and positive', () => {
    expect(Number.isInteger(ACTIVITY_FEED_DEFAULT_LIMIT)).toBe(true);
    expect(Number.isInteger(ACTIVITY_FEED_MAX_LIMIT)).toBe(true);
    expect(ACTIVITY_FEED_DEFAULT_LIMIT).toBeGreaterThan(0);
    expect(ACTIVITY_FEED_DEFAULT_LIMIT).toBeLessThanOrEqual(
      ACTIVITY_FEED_MAX_LIMIT,
    );
  });
});
