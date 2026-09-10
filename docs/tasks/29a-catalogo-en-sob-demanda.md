# Tarefa 29a — O catálogo `en` sai do chunk de entrada

> **Fatia inserida, e o motivo é um número.** Ela não entrega funcionalidade nova: entrega
> **folga**, e a entrega antes de a primeira tela do MVP 3 nascer. O MVP 2 inseriu a `26a` pelo
> mesmo critério (uma fatia curta que as seguintes precisavam).
>
> Leia antes: `CLAUDE.md` (a seção de i18n), `docs/CONVENCOES-CODIGO.md` **§7.9** (guarda de
> vocabulário mora no catálogo e percorre **os dois** locales — esta fatia **não pode**
> enfraquecer isso) e **§7.4** (asserção vazia).
>
> **Os vizinhos:** `packages/app/src/i18n.ts` (o `createI18n` e o `pickInitialLocale`),
> `packages/app/src/App.tsx` (o seletor de idioma), `packages/shared/src/locales/index.ts`,
> `packages/app/src/__tests__/bundle-guard.test.ts` (o teto e o padrão de asserção sobre o
> bundle emitido).

## Objetivo

Quem abre o app em português para de baixar o catálogo em inglês — e toda chave nova que o
MVP 3 escrever passa a custar o chunk de entrada **uma** vez, não duas.

## O número que decidiu a fatia

Medido por mutação nesta máquina, com o protocolo completo (`md5sum` antes → mutar → confirmar
por leitura → build → restaurar com `cp -p` → `md5sum -c` + `diff` limpos):

```
chunk de entrada hoje                                424.995 B   (teto 450.000, folga 25.005)
sem o `en` em `resources`, re-export do barrel MANTIDO  415.412 B
                                                     ─────────
                                                      9.583 B liberados → folga ~34.588 B
```

⚠️ **E a medição derrubou metade do escopo que eu tinha imaginado.** Eu esperava ter de apagar
o `export { en } from './en'` do barrel e reescrever os **10 arquivos de teste** que importam
esse binding (6 em `packages/app`, 4 em `packages/shared`). **Não é preciso:** com o `en` fora
de `resources`, o Rollup **tree-shaka o re-export não usado** — nenhum código de runtime do app
lê o binding `en`, e os 9.583 B saem do mesmo jeito. Os 10 arquivos de teste ficam
**intocados**.

## Escopo enxuto

**Entra:** o `en` sai de `resources`, ganha subpath próprio para poder virar chunk, e o app o
carrega por `import()` + `addResourceBundle` quando (e só quando) alguém escolhe inglês.

| Fora | Por quê |
| --- | --- |
| Chunk lazy por rota | É a **segunda** opção registrada no plano do MVP 3, para quando esta não bastar. Fazer as duas juntas confunde a medição: eu não saberia qual devolveu o quê. |
| Elevar o teto de 450.000 | **Não é opção**, por decisão registrada. Se uma fatia estourar, o certo é o chunk lazy, não o número maior. |
| Apagar o segundo catálogo | É a **pergunta 7 do MVP 1**, sem resposta. Esta fatia torna o `en` **mais** barato de manter, o que é neutro em relação àquela decisão. |
| Tirar o `pt` do chunk | Ele é o `fallbackLng` e o idioma padrão do clube: carregá-lo sob demanda atrasaria a **primeira** tela de todo mundo para economizar em ninguém. |
| Traduzir a barra do editor (as 33 strings cravadas em `ui`) | Pergunta 6 do MVP 2, sem resposta, e ela depende da 7 do MVP 1. |
| Reescrever os 10 testes que importam `en` do barrel | **Medido acima: desnecessário.** Mexer neles seria churn sem byte nenhum de retorno. |

## Decisões já tomadas (não reabrir)

- **`pt` é o padrão e o fallback**; `en` é o segundo locale. → `CLAUDE.md`.
- **Nenhum texto solto nas telas**: tudo via `t('chave')`, chaves semânticas em inglês.
- **A paridade `pt`/`en` é dupla-porta**: o compilador (`en: typeof pt`) e o teste recursivo de
  `catalogs.test.ts`. Esta fatia **não** afrouxa nenhuma das duas.
- ⚠️ **As guardas de vocabulário do §7.9 percorrem `pt` E `en`** (anti-culpa e privacidade do
  ADR 0002). Elas vivem em `packages/shared/src/locales/__tests__/` e importam os catálogos
  **direto**, não via `resources`. Esta fatia **não pode** fazer nenhuma delas passar a ver só
  metade dos idiomas — foi assim que uma frase proibida em `en` passou em **1.146 testes**.
- **Teto do chunk de entrada: 450.000 B, não relaxado.**

## Decisões que assumi (revisar antes de executar)

| # | Decisão | Alternativa e por que não |
|---|---|---|
| A | ⚠️ **O `en` ganha subpath próprio** (`"./locales/en": "./src/locales/en.ts"` no `exports` do `packages/shared/package.json`), e é dele que o `import()` dinâmico carrega | Sem subpath, o único alvo seria `import('@clube/shared/locales')` — o **barrel**, que já está inteiro no chunk de entrada. O Rollup não criaria chunk nenhum: ele veria o binding `en` **usado** e o traria de volta para a entrada, desfazendo a fatia em silêncio. O subpath é o que dá ao bundler uma fronteira para cortar. |
| B | **O `export { en } from './en'` do barrel FICA** | Medido: ele é tree-shaken e não custa byte (415.412 B **com** ele). Apagá-lo obrigaria a reescrever 10 arquivos de teste por zero bytes — e o §7.9 depende de as guardas de catálogo alcançarem o `en` sem cerimônia. |
| C | ⚠️ **`resources` passa a significar "os catálogos EAGER", e o nome muda junto** | Deixar o nome `resources` com um só locale dentro é a prosa que mente (§7.1 aplicado a nome): quem ler vai achar que o app tem um idioma. Renomear para `eagerResources` (ou equivalente que **diga** a nova verdade) faz o compilador apontar todo chamador. |
| D | ⚠️ **Duas asserções de `catalogs.test.ts` deixam de descrever a verdade e são TROCADAS, nunca apagadas nem afrouxadas** | São `exposes both catalogs in resources (rule 13)` e `narrows to a key of resources…`. A segunda prova hoje que `Locale` ≡ chaves de `resources`, e essa identidade **quebra por decisão**. A substituta tem de pinar a verdade nova: `Locale` continua sendo `['pt','en']`, e `resources` passa a ser o **subconjunto eager**. Apagar a segunda deixaria o conjunto `Locale` sem nenhum acusador estrutural. |
| E | **O carregamento é disparado em dois lugares, e os dois são testados**: no boot (quando a escolha inicial já é `en`) e na troca de idioma pelo seletor | Só no seletor deixaria quem tem o navegador em inglês com a tela em português para sempre — o pior dos dois mundos, e silencioso. |
| F | ⚠️ **Depois do `addResourceBundle` vem um `changeLanguage`** | `addResourceBundle` sozinho **não** re-renderiza o React: o i18next guarda o pacote e ninguém avisa a árvore. O sintoma seria a tela ficar em `pt` até o próximo clique, que é indistinguível de "a tradução não chegou". |
| G | **Falha do `import()` cai no `pt`, sem tela de erro** | Rede caída no meio de uma troca de idioma não é motivo para quebrar o app: o `fallbackLng` já é `pt` e a pessoa vê conteúdo, não um erro. Registrar no `console` e seguir. |
| H | **A guarda nova é do tipo "só pode melhorar"** | O `bundle-guard` ganha uma asserção de que uma frase **exclusiva do `en`** não está no chunk de entrada. É o padrão que o MVP 2 usou para as strings cravadas em `ui`: pina o fato e deixa a asserção só poder cair. |

## Regras (o que os testes provam)

### O contrato do pacote

1. `packages/shared/package.json` ganha `"./locales/en": "./src/locales/en.ts"` no `exports`
   (decisão A). Os subpaths existentes (`.`, `./client`, `./locales`, `./anti-culpa`,
   `./adr-0002`) **não mudam**.
2. `packages/shared/src/locales/en.ts` importa `pt` como **`import type`**, para o binding não
   ter chance de sobreviver à elisão. `export const en: typeof pt` continua igual — a porta do
   compilador não se toca.
3. O barrel **mantém** `export { en } from './en'` (decisão B). Os 10 arquivos de teste que o
   importam ficam **intocados** — e isso é verificável: `git status` neles vazio.

### O que o app carrega

4. `resources` (renomeado por C) contém **só** `pt`. O `i18next.init` recebe só ele.
5. ⚠️ Escolha inicial `en`: o catálogo é carregado por `import()` e registrado por
   `addResourceBundle('en', 'translation', …)`, seguido de `changeLanguage('en')` (decisão F).
   O teste prova a **re-renderização**, não só que o pacote foi registrado.
6. Escolha inicial `pt`: **nenhum** `import()` acontece — provado por **contagem** (§7.3), não
   por ausência de erro.
7. Trocar `pt → en` pelo seletor carrega o catálogo e traduz a tela. Trocar `en → pt` **não**
   carrega nada.
8. ⚠️ Trocar `pt → en → pt → en` carrega o catálogo **uma vez só**: `importCalls === 1`. Sem
   isso, cada toque no seletor é um pedido de rede.
9. `import()` que rejeita: a tela fica em `pt`, **não** quebra, e nada de erro aparece para a
   pessoa (decisão G).
10. A escolha continua sendo persistida sob a mesma chave (`clube.locale`), e
    `pickInitialLocale` **não muda de comportamento** — os 11 testes de `i18n.test.ts` que já
    existem continuam verdes sem edição.

### As guardas que não podem enfraquecer

11. ⚠️ **`catalogs.test.ts` continua provando a paridade recursiva `pt` ↔ `en`.** Ele importa
    os catálogos direto, não via `resources` — se o executor precisar mudar esse import, ele
    aponta para `../en`, e a paridade continua de pé.
12. ⚠️ **As guardas do §7.9 continuam percorrendo os DOIS locales**: `anti-guilt.test.ts`,
    `adr-0002.test.ts` e `offline-save-tone.test.ts`. Prova pedida no relatório: plante uma
    frase proibida no `en.ts`, rode, **conte os acusadores**, restaure com prova. Se o número
    cair em relação a antes da fatia, a fatia está errada.
13. ⚠️ As duas asserções da decisão D são **trocadas**, com o nome do teste dizendo a verdade
    nova. O relatório cola o nome antigo e o novo, lado a lado.

### O bundle

14. ⚠️ **Chunk de entrada em BYTES, colado.** Antes: **424.995 B**. Projeção medida:
    **~415.4 kB**. Teto **450.000 não relaxado**.
15. O catálogo `en` sai num chunk **próprio**, e o relatório cola o nome e o tamanho dele.
16. ⚠️ O `bundle-guard` ganha a asserção da decisão H: uma frase **exclusiva do `en`**
    (escolhida por leitura, e que não exista em `pt`) **não** aparece no chunk de entrada. O
    executor cola qual frase escolheu e por que ela é exclusiva.
17. As asserções que o `bundle-guard` já tem — o teto, as **0 marcas** de TipTap, o
    `entryScripts` não-vazio — continuam **todas** verdes e **sem edição**.

### Transversais

18. ⚠️ **`packages/ui` e `packages/backend` ficam INTOCADOS** (`git status` vazio, colado). O
    backend importa `@clube/shared` mas não os catálogos; se o `typecheck` dele reclamar, você
    mexeu em algo que não devia.
19. Nenhuma chave de tradução nova, nenhuma removida. `pt` e `en` mantêm exatamente o mesmo
    conteúdo — esta fatia move bytes, não texto.

## Arquivos a tocar

```
packages/shared/package.json                          + o subpath ./locales/en
packages/shared/src/locales/en.ts                     `import type { pt }`
packages/shared/src/locales/index.ts                  `en` sai de resources; o nome muda (C)
packages/shared/src/locales/__tests__/catalogs.test.ts   as duas asserções TROCADAS (D)
packages/app/src/i18n.ts                              o import() + addResourceBundle + changeLanguage
packages/app/src/App.tsx                              o seletor dispara o carregamento
packages/app/src/__tests__/i18n.test.ts               crescer (regras 5–9)
packages/app/src/__tests__/bundle-guard.test.ts       + a asserção da decisão H
```

**Não tocar:** `packages/ui/**` · `packages/backend/**` · `prisma/**` ·
`packages/app/src/pages/**` · `packages/shared/src/locales/{pt,en}.ts` **no conteúdo** (só o
`import type` no `en.ts`) · os **10 arquivos de teste** que importam `en` do barrel (medido:
desnecessário) · `docs/**`.

## Definição de pronto

- [x] Subpath `./locales/en` no `exports`, e o `import()` aponta para ele (1, A).
- [x] `resources` só com `pt`, com nome que diz isso (4, C).
- [x] ⚠️ Boot em `en` traduz a tela — provado pela **re-renderização**, não pelo registro (5).
- [x] ⚠️ Boot em `pt` **não** carrega nada, provado por **contagem** (6).
- [x] ⚠️ `pt → en → pt → en` carrega **uma vez** (8).
- [x] `import()` que rejeita cai em `pt` sem quebrar (9).
- [x] ⚠️ As duas asserções de `catalogs.test.ts` **trocadas**, com nome novo, não apagadas (13).
- [x] ⚠️ As guardas do §7.9 medidas **depois** da fatia: frase proibida plantada no `en.ts`,
      **contagem de acusadores colada**, restauração provada (12).
- [x] ⚠️ **Chunk de entrada em bytes colado**, abaixo de 450.000 (14) + nome e tamanho do chunk
      novo do `en` (15).
- [x] Asserção "o `en` não está na entrada" no `bundle-guard`, com a frase escolhida
      justificada (16).
- [x] `pnpm -r test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm prettier --check .`,
      `pnpm --filter @clube/app build` limpos, contagens por pacote coladas (baseline
      413 · 195 · 1307 · 603 — as de `shared` e `app` **vão mudar**; diga em quanto e por quê).
- [x] `pnpm -r test:integration` **não** roda (a fatia não toca repositório nem rota). Diga
      isso em vez de repetir o **387**.
- [x] ⚠️ `git status -- packages/ui packages/backend packages/app/src/pages` **vazio**, colado.
- [x] ⚠️ O **vermelho colado** das regras 5, 6, 8 e 16.
