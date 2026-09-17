import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { API_ERROR_KEYS } from '../../client/api-error-key';
import { pt, resources } from '../index';

/** `a.b.c` de cada folha do catálogo — é a chave que o `t()` recebe. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keyPaths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

function leaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [value];
  return Object.values(value).flatMap(leaves);
}

describe('catálogos de i18n', () => {
  it('⚠️ has ONE catalog, and the en one does not exist (task 38d)', () => {
    /*
      ⚠️ **A DECISÃO DO DONO, PINADA NO DISCO** (`docs/ACEITE-MVP.md`, MVP 1,
      pergunta 7, 2026-09-17): *"só português — apagar o inglês"*.

      Ela é pinada aqui, e não só pela ausência de `export { en }`, porque um
      `en.ts` que voltasse ao disco **compila e passa** enquanto ninguém o
      importar — e aí o catálogo morto volta a pedir manutenção (a fatia
      seguinte escreve uma chave nova e alguém "conserta a paridade").

      ⚠️ O par positivo (§7.4): o `pt.ts` ESTÁ lá. Sem ele, um caminho errado
      deixaria as duas linhas verdes provando "esta pasta não existe".
    */
    const catalogPath = (name: string): string =>
      fileURLToPath(new URL(`../${name}.ts`, import.meta.url));

    expect(existsSync(catalogPath('pt'))).toBe(true);
    expect(existsSync(catalogPath('en'))).toBe(false);
  });

  /*
    ⚠️ **A ASSERÇÃO TROCADA DUAS VEZES, NUNCA APAGADA.** Ela já foi
    `exposes both catalogs in resources (rule 13)` (os DOIS catálogos no
    `i18next.init`) e depois `ships ONLY pt eagerly, because en is fetched on
    demand` (Tarefa 29a: só o `pt` eager, o `en` por `import()`).

    A Tarefa 38d apagou o segundo catálogo, e com ele a distinção
    eager/preguiçoso — por isso `eagerResources` voltou a se chamar `resources`:
    com um idioma só, "eager" prometia um irmão preguiçoso que não existe mais.
    O que sobra é a Única verdade que resta: o que o `i18next.init` recebe é o
    catálogo `pt`, e só ele.

    A paridade recursiva `pt` ↔ `en` (`has exactly the same key set…`) saiu
    junto, e não foi afrouxada: ela comparava dois conjuntos, e só há um.
  */
  it('puts the pt catalog, and nothing else, in what i18next receives', () => {
    expect(resources).toEqual({ pt: { translation: pt } });
    expect(Object.keys(resources)).toEqual(['pt']);
  });

  it('has no empty value in pt (rule 15)', () => {
    const catalog = pt;
    const empty = keyPaths(catalog).filter((path) => {
      const value = path
        .split('.')
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown>)[segment],
          catalog,
        );
      return typeof value !== 'string' || value.trim() === '';
    });

    expect(empty).toEqual([]);
  });

  it('has only string leaves in pt (rule 15)', () => {
    /*
      ⚠️ **O PAR POSITIVO (§7.4), acrescentado na rodada de correção da 38d.**
      O laço abaixo é uma varredura, e varredura sobre lista vazia é verde para
      sempre: medido, com `leaves()` devolvendo `[]` o teste rodava **zero
      asserções** e passava (586/586, zero acusadores). O buraco vinha do
      `it.each` que este teste substituiu — herdado, não criado, mas herdado na
      mão de quem o reescreveu.
    */
    expect(leaves(pt).length).toBeGreaterThan(20);

    for (const leaf of leaves(pt)) expect(typeof leaf).toBe('string');
  });

  it('names every key in English camelCase (rule 16)', () => {
    const segment = /^[a-z][A-Za-z0-9]*$/;

    /*
      ⚠️ **O SUFIXO DE PLURAL DO i18next NÃO É NOME EM SNAKE_CASE** — é
      protocolo. A biblioteca escolhe entre `days_one` e `days_other` sozinha,
      a partir do `count` e das regras do idioma; a chave que o código escreve
      continua sendo `days`, em camelCase.

      ⚠️ A lista é FECHADA de propósito (`one` e `other`, os dois que o `pt`
      usa): aceitar qualquer `_algo` reabriria a porta para snake_case de
      verdade, que é o que esta regra existe para barrar. Quem precisar de
      `_few`/`_many` (russo, polonês) acrescenta aqui, e o acréscimo aparece no
      diff.
    */
    const PLURAL_SUFFIXES = ['_one', '_other'];
    const withoutPluralSuffix = (part: string): string => {
      const suffix = PLURAL_SUFFIXES.find((it) => part.endsWith(it));
      return suffix === undefined ? part : part.slice(0, -suffix.length);
    };

    const bad = keyPaths(pt).filter((path) =>
      path.split('.').some((part) => !segment.test(withoutPluralSuffix(part))),
    );

    expect(bad).toEqual([]);
  });

  it('says a missing invite and an invalid invite differently, in pt', () => {
    const catalog = pt;
    /*
      A regra 15 da Tarefa 15 vive AQUI, e não na tela: "404 e 410 têm frases
      diferentes" é propriedade DO CATÁLOGO — dois valores distintos — e não
      comportamento de um componente. O teste de tela que a afirmava
      (`expect(pt.pages.acceptInvite.inviteNotFound).not.toBe(...)` dentro do
      `accept-invite.test.tsx`) era §7.2 na letra: propriedade do catálogo
      dentro de teste de tela, que passaria igual com a tela desmontada.

      ⚠️ Até a Tarefa 38d este era um `it.each` sobre `pt` e `en`, porque
      uma tradução copiada e colada mataria a distinção só em `en`. Com um
      catálogo só ele volta a ser um teste direto — e o nome diz qual, porque
      o nome é parte da guarda (§7.9).
    */
    const invite = catalog.pages.acceptInvite;

    expect(invite.inviteNotFound).not.toBe(invite.inviteExpired);
    expect(invite.alreadyInClub).not.toBe(invite.inviteExpired);
    expect(invite.alreadyInClub).not.toBe(invite.inviteNotFound);
  });

  it('⚠️ says the SIX feed sentences differently, in pt (task 35 rule 3, task 38e)', () => {
    const catalog = pt;
    /*
      ⚠️ **A LIÇÃO Nº 16 DO MVP 2 ESCRITA COMO TESTE: duas coisas que falam a
      MESMA frase são indistinguíveis pela varredura.** O feed da home tem
      quatro nascimentos (`ACTIVITY_TYPES`) e **seis frases** — os dois tipos
      que têm dia de leitura ganharam uma irmã COM o tema na Tarefa 38e —, e se
      duas delas dissessem a mesma coisa a pessoa não teria como saber se a
      outra escreveu ou grifou (nem se o tema entrou na linha) — e nenhuma
      varredura de DOM acusaria, porque a tela estaria renderizando texto
      legítimo.

      ⚠️ **E ELA MORA AQUI, NÃO NA TELA (§7.9).** "As frases são
      distintas" é propriedade de VALORES do catálogo: independe de
      estado e independe de tela. Até a Tarefa 38d ela também percorria os
      dois locales — esse era o argumento mais forte para ela morar aqui, e
      ele morreu com o segundo catálogo. Os outros dois continuam de pé: o
      feed tem treze estados, e uma varredura de tela só vê os que alguém
      lembrar de renderizar.

      O que o catálogo NÃO decide, e por isso continua na tela: que a tela
      escolha a chave certa para cada tipo — e, desde a 38e, que ela escolha a
      irmã COM tema só quando há tema. Frases distintas num catálogo que a tela
      lê por uma chave só ficariam verdes aqui. Os acusadores daquela metade são
      `activity-feed.test.ts` (o `activitySentenceKey`, onde a escolha é
      decidível sem tela) e `home.test.tsx` (a linha renderizada).
    */
    const feed = catalog.pages.home.feed;
    const sentences = [
      feed.planNote,
      feed.freeNote,
      feed.highlight,
      feed.read,
      // ⚠️ As DUAS da Tarefa 38e entram na MESMA varredura: elas são as frases
      // dos mesmos dois tipos quando há tema do dia, e uma delas igual à sua
      // irmã sem tema faria o tema sumir da linha sem nenhum vermelho.
      feed.planNoteOnTheme,
      feed.readOnTheme,
    ];

    // O par positivo: as seis existem e falam de alguém e de um livro. Sem ele,
    // seis strings vazias seriam "distintas" só no dia em que o `new Set`
    // mudasse de tamanho (§7.4).
    for (const sentence of sentences) {
      expect(sentence).toContain('{{name}}');
      expect(sentence).toContain('{{book}}');
    }
    expect(new Set(sentences).size).toBe(6);

    /*
      ⚠️ **E as duas com tema PRECISAM do buraco do tema** — uma frase de tema
      que esquecesse o `{{theme}}` seria distinta das outras cinco, passaria na
      contagem acima, e a tela diria "escreveu sobre , em O Hobbit". O tema é
      CONTEÚDO DO USUÁRIO (regra 7): o catálogo garante o buraco, nunca o texto
      que entra nele.
    */
    for (const sentence of [feed.planNoteOnTheme, feed.readOnTheme]) {
      expect(sentence).toContain('{{theme}}');
    }
    for (const sentence of [
      feed.planNote,
      feed.freeNote,
      feed.highlight,
      feed.read,
    ]) {
      expect(sentence).not.toContain('{{theme}}');
    }

    /*
      E os DOIS estados sem linha nenhuma também são distintos entre si — a
      lição das Tarefas 19/25/28, e a decisão G desta fatia: "ainda não há
      atividade" é constatação, "não foi possível carregar" é falha nossa, e
      uma frase só para os dois faz a pessoa achar que o clube está parado
      quando o que caiu foi a rede.
    */
    expect(feed.empty).not.toBe(feed.failed);
    expect(feed.loading).not.toBe(feed.empty);
    expect(feed.loading).not.toBe(feed.failed);
  });

  it('⚠️ says the FOUR device refusals differently, in pt (task 36b, decision G)', () => {
    const catalog = pt;
    /*
      ⚠️ **QUATRO CAUSAS COM QUATRO CONSERTOS DIFERENTES** — abrir por
      HTTPS/localhost · usar outro navegador · adicionar o PWA à tela de
      início · reverter a permissão. Uma frase genérica de "não deu" manda a
      pessoa adivinhar qual das quatro, e a quarta (o iPhone fora da tela de
      início) é a mais cruel porque **não parece falha**: o `PushManager`
      existe e o botão simplesmente não faria nada.

      ⚠️ **E ELA MORA AQUI, NÃO NA TELA (§7.9)**, pelo mesmo motivo do par de
      convite e dos quatro tipos do feed: "as quatro frases são distintas" é
      propriedade de QUATRO VALORES do catálogo, e a tela só mostra uma recusa
      por vez — a varredura teria de reproduzir os quatro ambientes.

      O que o catálogo NÃO decide, e por isso continua na tela: que a tela
      escolha a chave certa para cada recusa. O acusador daquela metade é
      `preferencias.test.tsx`.
    */
    const device = catalog.pages.settings.device;
    const refusals = [
      device.insecureContext,
      device.unsupported,
      device.iosNotInstalled,
      device.permissionDenied,
    ];

    // O par positivo (§7.4): sem ele, quatro strings vazias seriam
    // "distintas" só no dia em que o `new Set` mudasse de tamanho. E cada
    // recusa diz o CONSERTO, então nenhuma delas cabe em três palavras.
    for (const sentence of refusals) {
      expect(sentence.length).toBeGreaterThan(20);
    }
    expect(new Set(refusals).size).toBe(4);

    /*
      ⚠️ E nenhuma delas é a frase de "ainda não configurado" (decisão F):
      `enabled: false` é o estado NORMAL de quem clona o projeto sem VAPID, e
      não pode falar a mesma língua de uma falha.
    */
    expect(refusals).not.toContain(device.unavailable);

    /*
      ⚠️ E o TERCEIRO estado do aparelho — o `GET /notifications/config` que
      não respondeu — não fala a língua de nenhum dos outros dois. São
      consertos diferentes: `unavailable` pede configurar o servidor,
      `configFailed` pede tentar de novo.
    */
    expect(device.configFailed).not.toBe(device.unavailable);
    expect(refusals).not.toContain(device.configFailed);
  });

  it('has every key that apiErrorKey can return, in pt (rules 14 and 17)', () => {
    const keys = new Set(keyPaths(pt));

    // O elo que ninguém confere à mão: `apiErrorKey` devolve uma chave, e
    // uma chave ausente do catálogo aparece na tela como `errors.conflict`.
    expect(API_ERROR_KEYS.filter((key) => !keys.has(key))).toEqual([]);
  });

  it('⚠️ exports NO subpath for a second catalog (task 38d)', () => {
    /*
      ⚠️ **O SUBPATH `./locales/en` SAI, E ELE ERA A FRONTEIRA DE CORTE DO
      BUNDLER** (Tarefa 29a, decisão A): era dele que o `import()` dinâmico
      carregava o segundo catálogo, e era ele que dava ao Rollup um lugar por
      onde separar o chunk. Sem segundo catálogo não há o que carregar nem o
      que cortar.

      ⚠️ A asserção é de IGUALDADE do mapa inteiro, e não um
      `not.toHaveProperty`: um subpath a mais aqui é uma porta de entrada nova
      para o pacote, e ela tem de aparecer no diff de quem a abrir. Os quatro
      que sobram são os que já existiam antes da 29a.
    */
    const manifest: unknown = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../package.json', import.meta.url)),
        'utf8',
      ),
    );
    const exportsField = (manifest as { exports: Record<string, string> })
      .exports;

    expect(exportsField).toEqual({
      '.': './src/index.ts',
      './client': './src/client/index.ts',
      './locales': './src/locales/index.ts',
      './anti-culpa': './src/locales/__tests__/guilt-terms.ts',
      './adr-0002': './src/locales/__tests__/privacy-terms.ts',
    });
  });
});
