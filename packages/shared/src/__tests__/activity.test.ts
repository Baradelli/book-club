import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ACTIVITY_TYPES, isActivityType } from '../activity';

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
