import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * DECISÃO B da Tarefa 13: nenhum componente de `@clube/ui` traduz.
 *
 * Se o `ui` chamasse `t()`, ele passaria a ser dono de chave de catálogo — e o
 * `CustomTypeOptions` da Tarefa 12, que vive em `packages/app`, deixaria de
 * valer para ele: a tipagem das chaves não alcançaria o pacote, e o catálogo
 * de `@clube/shared` ganharia um segundo consumidor sem tipo.
 *
 * O texto entra por prop, JÁ TRADUZIDO pela tela. Este teste é o que impede a
 * decisão de ser desfeita por conveniência na Tarefa 15, quando alguém achar
 * mais rápido traduzir "Fechar" dentro do `Sheet`.
 *
 * ============================================================================
 * ⚠️ AS DUAS VARREDURAS SÃO ALLOWLIST, E ISSO NÃO É ESTILO — É O QUE AS TORNA
 * TOTAIS
 * ============================================================================
 *
 * A Tarefa 14 as havia trocado por DENYLIST por substring (`i18n`,
 * `useTranslation`, `@clube/shared/locales`). A auditoria mediu o custo: com a
 * denylist, `"react-intl"` em `dependencies` E um
 * `import { useIntl } from 'react-intl'` num componente passavam OS DOIS. Idem
 * `lingui` e `@formatjs/*`. A asserção anterior à Tarefa 14
 * (`'dependencies' in manifest === false`) era grosseira mas TOTAL, e a troca
 * perdeu a totalidade sem que nada avisasse.
 *
 * Allowlist restaura a totalidade sem voltar atrás na decisão B da Tarefa 14
 * (o `ui` é o único pacote que depende de TipTap e de `tippy.js`): o que não
 * está na lista reprova, seja um pacote de i18n, um cliente HTTP ou um
 * `date-fns` que alguém achou prático. Um pacote novo passa a exigir uma linha
 * aqui — e é exatamente essa linha que faz alguém pensar antes.
 */
const sourceRoot = resolve(process.cwd(), 'src');

/**
 * Só o que VAI para o app. `__tests__/` fica de fora, e agora por uma razão
 * mais forte que a de antes: um teste importa `vitest` e
 * `@testing-library/react` legitimamente, e nenhum dos dois embarca no PWA. Um
 * arquivo de teste dentro da allowlist obrigaria a lista a conter as
 * ferramentas de teste, e aí ela deixaria de dizer o que o pacote EXPORTA.
 */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') return [];

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (entry === 'test-setup.ts') return [];
    return /\.tsx?$/u.test(entry) ? [path] : [];
  });
}

const files = sourceFiles(sourceRoot).map((path) => ({
  path,
  code: readFileSync(path, 'utf8'),
}));

/**
 * TUDO QUE O `@clube/ui` PODE IMPORTAR DE FORA.
 *
 * - `@tiptap/*` e `tippy.js` são o editor (§1 do `docs/EDITOR.md`), e são
 *   `dependencies` deste pacote de propósito: é o que mantém
 *   `packages/app/package.json` SEM `@tiptap/*`.
 * - `react`, `react-dom`, `react-router-dom` e `lucide-react` são
 *   `peerDependencies` — quem instala é o app, para não haver duas cópias do
 *   React na árvore.
 *
 * O `$` no fim de cada nome exato é o que impede a lista de virar prefixo:
 * sem ele, `react-intl` entraria por `react`.
 */
const ALLOWED_IMPORTS =
  /^(?:@tiptap\/|tippy\.js$|react$|react-dom(?:\/|$)|react-router-dom$|lucide-react$)/u;

/** As dependências de RUNTIME que este pacote pode declarar. */
const ALLOWED_DEPENDENCIES = /^(?:@tiptap\/|tippy\.js$)/u;

describe('@clube/ui does not translate (decision B)', () => {
  it('reads the sources it claims to scan', () => {
    // Sem isto a varredura é asserção vazia (§7.4): um `sourceRoot` errado
    // devolve zero arquivos e tudo abaixo fica verde provando nada.
    expect(files.length).toBeGreaterThan(8);
    expect(files.some(({ path }) => path.endsWith('sheet.tsx'))).toBe(true);
  });

  it('imports nothing beyond the editor and the peer packages', () => {
    /*
      ⚠️ ALLOWLIST, e a diferença é mensurável: a denylist por substring
      deixava passar `import { useIntl } from 'react-intl'` (medido, suíte
      verde). Aqui o import ou está na lista, ou aparece no vermelho com o
      arquivo e o nome do pacote.

      Só o especificador de import interessa — `./x` e `../x` são nossos.
    */
    const offenders = files.flatMap(({ code, path }) =>
      [...code.matchAll(/from '([^']+)'/gu)]
        .map((match) => match[1])
        .filter(
          (specifier): specifier is string =>
            specifier !== undefined &&
            !specifier.startsWith('.') &&
            !ALLOWED_IMPORTS.test(specifier),
        )
        .map((specifier) => `${path}: ${specifier}`),
    );

    expect(offenders).toEqual([]);
  });

  it('sees the imports it claims to check', () => {
    // O lado POSITIVO (§7.3): sem ele, um regex de extração quebrado devolveria
    // zero especificadores e o teste de cima passaria provando nada.
    const specifiers = files.flatMap(({ code }) =>
      [...code.matchAll(/from '([^']+)'/gu)].map((match) => match[1]),
    );

    expect(specifiers).toContain('@tiptap/react');
    expect(specifiers).toContain('lucide-react');
    // E o regex REPROVA o que tem de reprovar — a prova de que a allowlist não
    // é um `.*` disfarçado.
    for (const forbidden of [
      'react-intl',
      'react-i18next',
      'i18next',
      '@lingui/react',
      '@formatjs/intl',
      '@clube/shared/locales',
    ]) {
      expect(ALLOWED_IMPORTS.test(forbidden)).toBe(false);
    }
  });

  it('takes no runtime dependency beyond the editor', () => {
    /*
      ⚠️ ESTA ASSERÇÃO MUDOU DUAS VEZES, e as duas ficam registradas para quem
      a ler não achar que a regra foi afrouxada por conveniência.

      Era `expect('dependencies' in manifest).toBe(false)` — "nenhuma
      dependência de runtime", que era regra da FATIA 13 (seis componentes sem
      dependência nenhuma), não do pacote. A Tarefa 14 precisou de TipTap aqui
      (§1 do `docs/EDITOR.md`, decisão B) e a trocou por uma denylist de
      substring `i18n`, que deixava `react-intl` passar (medido).

      Agora é allowlist: o que este arquivo protege continua sendo "o `ui` não
      é dono de tradução", e passa a proteger mais — nenhuma dependência de
      runtime que não seja o editor, seja ela de i18n ou não.
    */
    const manifest: unknown = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    );

    if (typeof manifest !== 'object' || manifest === null) {
      throw new Error('package.json de @clube/ui não é um objeto');
    }

    const declared: unknown =
      'dependencies' in manifest ? manifest.dependencies : {};
    if (typeof declared !== 'object' || declared === null) {
      throw new Error('`dependencies` de @clube/ui não é um objeto');
    }

    const names = Object.keys(declared);

    // Sem esta linha a asserção abaixo é vazia (§7.4): um `package.json` lido
    // do lugar errado devolveria zero dependências e o filtro passaria
    // provando nada. E o `@tiptap/react` é o pino da decisão B: se ele sair
    // daqui, ou está no `app` (proibido) ou o editor não tem de onde vir.
    expect(names).toContain('@tiptap/react');
    expect(names).toContain('tippy.js');

    expect(names.filter((name) => !ALLOWED_DEPENDENCIES.test(name))).toEqual(
      [],
    );
  });
});
