# Tarefa 15 — Telas de login e de aceite de convite

> A **primeira tela de produto** do projeto. Tudo antes dela foi domínio, persistência, chão e
> vocabulário; aqui uma pessoa digita e entra.
>
> Leia antes: `CLAUDE.md`, **`docs/CONVENCOES-CODIGO.md` §6.2 e §6.8** (o erro da API é o
> assunto central desta fatia), `docs/tasks/12-scaffold-app-pwa.md` (o cliente HTTP e o
> `RequireAuth`), `docs/tasks/13-design-system-ui.md` (`Button`, `Field`) e
> `docs/adr/0003-convite-por-link-sem-smtp.md`.

## Objetivo

Eu abro `/login` e entro. Minha esposa abre o link `/convite/:code` que eu mandei no WhatsApp,
escolhe a senha dela, e já está dentro do clube.

## Decisões já tomadas (não reabrir)

- **Não existe cadastro aberto.** A pessoa entra por convite, e é no aceite que ela define a
  própria senha. → ADR 0003.
- **Convite por link com código, uso único, sem SMTP.**
- **Formulários: React Hook Form + `@hookform/resolvers/zod`** (`CLAUDE.md`).
- **Os schemas vêm de `shared/`** — `loginSchema` e `acceptInviteSchema` já existem. **Nunca
  duplicar schema** entre back e front.
- **Nenhum texto solto**: tudo `t()`, chaves semânticas em inglês. O `t()` é **tipado** desde
  a Tarefa 12 — chave que não existe no catálogo **reprova no `tsc`**.
- Sessão de 15 dias com refresh no boot; sem membership → 404, não 403.

## ⚠️ Duas coisas que a leitura do código revelou

### 1. Importar um botão pode arrastar o editor inteiro para o bundle do login

O barril `packages/ui/src/index.ts` reexporta **tudo**, inclusive o `RichEditor`. Uma tela que
faça `import { Button } from '@clube/ui'` toca o barril, e o barril toca o TipTap — **+454 kB
brutos / +143 kB gzip**, medido na Tarefa 14.

Hoje isso **não** acontece: o Rollup faz tree-shaking pelo grafo de ES modules, e o bundle
atual tem **zero** TipTap (medido: `grep -ci 'prosemirror\|tiptap' dist/assets/*.js` → 0). Mas
é frágil — um `import` com efeito colateral em qualquer ponto da cadeia do editor derruba a
poda, e o sintoma é a tela de login ficar 5× maior **em silêncio**.

**Esta fatia é a primeira que importa componente de `ui/` numa tela de verdade.** Então ela
ganha a guarda: um teste que roda o build e **afirma que o bundle do app continua sem
TipTap**. É barato, e é o único jeito de a regressão não passar.

### 2. Um login que falha **não** pode deslogar — e hoje ele deslogaria

O `createApiClient` chama `onUnauthorized()` em **todo** 401, e no app esse callback é o
`signOut()`. Mas `POST /auth/login` com senha errada responde **401** — então errar a senha
dispara o caminho de "sessão morreu".

Hoje o dano é nulo (quem está no login não tem sessão), mas é uma armadilha montada: a mesma
tela é usada por quem tem token expirado, e o `RequireAnonymous` vai passar a mandar para o
destino preservado (a pendência abaixo). Um `signOut()` no meio disso embaralha os dois
caminhos.

**Resolução:** login e aceite são endpoints **públicos** e usam um cliente **sem**
`onUnauthorized` — o `createApiClient` já recebe isso por config, então é composição, não
código novo. E vira regra testada: **um login que falha não limpa token nenhum.**

## As duas pendências que esta fatia herda

### `RequireAnonymous` joga fora o destino que o `RequireAuth` preserva

Registrado na Tarefa 12: o `RequireAuth` grava `state.from` (com `pathname`, `search` e `hash`)
e o `RequireAnonymous` faz `<Navigate to={HOME_PATH} replace />` **incondicionalmente**. Quem
abre `/books/abc#dia-3` sem sessão vai para o login, entra, e **cai na home**. O helper
`isFromLocationState` existe e **não tem chamador de produção**.

Esta fatia conserta: o `RequireAnonymous` e a tela de login passam a **ler** o `from`.

**E acrescenta uma guarda que não existia:** o `from` só é aceito se for **caminho interno**.
Hoje ele só é escrito pelo nosso `Navigate`, então não é explorável — mas basta alguém ler
`from` de query string um dia para virar *open redirect*, e a validação custa três linhas.

### A decisão do `Field.error`: string traduzida × string da API

O docblock do `Field` deixou a pergunta aberta, medida e não resolvida: `error?: string` aceita
`apiError.message` **sem uma objeção do compilador ou de um teste**, e nenhum teste de runtime
distingue uma string traduzida de uma string da API — as duas são `string`.

**Decisão: regra de ESLint, não tipo nominal.** O tipo nominal (`TranslatedText`) fecha de
verdade, mas contamina **toda** assinatura de texto do design system (`label`, `hint`, `title`,
`closeLabel`, …) e obriga um helper de marca em cada `t()` das sete telas restantes. Para um
app de duas pessoas, é desproporcional. A regra de ESLint pega a forma realista — o
`error={algo.message}` no JSX — custa uma entrada de config, e fica registrado que **se ela
falhar na prática, a escalada é o tipo nominal**.

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | **O aceite é um formulário "cego"** | Não existe `GET /invites/:code` público, então a tela **não sabe** de qual clube é o convite nem se ele expirou até enviar. Aceito para o MVP 1: o link chega pelo WhatsApp de quem convidou, então a pessoa sabe. **Registrado como lacuna** — um endpoint de prévia deixaria a tela dizer "Você foi convidada para o Clube do Casal" e recusar código expirado **antes** de a pessoa digitar a senha. É backend, e o backend está fechado. |
| B | O `clubId` da resposta do aceite é **guardado para a Tarefa 16** | Ele é o "clube ativo" natural de quem acabou de entrar, e a Tarefa 16 é dona do seletor. Usá-lo aqui exigiria construir o contexto de clube ativo fora da fatia dele. |
| C | **Sem tela de "esqueci minha senha"** | Não existe SMTP (ADR 0003) e o reset é do super-admin (MVP 4, Tarefa 39). Uma tela que não pode funcionar é pior que a ausência dela. |
| D | Sem "manter conectado" | O token já vive 15 dias e desliza no boot. Um checkbox que não muda nada é ruído. |
| E | As duas telas usam `Field` + `Button` da Tarefa 13, **sem componente novo** | Se aparecer necessidade de componente, ele nasce em `ui/` com teste — mas o objetivo desta fatia é provar que o design system serve. |
| F | `autoComplete` explícito nos quatro campos | Sem ele o gerenciador de senha não oferece salvar, e isso quebra em silêncio: a pessoa fica digitando a senha toda noite. |

## Regras (o que os testes provam)

### O destino preservado (a pendência da Tarefa 12)

1. `RequireAnonymous` com sessão vai para o `state.from` quando ele existe; para a home quando
   não existe.
2. Depois de entrar, a tela de login navega para o `from`; sem `from`, para a home.
3. O `from` preserva `search` **e** `hash` (`/books/abc?tab=plano#dia-3`).
4. **`from` que não é caminho interno é ignorado** — não começa com `/`, ou começa com `//`, ou
   tem esquema (`https://`, `javascript:`). Cai na home.

### Login

5. Valida com o `loginSchema` de `shared` — **não** existe schema novo no app.
6. E-mail com espaço nas pontas é aceito (o `.trim()` do schema roda antes do `.email()`).
7. Campo inválido **marca o campo** (via `Field`), não um alerta genérico no topo.
8. **401 não desloga e não limpa token** (⚠️ 2), e mostra mensagem de credencial inválida.
9. Falha de rede mostra a mensagem de rede — distinguível de erro do servidor (é o
   `status: 0` da Tarefa 12).
10. **Enviar duas vezes não faz dois requests** (o `loading` do `Button` desabilita).
11. `autoComplete="email"` e `autoComplete="current-password"`.
12. Sucesso guarda o token e navega.

### Aceite de convite

13. Valida com o `acceptInviteSchema` de `shared` (senha de **8** caracteres no mínimo).
14. O `code` vem **da URL**, nunca de um campo — e não aparece no corpo do formulário.
15. **404 (código inexistente) e 410 (expirado) têm mensagens diferentes.** São os dois erros
    que a pessoa mais vai ver, e "não encontrado" para um convite vencido manda ela procurar o
    link errado.
16. 409 (e-mail já em uso) **marca o campo de e-mail**.
17. `autoComplete="new-password"`.
18. Sucesso guarda o token e navega.

### O erro da API na tela (§6.2 e §6.8 — o assunto central)

19. **Nenhuma mensagem vinda da API aparece na tela.** Tudo passa por `apiErrorKey` + `t()`.
    Teste: um erro cujo `error` é uma frase reconhecível em inglês não aparece em lugar nenhum
    do DOM.
20. `details[].path` conhecido marca **o campo certo** (`email` no campo de e-mail,
    `password` no de senha).
21. Status sem mapeamento cai em mensagem genérica traduzida, nunca em inglês.
22. A **regra de ESLint** existe e pega `error={x.message}` no JSX. Prove: plante a forma e
    confirme que o `lint` reprova.

### i18n e bundle

23. Nenhum texto solto nas duas telas; as chaves novas entram em **`pt` e `en`** (o `t()`
    tipado reprova no `tsc` se faltar).
24. **O bundle do app continua sem TipTap** (⚠️ 1) — teste que roda o build e afirma. É a
    guarda que impede a tela de login crescer 5× em silêncio.

### O que **não** se testa

Aparência, posicionamento, snapshot de markup, "renderiza sem erro". O `Field`, o `Button` e o
foco já têm cobertura própria na Tarefa 13 — não a repita aqui.

## Arquivos a tocar

```
packages/app/src/pages/login.tsx              a tela de verdade (hoje é placeholder)
packages/app/src/pages/accept-invite.tsx      NOVA
packages/app/src/pages/__tests__/             os testes das regras 5–21
packages/app/src/auth/require-auth.tsx        o `from` (regras 1–4)
packages/app/src/auth/__tests__/              crescer
packages/app/src/router.tsx                   +/convite/:code (público)
packages/app/src/auth/auth-context.tsx        o cliente público sem `onUnauthorized` (⚠️ 2)
packages/app/src/__tests__/bundle-guard.test.ts   NOVO (regra 24)
packages/app/package.json                     +react-hook-form, +@hookform/resolvers
packages/shared/src/locales/{pt,en}.ts        as chaves das duas telas
eslint.config.js                              a regra do `error={...message}` (regra 22)
```

**Não tocar:**

- `packages/backend/**` e `prisma/` — a suíte fica em **948 / 261**. **Não** crie o
  `GET /invites/:code` (decisão A).
- `packages/ui/**` — o design system e o editor estão fechados e auditados. Se faltar
  componente, **pare e reporte** (decisão E).
- O `createApiClient`/`apiErrorKey`/`createTokenStorage` de `shared/src/client/` — esta fatia
  **compõe**, não altera. Se precisar mudar o cliente, **pare e reporte**.
- `packages/app/src/{i18n,theme,env}.ts` — fechados na Tarefa 12.

## Fora de escopo

- **Clube ativo e seletor** → Tarefa 16 (e é lá que o `clubId` do aceite é usado).
- Home de verdade, lista de livros → Tarefa 16.
- "Esqueci minha senha" (decisão C), cadastro aberto, SMTP.
- Prévia do convite (decisão A) — é backend.
- Editor, autosave, offline.

## Definição de pronto

> Contagens desta rodada: `shared` **253** (10) · `ui` **173** (20) · `app` **152** (14) ·
> `backend` **948** (41) unit e **261** (14) integração.

- [x] As regras 1–4: o destino preservado funciona ponta a ponta, **e `from` externo é
      ignorado**.
      _`RequireAnonymous` passou a ler `location.state`, e o `internalPath` é a guarda:
      recusa o que não começa com `/`, o `//`, o `/\` e o que tem espaço ou caractere de
      controle (tab/CR/LF, que o navegador REMOVE da URL antes de resolvê-la — `/<TAB>/x`
      volta a ser `//x`). 15 testes novos em `auth/__tests__/require-auth.test.tsx` (33 no
      arquivo). Mutantes medidos, os 3 acusam: `RequireAnonymous` voltando ao `HOME_PATH`
      fixo, a guarda de `//`+`/\` apagada (4 vermelhos), a guarda de controle apagada._
- [x] Login com as regras 5–12; em especial **401 não limpa token** (8) e **duplo envio não
      duplica request** (10).
      _16 testes em `pages/__tests__/login.test.tsx`. O 401 é resolvido pelo `publicApi`
      novo (`auth-context.tsx`), um `createApiClient` sem `onUnauthorized` — composição, sem
      tocar `shared/src/client/`. Mutantes: `publicApi` → `api` ACUSA; `loading={false}`
      ACUSA; `navigate` sempre para a home ACUSA._
- [x] Aceite com as regras 13–18; em especial **404 ≠ 410** (15).
      _13 testes em `pages/__tests__/accept-invite.test.tsx`. Mutantes: 404 e 410 com a
      mesma chave ACUSA; `code` viajando no corpo ACUSA; 409 sem `field: 'email'` ACUSA._
- [x] **Nenhuma string da API na tela** (19), com o teste do texto em inglês ausente do DOM.
      _Duas frentes: `pages/form-errors.ts` (20 testes) prova que nenhum caminho devolve
      texto, só chave; e as telas provam a ausência no DOM com as frases reais da API
      (`Unauthorized`, `String must contain at least 1 character(s)`, `password must have at
      least 8 characters`) — com asserção positiva ao lado, para não ser asserção vazia
      (§7.4)._
- [x] A **regra de ESLint** existe e reprova a forma plantada (22).
      _`no-restricted-syntax` sobre `packages/app/src/**/*.tsx`, dois seletores (prop de JSX
      e filho de JSX). Medido: `error={apiMessage?.message}` plantado em `login.tsx` →
      `eslint` reprova em `116:18`; removido → limpo. Ela também barra
      `errors.email?.message` do React Hook Form, que com o `zodResolver` é a frase do Zod
      **em inglês** — o mesmo defeito pela porta do formulário._
- [x] As chaves em `pt` e `en`; nenhum texto solto (23).
      _13 chaves novas (`pages.login.*` e `pages.acceptInvite.*`), `pages.login.scaffold`
      removida junto com o placeholder. O `t()` tipado é a porta: chave que falte reprova no
      `tsc`, e os mapas desta fatia (`FIELD_KEYS`, `BY_STATUS`) são tipados `ParseKeys`._
- [x] **O bundle do app sem TipTap**, por teste de build (24) — com o número colado no
      relatório.
      _⚠️ **A GUARDA FICOU VERMELHA, e a spec estava errada**: a poda nunca funcionou — a
      medição de "zero TipTap" da Tarefa 14 foi feita quando nenhuma tela importava de
      `@clube/ui`. Com o primeiro `import { Button }`, o bundle foi para **684 kB** com
      ProseMirror dentro. Causa: `@tiptap/starter-kit` e `@tiptap/pm` não declaram
      `sideEffects`, e `packages/ui` também não. Conserto app-side em `vite.config.ts`
      (`treeshake.moduleSideEffects` isentando as duas famílias): **342 kB / 107 kB gzip**,
      `grep -ci 'prosemirror|tiptap'` → **0**. Medido também que a isenção NÃO apaga o
      editor de quem o usa: com o `RichEditor` numa tela, 796 kB e 79 marcas. O conserto
      durável é em `packages/ui` (separar a entrada do editor do barril) — fora do alcance
      desta fatia._
- [x] Nenhum componente novo em `ui/`; nenhuma alteração em `shared/src/client/`.
      _Verificado por `find -newermt`: nada em `packages/ui/**`, nada em
      `packages/shared/src/client/**`, nada em `packages/backend/**`. ⚠️ **Achado
      registrado**: o design system entrega o `Field` e nenhum CONTROLE, então a primeira
      tela real decidiu altura/borda/raio do `input` — em `pages/form-styles.ts`, num lugar
      só. É candidato a `TextInput` em `ui/`, e é decisão do dono (decisão E)._
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens coladas.
- [x] Backend em **948 / 261** — verificado.
- [ ] Checklist marcada e linha 15 do `BACKLOG.md` fechada.
      _A checklist acima está marcada; a linha do `BACKLOG.md` é do dono e ficou `[ ]`._

## Registrado na execução — divergências entre a spec e o contrato real

1. **O 409 do aceite não é "e-mail já em uso".** A regra 16 supõe isso, e o
   `AcceptInvite` **não lança `EmailAlreadyInUseError`** — e-mail já cadastrado é o caminho
   de **sucesso** ali (a pessoa reaproveita a conta e ganha o clube novo). Os dois erros que
   viram 409 são `InviteAlreadyUsedError` e `DuplicateMembershipError`, e o corpo não traz
   discriminador (§6.2: texto genérico por status fora da classe 400). A regra 16 foi
   cumprida como escrita — o 409 marca o campo de e-mail —, e a **frase** é honesta sobre os
   dois casos. Se o dono quiser precisão, é backend: um `details` ou classes de erro
   distintas.
2. **A premissa do ⚠️ 1 estava invertida** — ver o item 24 acima. Não era "a poda funciona e
   é frágil"; era "não havia o que podar".
3. **`Field` sem controle** — ver o penúltimo item da checklist.

## Rodada de correção — o que a auditoria por mutação mudou

> Contagens depois da rodada: `shared` **255** (10) · `ui` **173** (20) · `app` **163** (14) ·
> `backend` **949** (41) unit e **262** (14) integração. A checklist acima NÃO foi remarcada e
> a linha do `BACKLOG.md` continua do dono.

47 mutantes injetados, 11 sobreviventes. Os itens abaixo **emendam** o que está escrito acima:

1. **A regra 3 não estava provada.** O `renderAt` de `require-auth.test.tsx` montava
   `initialEntries={[{ pathname: '/books/abc?tab=plano#dia-3' }]}`, e o react-router **não
   parseia** um `pathname` entregue como campo: `search` e `hash` ficavam `''`, então
   `${pathname}${search}${hash}` **era** o `pathname` e o mutante que joga as duas fora ficava
   verde nos 33 testes. Conserto: `parsePath(path)` ali e no `harness.tsx` (que tinha a mesma
   armadilha, ainda sem morder — ela morderia na Tarefa 16). → `docs/CONVENCOES-CODIGO.md`
   §7.6.1.
2. **A regra 19 falhava para quem depende dela.** A prova era `document.body.textContent`, que
   só vê nós de texto: com a frase da API num `title`/`aria-label` — justamente o que o leitor
   de tela fala — os 152 testes continuavam verdes. Conserto: `readableText()` no `harness`,
   que varre texto **+** `title`, `aria-label`, `placeholder`, `alt` e `value`.
3. **A regra 10 não existia na tela de aceite**, onde custa mais: o convite é de uso único, e
   dois toques faziam a pessoa que ACABOU de entrar ler "este convite não vale mais".
4. **O item 24 desta spec está superado.** A isenção de `treeshake.moduleSideEffects` do
   `vite.config.ts` foi **apagada**, e com ela a atribuição causal que estava escrita nela
   (metade da isenção era peso morto, e o `EDITOR_ONLY_PACKAGES` sobrescrevia o
   `"sideEffects"` que o próprio `tippy.js` declara). O conserto durável foi feito **em
   `packages/ui`** — o `RichEditor` saiu do barril e ganhou a entrada `@clube/ui/editor`, e o
   pacote passou a declarar `"sideEffects": ["**/*.css"]`. Bundle: **342.579 B / 0 marcas**,
   sem exceção nenhuma. A tabela das quatro combinações medidas está no docblock do
   `vite.config.ts`.
5. **A divergência 1 acima (o 409 do aceite) foi consertada no backend**, não só registrada:
   `InviteAlreadyUsedError` virou **410** (`handle-domain-error.ts`), junto de
   `InviteExpiredError` — "venceu" e "já foi usado" são a mesma frase para quem lê. Com isso o
   **409 significa só `DuplicateMembershipError`**, e a regra 16 (marcar o campo de e-mail)
   passou a estar correta em vez de errada metade das vezes: antes, um convite já usado punha
   `aria-invalid="true"` num e-mail válido e, por ser erro de campo, ficava **fora de qualquer
   `role="alert"`** — quem usa leitor de tela não ouvia nada. O **404 continua ambíguo**
   (`InviteNotFoundError` + `ClubNotFoundError`) e a frase foi reescrita para não mandar
   conferir com convicção um link que pode estar certo.
6. **A regra 16 continua cumprida, e agora a spec dela está certa.** `EmailAlreadyInUseError`
   segue não sendo lançado pelo `AcceptInvite` — e-mail já cadastrado é o caminho de sucesso.
