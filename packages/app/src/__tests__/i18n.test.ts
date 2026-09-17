import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { pt } from '@clube/shared/locales';
import { render, screen } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { createI18n, i18n } from '../i18n';

/**
 * ⚠️ **O QUE SOBROU DEPOIS DA TAREFA 38d, E POR QUE NÃO É UMA VARREDURA VAZIA
 * (§7.4).**
 *
 * Este arquivo tinha 21 testes: cinco de `pickInitialLocale`, quatro de
 * `persistLocale` e doze do catálogo `en` sob demanda (o `import()`, a
 * contagem de chamadas, a corrida entre dois toques no seletor). Todos eles
 * mediam uma ESCOLHA de idioma, e a escolha deixou de existir — o dono
 * respondeu *"só português"* (`docs/ACEITE-MVP.md`, MVP 1, pergunta 7).
 *
 * ⚠️ **O que NÃO pode sumir junto é a propriedade que os doze pressupunham sem
 * nunca serem os donos dela: que o catálogo `pt` CHEGA ao `t()`.** Um
 * `createI18n` que esquecesse o `resources` renderizaria as CHAVES
 * (`app.name` no lugar de "Clube do Livro") em **todas** as telas, sem erro
 * nenhum.
 *
 * ⚠️⚠️ **E O QUE ESTE DOCBLOCK PROMETIA A MAIS, CORRIGIDO NA RODADA DE
 * CORREÇÃO DA 38d (§7.10: não prometer no comentário o que o teste não
 * sustenta).** Ele dizia que um `createI18n` sem o `lng` ou sem o
 * `initReactI18next` também não quebraria nenhum dos 21 — subentendendo que
 * os três passaram a ter dono. **Medido, um a um, nesta suíte:**
 *
 * | Mutante em `createI18n` | Acusadores |
 * |---|---|
 * | `resources: {}` | **405 de 749**, em 16 arquivos |
 * | `lng: LANGUAGE` removido | **ZERO** — 749/749 verdes |
 * | `.use(initReactI18next)` removido | **ZERO** — 749/749 verdes |
 *
 * Os dois zeros são **estruturais, não buraco de teste**: o `fallbackLng`
 * (também `LANGUAGE`) cobre o `lng` que faltou, e a ponte React chega pelo
 * `<I18nextProvider>` — que o `main.tsx` e **todos** os testes de tela usam —,
 * de onde o `useTranslation` lê a instância pelo contexto, sem precisar do
 * `.use()`. Escrever uma guarda para cada um seria pinar um detalhe que hoje
 * não tem consequência; **se o `.use(initReactI18next)` é necessário ou não é
 * decisão de desenho, e está registrada para o dono, não consertada aqui.**
 *
 * O primeiro teste abaixo continua renderizando um componente React de verdade
 * em vez de ler `instance.store` — não porque a ponte precise de acusador, mas
 * porque é pelo `t()` de um componente que a tela quebra.
 */

/** O `t('app.name')` de verdade, dentro de um componente React de verdade. */
function renderProbe(instance: I18nInstance): void {
  function Probe() {
    const { t } = useTranslation();
    return createElement('span', { 'data-testid': 'app-name' }, t('app.name'));
  }

  render(
    createElement(I18nextProvider, { i18n: instance }, createElement(Probe)),
  );
}

function nameOnScreen(): string {
  return screen.getByTestId('app-name').textContent ?? '';
}

describe('o i18n do app', () => {
  it('⚠️ delivers the pt catalog to the t() of a real component', () => {
    renderProbe(createI18n());

    expect(nameOnScreen()).toBe(pt.app.name);
    // ⚠️ O par que separa "traduziu" de "não traduziu": sem tradução o i18next
    // renderiza a PRÓPRIA CHAVE, e `toBe(pt.app.name)` já cairia — mas esta
    // linha é a que faz o vermelho DIZER o sintoma que a pessoa veria.
    expect(nameOnScreen()).not.toBe('app.name');
  });

  it('⚠️ boots the app-wide instance, not just the ones the tests create', () => {
    /*
      O singleton `i18n` é o que o `main.tsx` entrega ao `I18nextProvider` —
      nenhum teste de tela o usa (todos chamam `createI18n()`), então um
      `export const i18n` que nascesse sem `init` deixaria a suíte inteira
      verde e o app de produção em branco.
    */
    expect(i18n.t('app.name')).toBe(pt.app.name);
    expect(i18n.resolvedLanguage).toBe('pt');
  });

  it('⚠️ has no lazy-catalog machinery left (task 38d)', () => {
    /*
      ⚠️ **A MAQUINARIA DA TAREFA 29a INTEIRA SAIU, e ela era um arquivo.** O
      `src/i18n/lazy-catalog.ts` guardava o `import()` do segundo catálogo, o
      `changeLocale`, o `WeakMap` de corrida e o tipo `EnCatalogImport`. Sem
      segundo catálogo ele é código morto — e código morto que **passa nos
      testes** é o que este projeto mais caça.

      A guarda é pelo DISCO e não pelos exports porque um módulo que voltasse
      ao lugar compila e passa enquanto ninguém o importar: o custo dele
      apareceria só na fatia seguinte, quando alguém o "consertasse".

      ⚠️ O par positivo (§7.4): o `i18n.ts` está lá. Sem ele, um caminho errado
      deixaria a linha de baixo verde provando "esta pasta não existe".
    */
    expect(existsSync(resolve(process.cwd(), 'src/i18n.ts'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'src/i18n'))).toBe(false);
  });
});
