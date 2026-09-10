import type { StorageLike } from '@clube/shared/client';
import { en, pt, type TranslationCatalog } from '@clube/shared/locales';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { i18n as I18nInstance } from 'i18next';
import { createElement } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';

import {
  changeLocale,
  createI18n,
  LOCALE_STORAGE_KEY,
  persistLocale,
  pickInitialLocale,
} from '../i18n';

/** Fixture é factory (§7.7). */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('pickInitialLocale', () => {
  it('honours the locale the person chose before (rule 13)', () => {
    // Navegador em inglês de propósito: se a escolha não vencesse, o
    // resultado seria 'en' e o teste passaria por acidente com 'pt'.
    expect(pickInitialLocale('pt', ['en-US', 'en'])).toBe('pt');
    expect(pickInitialLocale('en', ['pt-BR', 'pt'])).toBe('en');
  });

  it('falls back to the browser language, region stripped', () => {
    expect(pickInitialLocale(null, ['en-GB'])).toBe('en');
  });

  it('normalises the case of the browser language', () => {
    // A BCP-47 diz "recomenda-se" minúsculas na subtag primária, não "exige".
    // Sem o `toLowerCase`, um navegador que mande `EN-US` cai no padrão `pt` e
    // a pessoa vê o app no idioma errado — e nada acusa.
    expect(pickInitialLocale(null, ['EN-US'])).toBe('en');
    expect(pickInitialLocale(null, ['PT-br'])).toBe('pt');
  });

  it('falls back to pt, the default of the club (rule 13)', () => {
    expect(pickInitialLocale(null, ['fr-FR', 'de'])).toBe('pt');
    expect(pickInitialLocale(null, [])).toBe('pt');
  });

  it('ignores a stored value that is not a locale we have', () => {
    expect(pickInitialLocale('klingon', ['en-US'])).toBe('en');
  });
});

describe('persistLocale', () => {
  it('writes the choice under a named, constant key', () => {
    // O simétrico de `writeThemePreference`, que tinha teste. Sem este, um
    // `persistLocale` que virasse no-op passava na suíte inteira — e quem
    // troca de idioma volta para o padrão a cada recarga.
    const storage = memoryStorage();

    persistLocale('en', storage);

    expect(storage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('reads back, in a new session, the choice of the previous one', () => {
    const storage = memoryStorage();

    persistLocale('en', storage);

    // A ida e a volta pela MESMA chave — é o par que o app faz de verdade.
    expect(
      pickInitialLocale(storage.getItem(LOCALE_STORAGE_KEY), ['pt-BR']),
    ).toBe('en');
  });

  it('uses a key of its own, not the one of the theme', () => {
    // Duas preferências na mesma chave: escolher idioma apagaria o tema.
    expect(LOCALE_STORAGE_KEY).toBe('clube.locale');
  });

  it('survives a storage that throws', () => {
    const boom: StorageLike = {
      getItem: () => {
        throw new Error('storage blocked');
      },
      setItem: () => {
        throw new Error('storage blocked');
      },
      removeItem: () => {
        throw new Error('storage blocked');
      },
    };

    // Safari em aba privada: a escolha vale só nesta sessão, mas o app abre.
    expect(() => persistLocale('en', boom)).not.toThrow();
  });
});

/**
 * O CATÁLOGO `en` SOB DEMANDA (Tarefa 29a, regras 5–9).
 *
 * O `i18next.init` recebe só o `pt`; o `en` chega por
 * `import('@clube/shared/locales/en')` quando alguém escolhe inglês — no boot
 * ou no seletor. O importador é INJETADO aqui para poder ser CONTADO (§7.3):
 * "não carregou" e "carregou e deu no mesmo" são indistinguíveis pelo
 * resultado, e a diferença entre elas é um pedido de rede por toque no
 * seletor.
 */

interface CatalogImportSpy {
  calls: number;
  load: () => Promise<{ en: TranslationCatalog }>;
}

/** Fixture é factory (§7.7). `failures` = quantas primeiras chamadas rejeitam. */
function catalogImportSpy(failures = 0): CatalogImportSpy {
  const spy: CatalogImportSpy = {
    calls: 0,
    load: async () => {
      spy.calls += 1;
      if (spy.calls <= failures) throw new Error('offline');
      return { en };
    },
  };
  return spy;
}

/**
 * O importador que fica PENDURADO até alguém soltar — é ele que torna a
 * corrida do seletor DECIDÍVEL (§7.10: antes de dizer "não é testável aqui",
 * procure a ferramenta que escolhe o momento). Sem o portão, as duas trocas de
 * idioma resolvem no mesmo tick e a ordem de escrita nunca aparece.
 */
interface GatedImportSpy extends CatalogImportSpy {
  release: () => void;
}

function gatedCatalogImportSpy(): GatedImportSpy {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });

  const spy: GatedImportSpy = {
    calls: 0,
    load: async () => {
      spy.calls += 1;
      await gate;
      return { en };
    },
    release: () => {
      open();
    },
  };
  return spy;
}

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

describe('the en catalog, loaded on demand', () => {
  it('has a different app name in each locale, which every test below reads', () => {
    // A precondição das asserções de tela (§7.2/§7.8): se os dois catálogos
    // dissessem a mesma coisa, "traduziu" e "não traduziu" seriam o mesmo
    // texto e todo teste daqui para baixo passaria sem provar nada.
    expect(en.app.name).not.toBe(pt.app.name);
  });

  it('⚠️ does NOT leak the loaded catalog into the next i18n instance', () => {
    /*
      ⚠️ MEDIDO NESTA FATIA, e o sintoma era um teste que passava sozinho e
      falhava na suíte: o `addResourceBundle` escreve DENTRO do objeto que o
      `init` recebeu em `resources`, e `eagerResources` é um só, exportado por
      `@clube/shared/locales`. A primeira instância que carregasse o `en`
      — inclusive o singleton `i18n` deste módulo, que boota em inglês porque o
      `navigator.language` do jsdom é `en-US` — deixava o catálogo lá dentro, e
      toda instância criada depois já nascia com ele.

      O estrago não é só de teste: o `hasResourceBundle` da regra 8 passaria a
      responder "já tenho" para um catálogo que aquela instância nunca baixou.
      Por isso cada `createI18n` recebe a SUA cópia.
    */
    const other = createI18n(memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }));

    expect(other.hasResourceBundle('en', 'translation')).toBe(false);
    expect(other.hasResourceBundle('pt', 'translation')).toBe(true);
  });

  it('⚠️ does NOT leak a bundle WRITTEN OVER pt into the next instance', () => {
    /*
      ⚠️ **O ACUSADOR DA PROFUNDIDADE DA CÓPIA** — a prosa dizia "cada
      instância recebe a SUA cópia", e nada provava até onde ela ia. Medido na
      rodada de correção: `return eagerResources` (sem cópia) dá 7 acusadores;
      `return { ...eagerResources }` (rasa, UM nível) dá **zero** — a cópia de
      dois níveis era indistinguível da rasa por qualquer teste que existia.

      É este teste que separa as duas: o `addResourceBundle` grava o pacote
      novo DENTRO do objeto por locale (`data[lng][ns] = pack`), então com a
      cópia rasa esse objeto é compartilhado e a escrita de uma instância
      aparece na outra. O locale é `pt` de propósito — é o eager, o único que
      existe nos dois lados no momento do `init`.

      ⚠️ **O TERCEIRO nível continua compartilhado, e isso é dívida
      registrada:** o objeto de tradução em si (`{ translation: pt }` →  o
      próprio `pt`) é o mesmo em todas as instâncias, e um
      `addResourceBundle('pt', 'translation', …, { deep: true })` faria um
      merge DENTRO dele e vazaria igual. Hoje é inalcançável — nada no app
      chama `addResourceBundle` com `deep`, e o único chamador é o carregador
      do `en`, que grava um namespace que ainda não existe.
    */
    const first = createI18n(memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }));
    first.addResourceBundle('pt', 'translation', {
      app: { name: 'CATÁLOGO ADULTERADO' },
    });

    const second = createI18n(memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }));

    expect(second.t('app.name')).toBe(pt.app.name);
    // O lado positivo do par: a escrita ACONTECEU de verdade na primeira, e
    // não é um `addResourceBundle` que virou no-op.
    expect(first.t('app.name')).toBe('CATÁLOGO ADULTERADO');
  });

  it('⚠️ translates the screen when the initial choice is en (rule 5)', async () => {
    const spy = catalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'en' }),
      spy.load,
    );

    renderProbe(instance);

    // ⚠️ A PROVA É A RE-RENDERIZAÇÃO, não o registro (decisão F): o
    // `addResourceBundle` sozinho guarda o pacote e NÃO avisa a árvore React —
    // a tela ficaria em `pt` até o próximo clique, que é indistinguível de "a
    // tradução não chegou". Quem re-renderiza é o `changeLanguage` depois dele.
    await waitFor(() => {
      expect(nameOnScreen()).toBe(en.app.name);
    });
    expect(spy.calls).toBe(1);
  });

  it('⚠️ fetches NOTHING when the initial choice is pt (rule 6)', async () => {
    const spy = catalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );

    renderProbe(instance);

    // Provado por CONTAGEM (§7.3), não por ausência de erro: um `import()`
    // disparado no boot de quem lê em português é exatamente o byte que esta
    // fatia existe para não gastar.
    expect(spy.calls).toBe(0);
    expect(nameOnScreen()).toBe(pt.app.name);
  });

  it('loads the catalog and translates the screen when the picker goes pt → en (rule 7)', async () => {
    const spy = catalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );
    renderProbe(instance);

    await changeLocale(instance, 'en');

    await waitFor(() => {
      expect(nameOnScreen()).toBe(en.app.name);
    });
    expect(spy.calls).toBe(1);
  });

  it('loads nothing when the picker goes en → pt (rule 7)', async () => {
    const spy = catalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'en' }),
      spy.load,
    );
    renderProbe(instance);
    await waitFor(() => {
      expect(nameOnScreen()).toBe(en.app.name);
    });

    await changeLocale(instance, 'pt');

    // O `pt` é eager: voltar para ele não pode custar um pedido de rede.
    expect(spy.calls).toBe(1);
    await waitFor(() => {
      expect(nameOnScreen()).toBe(pt.app.name);
    });
  });

  it('⚠️ fetches the catalog ONCE across pt → en → pt → en (rule 8)', async () => {
    const spy = catalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );
    renderProbe(instance);

    await changeLocale(instance, 'en');
    await changeLocale(instance, 'pt');
    await changeLocale(instance, 'en');

    // Sem esta, cada toque no seletor é um pedido de rede — e o segundo
    // `addResourceBundle` também sobrescreveria o pacote que já estava lá.
    expect(spy.calls).toBe(1);
    await waitFor(() => {
      expect(nameOnScreen()).toBe(en.app.name);
    });
  });

  it('stays in pt, without breaking, when the import rejects (rule 9)', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const spy = catalogImportSpy(1);
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );
    renderProbe(instance);

    // Rede caída no meio de uma troca de idioma não quebra o app (decisão G).
    await expect(changeLocale(instance, 'en')).resolves.toBeUndefined();

    expect(spy.calls).toBe(1);
    // O `fallbackLng` é `pt`, então a pessoa continua vendo conteúdo — e o
    // seletor volta a marcar português, porque `resolvedLanguage` só aponta
    // para um idioma que TEM tradução.
    expect(nameOnScreen()).toBe(pt.app.name);
    expect(instance.resolvedLanguage).toBe('pt');
    // Erro nenhum na tela; o registro é para quem depura, no console.
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('⚠️ boots in pt, and rejects NOTHING unhandled, when the boot import fails', async () => {
    /*
      ⚠️ O caminho de BOOT do `import()` que rejeita — o irmão da regra 9, e o
      que estava sem dono. O teste da regra 9 usa o seletor e faz `await` na
      promessa; o do boot é um `void changeLocale(...)` dentro do
      `createI18n`, e ninguém espera por ele. Se algum dia a rejeição escapar
      do `.catch`, ela vira `unhandledRejection` — que no navegador é um erro
      no console de quem abre o app pela primeira vez, e no Node derruba o
      processo a partir da v15.

      A asserção é sobre o EVENTO do processo, e não sobre "não lançou": um
      `void` nunca lança de forma síncrona, então `expect(() => …).not.toThrow`
      aqui seria asserção vazia (§7.4).
    */
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', onUnhandled);

    try {
      const spy = catalogImportSpy(1);
      const instance = createI18n(
        memoryStorage({ [LOCALE_STORAGE_KEY]: 'en' }),
        spy.load,
      );
      renderProbe(instance);

      // Um macrotask: é no fim do checkpoint de microtasks que o Node decide
      // que uma rejeição ficou sem quem a trate.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(spy.calls).toBe(1);
      expect(unhandled).toEqual([]);
      expect(nameOnScreen()).toBe(pt.app.name);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('tries again after a failed import, instead of staying broken until a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const spy = catalogImportSpy(1);
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );
    renderProbe(instance);
    await changeLocale(instance, 'en');

    await changeLocale(instance, 'en');

    // A memória da regra 8 guarda SUCESSO, não fracasso: memorizar a rejeição
    // deixaria a pessoa sem inglês até recarregar o app.
    expect(spy.calls).toBe(2);
    await waitFor(() => {
      expect(nameOnScreen()).toBe(en.app.name);
    });
  });
  it('⚠️ lets the LAST choice win when a slow import is still in flight', async () => {
    /*
      ⚠️ **DOIS TOQUES NO SELETOR COM REDE LENTA.** A carga do `en` está em
      voo quando a pessoa volta para o português. Sem esta guarda a carga
      atrasada VENCE a escolha posterior: o `changeLanguage('en')` roda depois
      do `changeLanguage('pt')`, a tela vira inglês sozinha e o `<select>` (que
      lê `i18n.resolvedLanguage`) pula de volta para "English" — enquanto o
      `persistLocale('pt')` já gravou `pt`. Tela e preferência em desacordo,
      sem erro nenhum.

      O `WeakMap` NÃO protege disto: ele cuida de QUANTOS fetch, não de quem
      escreve por último.
    */
    const spy = gatedCatalogImportSpy();
    const instance = createI18n(
      memoryStorage({ [LOCALE_STORAGE_KEY]: 'pt' }),
      spy.load,
    );
    renderProbe(instance);

    const toEnglish = changeLocale(instance, 'en');
    await changeLocale(instance, 'pt');
    spy.release();
    await toEnglish;
    // ⚠️ O flush é parte da asserção (§7.6.1): sem ele o React ainda não
    // pintou o `languageChanged`, e a tela mostraria `pt` mesmo com o bug —
    // medido, o vermelho ficava só no `resolvedLanguage`.
    await act(async () => {
      await Promise.resolve();
    });

    expect(nameOnScreen()).toBe(pt.app.name);
    expect(instance.resolvedLanguage).toBe('pt');
    // O catálogo CHEGOU (o byte já foi gasto, e guardá-lo é de graça) — o que
    // não acontece é ele mandar na tela.
    expect(instance.hasResourceBundle('en', 'translation')).toBe(true);
  });
});
