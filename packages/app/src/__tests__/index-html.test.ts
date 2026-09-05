import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '../theme';

/**
 * Regra 27: o tema é aplicado ANTES da primeira pintura.
 *
 * Não há como medir "não piscou" em jsdom — mas dá para provar o mecanismo, e
 * é exatamente o tipo de coisa que quebra em silêncio: quem apagar o script
 * inline não quebra teste nenhum de renderização, e o defeito só aparece na
 * abertura do app de quem usa tema escuro.
 */
// `process.cwd()` e não `import.meta.url`: no ambiente jsdom do Vitest o
// módulo não tem URL de arquivo, e o `fileURLToPath` estoura.
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('index.html', () => {
  it('applies the stored theme before the app module loads (rule 27)', () => {
    const themeScript = html.indexOf(THEME_STORAGE_KEY);
    const appModule = html.indexOf('src="/src/main.tsx"');

    expect(themeScript).toBeGreaterThan(-1);
    expect(appModule).toBeGreaterThan(-1);
    expect(themeScript).toBeLessThan(appModule);
  });

  it('uses the same storage key as theme.ts (rule 27)', () => {
    // Renomear a constante sem renomear o script inline devolve o flash sem
    // quebrar mais nada.
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('uses the same attribute the CSS selects (rule 27)', () => {
    expect(html).toContain(`setAttribute('${THEME_ATTRIBUTE}'`);
  });

  it('keeps the theme script synchronous, not deferred (rule 27)', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    const inline = head.slice(head.lastIndexOf('<script'));

    // `defer`/`async` fariam o script rodar DEPOIS da primeira pintura, que é
    // o defeito que ele existe para evitar.
    expect(inline).not.toContain('defer');
    expect(inline).not.toContain('async');
    expect(inline).not.toContain('src=');
  });

  it('declares the document language as pt-BR', () => {
    expect(html).toContain('<html lang="pt-BR">');
  });
});
