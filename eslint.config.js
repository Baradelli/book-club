import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.*',
      '**/prisma/migrations/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    /**
     * O `push-handler.js` RODA NUM SERVICE WORKER, e ali o `self` global
     * existe — mas o ESLint só sabe disso se alguém disser.
     *
     * MEDIDO na Tarefa 38: a spec da fatia afirmava que `pnpm lint` NÃO olha
     * para este arquivo (por ele não passar pelo TypeScript nem pelo bundler).
     * Olha sim — o `eslint .` da raiz varre `.js` também, e o
     * `js.configs.recommended` traz `no-undef`: sem este bloco, o arquivo dava
     * **5 erros de `'self' is not defined`**.
     *
     * E é bom que olhe: este é o único arquivo do projeto que roda fora do app,
     * onde uma exceção não aparece no console de ninguém. O lint é a segunda
     * rede dele; a primeira é `packages/app/src/__tests__/push-handler.test.ts`,
     * que o LÊ do disco e o executa com um `self` de mentira.
     */
    files: ['packages/app/public/*.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        clients: 'readonly',
        registration: 'readonly',
      },
    },
  },
  {
    // O `code` do convite e o segredo de entrada no clube: nada no backend
    // sorteia com PRNG previsivel. Use randomInt/randomUUID de node:crypto.
    files: ['packages/backend/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Math.random is not cryptographically secure. Use randomInt or randomUUID from node:crypto.',
        },
      ],
    },
  },
  {
    /**
     * A GUARDA DE FUSO, e por que ela é do lint e não de um teste.
     *
     * A coluna `ReadingPlanItem.date` é `@db.Date` e o Prisma a devolve em
     * meia-noite UTC. Ler esse `Date` com getter LOCAL desloca de um dia em
     * todo fuso negativo — é o bug "o plano do dia 5 aparece no dia 4".
     *
     * O problema é que a proteção por teste depende do fuso de quem roda:
     * trocar `toISOString` por getters locais é acusado por 24 testes numa
     * máquina em UTC−3 e por ZERO num CI a UTC. Então a rede que não depende
     * de fuso é estática, como a do Math.random acima.
     *
     * Escopo: só `repositories/`, que é onde a tradução CalendarDay ↔ coluna
     * mora (`calendar-day-mapper.ts`) e o único lugar do backend que toca em
     * `Date` vindo do banco.
     */
    files: ['packages/backend/src/repositories/**/*.ts'],
    // Os testes do mapper usam os getters locais DE PROPÓSITO, para
    // documentar a divergência que obriga o UTC. Isentá-los é o ponto.
    ignores: ['**/__tests__/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'MemberExpression[computed=false][property.name=/^(getFullYear|getMonth|getDate|getDay|getHours|toLocaleDateString|toDateString)$/], MemberExpression[computed=true][property.value=/^(getFullYear|getMonth|getDate|getDay|getHours|toLocaleDateString|toDateString)$/]',
          message:
            'Local Date getters shift a calendar day by one in any negative timezone: the @db.Date column comes back as midnight UTC. Use toISOString().slice(0, 10) via dateToCalendarDay, and new Date(`${day}T00:00:00.000Z`) via calendarDayToDate.',
        },
      ],
    },
  },
  {
    /**
     * A DECISÃO DO `Field.error`: REGRA DE LINT, NÃO TIPO NOMINAL.
     *
     * O docblock de `FieldProps.error` (Tarefa 13) deixou a pergunta aberta e
     * medida: `error?: string` aceita `apiError.message` **sem uma objeção do
     * compilador ou de um teste**, e nenhum teste de runtime distingue uma
     * string traduzida de uma string da API — as duas são `string`.
     *
     * As duas saídas eram tipo nominal (`TranslatedText`) ou regra de lint. O
     * tipo nominal fecha de verdade, e contamina TODA assinatura de texto do
     * design system (`label`, `hint`, `title`, `closeLabel`, …), obrigando um
     * helper de marca em cada `t()` das sete telas restantes. Para um app de
     * duas pessoas é desproporcional. A regra abaixo pega a forma realista — o
     * `.message` dentro do JSX — por uma entrada de config. **Se ela falhar na
     * prática, a escalada é o tipo nominal.**
     *
     * E ela vale para MAIS que o erro da API: com o `zodResolver`,
     * `formState.errors.email.message` é a frase do **Zod, em inglês**
     * (*"String must contain at least 1 character(s)"*) — o mesmo defeito pela
     * porta do formulário. As duas telas da Tarefa 15 mapeiam campo → chave de
     * catálogo (`pages/form-errors.ts`) e não leem `.message` de nada.
     *
     * Escopo: os `.tsx` do app, que é onde JSX existe. O `packages/ui` não
     * entra porque componente de lá não conhece i18n nem a API (decisão B da
     * Tarefa 13) — e o teste `no-i18n.test.ts` já guarda aquela ponta.
     */
    files: ['packages/app/src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXAttribute > JSXExpressionContainer MemberExpression[property.name='message']",
          message:
            'Nunca passe `.message` para uma prop de JSX: o `message` de um ApiError e o de um erro do React Hook Form sao texto em INGLES (mensagem do Zod ou texto generico por status — docs/CONVENCOES-CODIGO.md 6.2). Traduza antes: `apiErrorKey(error)` + `t()`, via `pages/form-errors.ts`.',
        },
        {
          selector:
            "JSXElement > JSXExpressionContainer MemberExpression[property.name='message']",
          message:
            'Nunca renderize `.message` na tela: o `message` de um ApiError e o de um erro do React Hook Form sao texto em INGLES. Traduza antes com `apiErrorKey(error)` + `t()`, via `pages/form-errors.ts`.',
        },
      ],
    },
  },
  prettier,
);
