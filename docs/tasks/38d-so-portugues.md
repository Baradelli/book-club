# Tarefa 38d — Só português: o catálogo `en` sai, e a maquinaria dele junto

> **Fatia gerada pela resposta do dono à pergunta 7 do MVP 1** (2026-09-17):
> *"só português — apagar o inglês"*. → `docs/ACEITE-MVP.md`, MVP 1, pergunta 7.
>
> ⚠️ **ELA NÃO É "APAGAR UM ARQUIVO".** A **Tarefa 29a inteira** existe para tirar o `en` do
> chunk de entrada por `import()`: ela entregou o `changeLocale`, o chunk separado, o
> `globIgnores` do service worker e as asserções do `bundle-guard`. Sem o `en`, essa maquinaria
> vira código morto — e código morto que **passa nos testes** é o que este projeto mais caça.
>
> Leia antes: `CLAUDE.md` · `docs/CONVENCOES-CODIGO.md` **§7.4** (asserção vazia), **§7.9**
> (guarda no lugar certo; o nome do teste é parte da guarda), **§7.10** (não prometer no
> comentário o que o teste não sustenta) · `docs/tasks/29a-catalogo-en-sob-demanda.md` —
> **esta fatia desfaz aquela, e o que ela mediu é o mapa do que pode quebrar aqui**.

---

## ⚠️⚠️ O PERIGO DESTA FATIA, em uma frase

**O service worker é a única peça capaz de quebrar o que já está entregue.** O
`globIgnores: ['assets/en-*.js']` do `vite.config.ts` sai nesta fatia, e a guarda que o pina
tem **cinco propriedades**. Tirar uma **não pode** derrubar as outras quatro — e "não pode" aqui
significa **medido uma a uma**, não lido.

As cinco, em `packages/app/src/__tests__/service-worker-config.test.ts`:

1. a **denylist** do `navigateFallback` (a API não pode cair no `index.html`);
2. o **`navigateFallback: '/index.html'`** existir (senão a denylist não exclui nada);
3. o **`globIgnores: ['assets/en-*.js']`** — ⚠️ **esta é a que SAI**;
4. o **`importScripts: ['push-handler.js']`** (Tarefa 38: sem ele o push chega e ninguém ouve);
5. **não haver `injectManifest`** (trocar a estratégia obrigaria a remedir as outras quatro).

E em `packages/app/src/__tests__/bundle-guard.test.ts` moram as guardas que leem o **build
real**: a que mantém o `en` fora do precache (sai) e a que pina a **revisão do
`push-handler.js`** no manifesto (⚠️ **fica, e é a que já foi quebrada uma vez com a suíte
verde**).

---

## O que sai

### No `shared`

- `packages/shared/src/locales/en.ts` — apagado.
- O export `"./locales/en"` do `package.json` do `shared`.
- `SUPPORTED_LOCALES`, `Locale`, `isLocale`, `FALLBACK_LOCALE` e o `export { en }` do
  `locales/index.ts`. ⚠️ **Se algum deles sobreviver com um valor só, ele é um tipo que mente**:
  `SUPPORTED_LOCALES = ['pt']` faz o próximo agente achar que há escolha.
- A metade `en` de `catalogs.test.ts` e de `anti-guilt.test.ts` — **incluindo o `it.each`**, que
  passa a ser um teste só. ⚠️ **O `it.each` com um item só é pior que o teste direto**: o nome
  do teste é parte da guarda (§7.9), e `has no word of debt … in pt` diz o que cobre.

### No `app`

- `packages/app/src/i18n/lazy-catalog.ts` **inteiro** (o `import()`, o `changeLocale`, o
  `WeakMap` de corrida, o tipo `EnCatalogImport`).
- O `LanguagePicker` e o `persistLocale` do `App.tsx` e do `i18n.ts`, e a leitura de idioma do
  `localStorage`/`navigator`.
- O `globIgnores` do `vite.config.ts` e as duas asserções que o pinam (a do config e a do
  `bundle-guard`).
- A metade `en` de `i18n.test.ts`.

### No `backend`

- O ramo de locale de `reminder-message.ts`, `group-activity-message.ts` e
  `diagnostic-message.ts`: eles deixam de **receber** `locale` e passam a usar `pt` direto.
  ⚠️ **Parâmetro que chega e é ignorado é pior que parâmetro que não existe** — quem chama
  continua achando que escolhe.

## ⚠️ O que NÃO sai, e as duas razões são medidas

| O que fica | Por quê |
| --- | --- |
| **A coluna `Settings.locale`** (`@default("pt")`) | **Nenhuma migration nesta fatia.** Derrubar a coluna mexe no banco de desenvolvimento do dono para **ganhar zero**: ela já não tem leitor no app, e depois desta fatia não tem leitor em lugar nenhum. ⚠️ Ela ganha **uma nota escrita no `schema.prisma`** dizendo que é vestigial e por quê — coluna sem dono e sem explicação é o ponteiro morto do MVP que vem |
| **O `t()` e o `react-i18next`** | O catálogo é o que impede **texto solto na tela**, e a varredura de fonte das telas depende dele. Um idioma só não vira string no JSX |
| **As guardas de vocabulário** (`GUILT_TERMS`, `COUNTER_SHAPE`, `privacy-terms`) | Elas varrem o catálogo que sobrar. ⚠️ **A isenção `STREAK_KEYS` do ADR 0010 continua pinada por igualdade exata** — e os sete caminhos dela **não mudam de nome** nesta fatia |

---

## As regras

1. **TDD, e o vermelho vem primeiro.** Cada remoção começa pelo teste que a exige. Apagar
   código e depois apagar o teste que reclamou é a ordem que não prova nada.
2. ⚠️ **As cinco propriedades do service worker, remedidas UMA A UMA depois da remoção**, com a
   saída colada no relatório. A terceira sai; as outras quatro têm de continuar acusando.
   **Prove que a 4 e a 5 ainda mordem** apagando-as do `vite.config.ts` uma de cada vez e
   mostrando o vermelho (e restaurando com `cp -p` + `md5sum -c` + `diff`).
3. ⚠️ **O `bundle-guard` da REVISÃO do `push-handler.js` fica, e continua identificando por
   CONTEÚDO.** Ele já foi quebrado uma vez com a suíte verde (765/765). Se o seu diff o tocar,
   pare e explique por quê.
4. **Precache medido em entradas E em KiB, antes e depois**, com o comando e a saída. O ganho
   previsto é ~11 KiB; se der outro número, o número certo é o medido, e o relatório explica a
   diferença em vez de repetir a previsão.
5. **Chunk de entrada em BYTES**, pelo contador do projeto. O teto é **450.000 B** e **não se
   relaxa**. Hoje: **433.129 B**.
6. ⚠️ **Nada de `SUPPORTED_LOCALES = ['pt']`, `Locale = 'pt'` ou `isLocale` com um caso.** Se o
   tipo sobreviver, a fatia não foi feita — foi disfarçada.
7. ⚠️ **O `i18n.test.ts` não pode virar uma varredura vazia** (§7.4). Ele perde a metade que
   testava a troca de idioma; o que sobrar tem de continuar provando que o catálogo `pt` chega
   ao `t()` — e tem de **ficar vermelho** se alguém quebrar o boot do i18n. Prove com mutação.
8. **Os 33 textos da barra do editor** (pergunta 6 do MVP 2) deixam de ser dívida. Diga no
   relatório onde essa dívida estava registrada e apague o registro dela **riscando e
   explicando**, não em silêncio.
9. ⚠️ **A perda, registrada por escrito:** o segundo catálogo era a rede que pegava texto solto
   (*"se a frase não existe em dois lugares, ela não passou pelo `t()`"*). Essa rede some. O
   relatório tem de dizer **o que sobrou no lugar** — e medir se sobrou mesmo.
10. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
    `pnpm --filter @clube/app build`. Contagens coladas. Hoje: **605 · 195 · 1918 · 777**.

---

## Definição de pronto

- [x] O catálogo `en` não existe, e **nada** no repositório importa dele.
- [x] Não existe tipo, constante ou função que suponha mais de um idioma. ⚠️ **Com UM resíduo
      medido e registrado:** `formatActivityMoment`, `formatClubMonth` e o formatador de data do
      `book.tsx` continuam recebendo `locale: string` do `i18n.resolvedLanguage`, que hoje só
      pode ser `'pt'`. Eles são parâmetros de **`Intl`**, não do catálogo — não estão na lista
      "o que sai" desta spec, e o dado deles vive no navegador (zero byte de bundle).
- [x] As **cinco** propriedades do service worker remedidas uma a uma; as quatro que ficam
      continuam acusando, provado por mutação (1 acusador cada).
- [x] Precache e chunk medidos antes e depois, em entradas/KiB e em bytes. ⚠️ **O ganho de
      precache previsto (~11 KiB) NÃO aconteceu, e o número certo é o medido: 1,60 KiB.** O
      chunk do `en` já estava FORA do precache desde a 29a — era exatamente para isso que o
      `globIgnores` existia —, então apagá-lo não devolve precache nenhum.
- [x] `605 · 195 · 1918 · 777` → **586 · 195 · 1904 · 750**, com a diferença explicada teste a
      teste no relatório. ⚠️ O `app` fecha em **750** e não em 749 porque a rodada de correção
      ACRESCENTOU um teste: `⚠️ precaches the FIRST LOAD, so an installed app opens offline`.
      A auditoria achou que a fatia tinha levado de carona, junto com o teste do `en`, a linha
      que pinava o chunk de entrada dentro do `sw.js` — e o mutante `globIgnores: ['assets/**']`
      derrubava o precache de 16 entradas / 898,33 KiB para 13 / 11,84 KiB com a suíte **33/33
      verde**. Hoje dá **1 acusador**.
- [x] Nenhuma migration. Nenhuma dependência nova.
