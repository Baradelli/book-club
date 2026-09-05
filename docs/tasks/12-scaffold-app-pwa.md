# Tarefa 12 — Scaffold do `packages/app`: Vite + PWA, tema, i18n, rotas e cliente HTTP

> Abre o **Bloco D** e vira a natureza do projeto: o backend do MVP 1 está fechado, e daqui em
> diante é interface. Esta fatia **não entrega nenhuma tela de produto** — entrega o chão em
> que as telas 15–21 vão nascer.
>
> Leia antes: `CLAUDE.md` (a seção de stack do front é taxativa),
> **`docs/CONVENCOES-CODIGO.md` §6.2** (o formato de erro da API — é a regra que mais afeta
> esta fatia) e §7, e `CONTEXT.md`.

## Objetivo

`pnpm dev:app` abre um PWA que fala com a API, guarda a sessão, troca de idioma e de tema, e
manda para o login quem não está autenticado. Nada além disso.

## Decisões já tomadas (do `CLAUDE.md` — não reabrir)

- **UM PWA responsivo** (`packages/app`). Nunca `web/` e `mobile/` separados.
- **Vite 5 + `vite-plugin-pwa`, NÃO Next.** React 18. `react-router-dom` 7, **URL por página**.
- **Tailwind v4 via `@tailwindcss/vite`. NÃO existe `tailwind.config.js`** — os tokens vivem em
  CSS (`packages/ui/src/theme.css`) e o app declara `@theme inline`.
- **i18n com react-i18next**, `pt` default e `en` segundo. **Nenhum texto solto na tela** —
  tudo via `t('chave')`, com **chaves semânticas em inglês** (`books.todayReading`).
- **Luxon só no backend.** O front calcula "que dia é hoje" com `Intl.DateTimeFormat`.
- **Schemas Zod vêm de `shared/`.** Nunca duplicar schema entre back e front.
- Sem CSS inline em telas reais. Ícones: `lucide-react`.

## ⚠️ A restrição que decide a forma desta fatia

### `packages/shared` é importado pelo BACKEND — nada nele pode tocar o navegador

O `BACKLOG.md` pede "cliente HTTP e token em `shared`". Mas `shared` é dependência do
`@clube/backend`, que roda em Node: **nenhum módulo de `shared` pode ler `import.meta.env`,
`window`, `localStorage` ou `document` no escopo de módulo.** Se ler, o backend quebra no
import — e quebra no boot, não em teste.

Então o desenho é o mesmo que o projeto já usa no domínio: **fábrica com dependências
injetadas**, não singleton que lê o ambiente.

```ts
// shared/src/client/ — puro, sem globais, testável sem DOM
export function createApiClient(config: {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}): ApiClient;

/** O mínimo de `localStorage` que precisamos — o app passa o real, o teste passa um fake. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function createTokenStorage(storage: StorageLike): TokenStorage;
```

Quem lê `import.meta.env.VITE_API_URL` e passa `window.localStorage` é o **`packages/app`**, num
lugar só. É a mesma separação de sempre: `shared` é o domínio da borda, o app é a
composição.

### O erro da API **nunca** vai cru para a tela

`docs/CONVENCOES-CODIGO.md` §6.2 fechou isto no backend, e a consequência cai aqui: as
mensagens de erro do Zod são **em inglês**, e `error.message` só existe na classe 400. A tela
**não pode** renderizar `message`. Ela mapeia `status` + `details[].path` em **chave de
i18n**.

É a primeira fatia em que essa regra tem um chamador. Se ela nascer torta aqui, todas as telas
de 15 a 21 herdam a torção — e o sintoma é o usuário vendo *"String must contain at least 1
character(s)"* em português no meio da tela.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **Clube ativo NÃO entra nesta fatia** | O `CONTEXT.md` já define o termo, e a tentação é montar o contexto agora. Mas o primeiro consumidor é o seletor da **Tarefa 16**, e o `WORKFLOW.md` diz que a interface cresce com quem a usa. Fica registrado, não construído. |
| B | **Refresh do token no boot do app**, não interceptador com retry | O token vive 15 dias e o `/auth/refresh` desliza a validade. Um interceptador que tenta refresh a cada 401 precisa de fila de requests pendentes e de proteção contra loop — complexidade sem caso de uso num app de sessão longa. Falhou o refresh, desloga. |
| C | **`registerType: 'autoUpdate'` no service worker** | O `prompt` exige UI de "nova versão disponível", que não existe. Um SW velho é pior. **Mas registre para a Tarefa 21**: quando existir rascunho local, uma atualização que recarrega no meio da digitação perde o texto — a menos que o rascunho já esteja em IndexedDB, que é exatamente o que a 21 constrói. |
| D | O **SW não cacheia `/api`** nesta fatia | Offline é Tarefa 21. Cachear resposta de API agora criaria dado velho invisível, e o `navigateFallback` engolindo chamada de API é o bug clássico de PWA. |
| E | **Tokens mínimos em `ui/theme.css`**, paleta completa na Tarefa 13 | O `CLAUDE.md` diz que os tokens vivem lá. Escrever o mecanismo no app e mover depois é churn. Esta fatia põe **o par fundo/texto e a borda**, claro e escuro; a 13 traz a paleta e os componentes. |
| F | Tema aplicado por **script inline no `index.html`** | Aplicar no `useEffect` do React pisca branco antes de virar escuro (FOUC), e é o tipo de defeito que ninguém registra como bug mas incomoda toda abertura. |
| G | `ApiError` distingue **falha de rede** de erro do servidor | A fila offline da Tarefa 21 precisa saber "não chegou" × "chegou e foi recusado" — sem essa distinção ela reenviaria coisa que o servidor já recusou. |

## Regras (o que os testes provam)

### Cliente HTTP — `shared/src/client/api-client.ts`

1. `createApiClient` é **fábrica pura**: nada em `shared` lê `import.meta.env`, `window`,
   `localStorage` ou `document` **em escopo de módulo**. (Teste: importar `@clube/shared` num
   ambiente Node sem DOM não estoura — é o que o backend faz hoje.)
2. Manda `Authorization: Bearer <token>` quando `getToken()` devolve token; **omite o header**
   quando devolve `null`.
3. `2xx` devolve o corpo parseado.
4. Erro da API vira **`ApiError`** com `status`, `error` e `details?`, validado por
   `errorSchema` de `shared`.
5. Corpo de erro **fora do formato** (um HTML de proxy, um 502 de gateway) vira `ApiError`
   genérico — **não** estoura no `JSON.parse`.
6. **Falha de rede** (fetch rejeita) vira `ApiError` distinguível: `status: 0`. É o que a
   Tarefa 21 usa para decidir reenviar.
7. `401` chama `onUnauthorized()` **uma vez** e lança.
8. **`404` NÃO desloga.** É o corte de tenant do projeto inteiro (sem membership → 404), e
   deslogar aqui tiraria da conta um membro legítimo que errou de clube. Teste explícito.
9. `403` não desloga (é `NotTheAuthorError`, da Tarefa 09).

### Token — `shared/src/client/token-storage.ts`

10. `createTokenStorage(storage)` guarda, lê e limpa, sob uma chave nomeada e constante.
11. **`storage` que estoura não derruba o app** (Safari em aba privada lança em `setItem`):
    `get` devolve `null`, `set` vira no-op silencioso. O app precisa abrir mesmo sem
    armazenamento.
12. Depois de `set`, o `getToken` do cliente já enxerga o token novo no request seguinte.

### i18n — `shared/src/locales/`

13. `pt` é o default; `en` é o segundo.
14. **`pt` e `en` têm exatamente o mesmo conjunto de chaves**, comparado recursivamente. É o
    teste que importa: chave faltando não quebra nada — o i18next renderiza a **própria
    chave** na tela, em inglês, e ninguém percebe até um usuário reclamar.
15. **Nenhum valor vazio** em nenhum dos dois catálogos.
16. Chaves semânticas em inglês.

### Erro da API → chave de i18n — `shared/src/client/api-error-key.ts`

17. `apiErrorKey(error: ApiError): string` devolve **chave**, nunca texto.
18. **Nunca** devolve `error.message` nem `error.error` crus.
19. `details[].path` conhecido vira chave do campo; `path` **desconhecido** cai numa chave
    genérica de campo inválido — **não** em texto em inglês.
20. Sem `details`, mapeia por `status` (400/401/403/404/409/413/500) em chaves genéricas.

### `RequireAuth` e rotas — `packages/app/src/`

21. Sem token → redireciona para `/login` **preservando o destino** (voltar para onde a pessoa
    queria ir depois de entrar).
22. Com token → renderiza a rota.
23. `/login` **com** token → manda para a home.
24. Rota desconhecida → tela de "não encontrado" do app, não tela branca.

### Tema

25. Primeira visita respeita `prefers-color-scheme`.
26. Escolha explícita **persiste** e vence a do sistema.
27. O tema é aplicado **antes da primeira pintura** (script inline no `index.html`), sem flash.

## Verificações de scaffold (checklist, não teste automatizado)

- `pnpm dev:app` sobe e responde; `pnpm --filter @clube/app build` gera `dist/`.
- **NÃO existe `tailwind.config.js`** em lugar nenhum do repositório.
- O manifest tem nome, `theme_color`, `display: standalone` e `lang: pt-BR`.
- O service worker **não** intercepta `/api`, e o `navigateFallback` **exclui** as chamadas de
  API.
- `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .` limpos, e a suíte do backend
  **continua nos mesmos números** (esta fatia não toca backend).

## Arquivos a tocar

```
packages/shared/src/client/    api-client.ts · token-storage.ts · api-error-key.ts · index.ts
                               + __tests__/ dos três
packages/shared/src/locales/   pt.ts · en.ts · index.ts + __tests__/ (regras 13–16)
packages/shared/package.json   nada de dep nova de navegador

packages/app/                  index.html · vite.config.ts · tsconfig · package.json
  src/                         main.tsx · App.tsx · router.tsx · env.ts (o ÚNICO que lê
                               import.meta.env) · i18n.ts · theme.ts
  src/auth/                    auth-context.tsx · require-auth.tsx · + teste
  src/pages/                   login.tsx (placeholder — a tela real é a Tarefa 15) ·
                               home.tsx (placeholder — Tarefa 16) · not-found.tsx
  src/styles.css               @import do tailwind + @theme inline
  public/                      manifest/ícones

packages/ui/src/theme.css      os tokens MÍNIMOS (fundo/texto/borda, claro e escuro)
```

**Não tocar:**

- `packages/backend/**` inteiro — inclusive `prisma/`. Esta fatia não tem backend. Confirme
  que a suíte do backend fica **exatamente** nos números atuais (948 unit · 261 integração).
- `packages/ui/src/index.ts` e os componentes — **Tarefa 13**. Aqui só o `theme.css` mínimo.
- `packages/ui/src/editor.css` — **Tarefa 14**.
- Os schemas de `shared/src/*.ts` que já existem (`auth`, `book`, `note`, …). Esta fatia
  **consome**, não altera.

## Fora de escopo

- **Qualquer tela de produto.** Login de verdade é a Tarefa 15; home é a 16. Aqui as páginas
  são placeholders que provam o roteamento.
- **Clube ativo** e seletor → Tarefa 16 (decisão A).
- Design system, componentes, paleta → Tarefa 13.
- Editor → Tarefa 14.
- Cache de API, rascunho local, fila offline, IndexedDB → Tarefa 21.
- Interceptador de refresh com retry (decisão B).
- Tela de "nova versão disponível" (decisão C).

## Definição de pronto

> Atualizada na **rodada de correção**: a auditoria injetou 20 mutantes e **9 sobreviveram**.
> Os números abaixo são os de depois — `shared` **253** (10 arquivos) · `app` **52** (8) ·
> `backend` **948** (41) unit e **261** (14) integração.

- [x] `createApiClient` e `createTokenStorage` com as regras 1–12; em especial **o 404 que não
      desloga** (8) e **o storage que estoura sem derrubar o app** (11).
      _19 testes em `api-client.test.ts` + 10 em `token-storage.test.ts`. Mutantes conferidos:
      o 404 deslogando, o header sempre presente, o `set` sem `try`, a rede virando 500 — os
      quatro acusam. **Correção:** o `JSON.parse` do ramo de SUCESSO ganhou acusador (um 200
      com `'<!doctype html>…'`, que é o `navigateFallback` engolindo a chamada de API), o
      token `''` ganhou caso próprio, e o `ZodError` de uma resposta fora do contrato passou a
      viajar no `cause` do `ApiError` em vez de ser descartado._
- [x] Nenhum módulo de `shared` toca navegador em escopo de módulo — e a **suíte do backend
      continua verde**, que é a prova real disso.
      _**O gate primário agora é o COMPILADOR:** `packages/shared/tsconfig.json` declara
      `"lib": ["ES2022"]` — sem `DOM` —, então `window`, `document`, `localStorage`,
      `location` e `matchMedia` viram erro de compilação no pacote, inclusive o que a
      varredura por regex não enumera (`globalThis.location?.href` e
      `globalThis.matchMedia?.()` passavam nas duas portas). Medido: sonda plantada em
      `client/` reprova no `tsc`; removida, `tsc` limpo.
      `shared/src/__tests__/no-browser-globals.test.ts` continua como rede de runtime (import
      em Node + varredura estática). Backend: 948 unit e 261 integração, md5 do pacote
      idêntico._
- [x] Catálogos `pt`/`en` com as regras 13–16, incluindo **o teste de paridade de chaves**.
      _12 testes em `locales/__tests__/catalogs.test.ts`. Três portas agora: o `en` é tipado
      `typeof pt`, o teste recursivo compara os conjuntos, e **o `t()` do app é tipado pelo
      catálogo** (`CustomTypeOptions` em `app/src/i18n.ts`) — é o lado CHAMADOR, que não
      existia: `t('app.nomeErrado')` compilava e a tela renderizava a própria chave. Medido:
      agora reprova no `tsc`. As cinco chaves sem chamador (`app.tagline`, `common.loading`,
      `common.retry`, `nav.home`, `nav.signIn`) foram removidas — com o `t()` tipado, esquecer
      de acrescentar uma na Tarefa 15 vira erro de compilação._
- [x] `apiErrorKey` com as regras 17–20 — **nenhum caminho devolve texto em inglês**.
      _30 testes. `API_ERROR_KEYS` é DERIVADA dos mapas e o teste de catálogo prova que toda
      chave que a função pode devolver existe em `pt` e em `en`. **Correção:** a busca usa
      `Object.hasOwn`, não `mapa[chave] ?? PADRAO` — o `??` não dispara para `constructor`,
      `toString`, `__proto__` e companhia, e a função devolvia o membro herdado de
      `Object.prototype` com o tipo dizendo `string`._
- [x] `RequireAuth` e rotas com as regras 21–24, incluindo **o destino preservado** (21).
      _11 testes em `auth/__tests__/require-auth.test.tsx`; o destino é asserido com
      comparação exata, agora com fixture de query string **e de hash**
      (`/books/abc?tab=plano#dia-3`) — o link de um dia do plano é justamente o que se manda
      no grupo._
- [x] **A fiação `AuthProvider` → `createApiClient` tem acusador.**
      _6 testes em `auth/__tests__/auth-context.test.tsx`, atravessando o Provider com
      `fetch` espião e storage fake. Mutantes conferidos: `getToken: () => null` (um app que
      manda TODA requisição sem `Authorization`) e `onUnauthorized` virando no-op sobreviviam
      aos 31 testes — **2 acusam cada um**. O `isAuthenticated` foi alinhado ao cliente HTTP:
      `token !== null && token !== ''`, senão um `''` no armazenamento marcava a pessoa como
      autenticada e mandava tudo sem header._
- [x] **A decisão B (refresh no boot) tem guarda.**
      _5 testes em `__tests__/app.test.tsx`: os rótulos do cabeçalho vêm do catálogo, **falha
      de rede no `/auth/refresh` NÃO limpa o token** (o mutante `.catch(() => signOut())`
      derrubava a sessão de 15 dias de quem abriu o app no metrô) e **401 limpa**._
- [x] Tema com as regras 25–27, incluindo **sem flash na abertura** (27).
      _9 testes em `__tests__/theme.test.ts` + 5 em `__tests__/index-html.test.ts` + **4 novos
      em `__tests__/theme-css.test.ts`**. As regras 25 e 26 moram no CSS, e não tinham
      acusador: inverter `prefers-color-scheme: dark` → `light` e trocar `[data-theme='dark']`
      por outro seletor passavam nos 31 testes. O teste novo lê `packages/ui/src/theme.css`
      (comentários removidos — o cabeçalho cita os dois seletores em prosa), pina o
      `THEME_ATTRIBUTE` dos dois lados e **compara os dois blocos escuros token a token** — a
      sincronia que o arquivo afirmava só em comentário (§7.1). **3 acusam** cada mutante.
      Em troca, `resolveTheme` foi APAGADA: era código morto com 4 testes citando as regras
      25/26 cujos únicos chamadores eram os próprios testes (o stub de `matchMedia` do
      `test-setup.ts` saiu junto, sem chamador)._
- [x] `pnpm --filter @clube/app build` gera `dist/` com service worker e manifest.
      _`dist/sw.js`, `dist/workbox-*.js`, `dist/manifest.webmanifest` (nome, `theme_color`,
      `display: standalone`, `lang: pt-BR`) e `dist/registerSW.js`._
- [x] **Não existe `tailwind.config.js`.**
      _`find . -name "tailwind.config.*"` fora de `node_modules`: 0 resultados._
- [x] **O `dark:` do Tailwind obedece o `data-theme`.**
      _`@custom-variant dark` em `app/src/styles.css`, espelhando a cascata de
      `@clube/ui/theme.css`. Medido antes: `dark:bg-red-500` compilava só para
      `@media (prefers-color-scheme:dark)`, sem nenhum `[data-theme]` — com OS escuro e
      "Claro" escolhido, os tokens ficavam claros e todo `dark:*` continuava escuro. Medido
      depois: o CSS emitido tem **os dois** seletores. A sonda foi removida e o `dist/`
      reconstruído limpo (`grep -c bg-red-500 dist/assets/*.css` → 0)._
- [x] O SW não intercepta `/api`.
      _`navigateFallbackDenylist: [/^\/api\//, /^\/docs\//]` e nenhum `runtimeCaching`; a
      única ocorrência de "api" no `dist/sw.js` é a própria denylist. **Correção:** a denylist
      e o `DEFAULT_API_URL` de `src/env.ts` eram a mesma decisão em dois arquivos sem pino
      cruzado — `__tests__/service-worker-config.test.ts` (3 testes) monta o literal esperado
      a partir da constante. Medido: mudar `DEFAULT_API_URL` sozinho acusa._
- [x] `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .` limpos; contagens coladas no
      relatório.
- [x] `packages/backend/**` intocado — **verificado**, não presumido.
      _md5 do conjunto de arquivos do pacote (sem `node_modules`) igual antes e depois, também
      na rodada de correção: `22d02e343c838e6a0401d7459b7dbefe`._
- [x] O que a fatia OBRIGA nas telas 15+ está registrado, não só decidido.
      _`docs/CONVENCOES-CODIGO.md` **§6.8**: campo de `*ResponseSchema` não se renomeia nem se
      remove sem deploy do front junto (campo novo é seguro, o `parse` faz strip; evolução
      entra `optional()` primeiro), e **um `ApiError` com `status` 2xx significa "o servidor
      aceitou e executou"** — a fila offline da Tarefa 21 não pode reenviar isso, e precisa de
      um discriminador explícito, não deduzido por faixa de status._
- [ ] Checklist marcada e linha 12 do `BACKLOG.md` fechada.
      _A checklist acima está marcada; a linha do `BACKLOG.md` é do dono e ficou `[ ]`._
