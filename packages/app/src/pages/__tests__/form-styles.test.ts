import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TEXT_INPUT_CLASS } from '../form-styles';
import { stripComments } from './anti-guilt-dom';
import { utilitiesIn } from './harness';

/**
 * ============================================================================
 * A FRONTEIRA DO CAMPO DE TEXTO — decisão do dono de 2026-09-24 (Tarefa 48)
 * ============================================================================
 *
 * WCAG 1.4.11 pede **3:1** para a fronteira de um componente de interface. A
 * nota 19 da Tarefa 47a mediu o filete padrão do app e achou **1,35:1** no
 * claro e **1,38:1** no escuro contra a página — e mediu que nenhum token do
 * projeto passava. O dono decidiu dar ao campo de texto um **tom próprio**.
 *
 * ⚠️ **ESTE ARQUIVO É A METADE DE ALCANCE DA DECISÃO, e ela é o ponto.** O
 * número do contraste é medido em `src/__tests__/theme-tokens.test.ts`, que lê
 * o `theme.css` e não sabe quem pinta o quê. Uma guarda de contraste sozinha
 * mediria um token que **uma** tela usa e deixaria as outras oito sem dono — a
 * forma exata do bloqueador que a auditoria da 47b achou (a família fechada
 * pela metade). Aqui se prova o outro lado: **as nove telas com campo de texto
 * desenham a borda do MESMO lugar**, e esse lugar é o `TEXT_INPUT_CLASS`.
 *
 * As nove, medidas (`grep -l TEXT_INPUT_CLASS pages/*.tsx`): `accept-invite`,
 * `acervo-filters`, `book-form`, `busca`, `free-note-fields`,
 * `highlight-fields`, `login`, `plan-editor`, `preferencias`.
 */

const PAGES_DIR = resolve(__dirname, '..');

interface Page {
  file: string;
  source: string;
}

/**
 * ⚠️ **OS TRÊS CONTROLES QUE A 1.4.11 COBRE, e a primeira versão desta guarda
 * lia UM — medido na rodada de correção, não suposto.**
 *
 * A varredura nasceu com `<input>` só. Medido em `pages/`: há também **um**
 * `<textarea>` (o trecho do grifo) e **um** `<select>` (a dimensão leitura do
 * acervo). O `<textarea>` estava coberto por acidente, porque a moldura dele
 * tem guarda própria; o `<select>` **não tinha dono nenhum** — um mutante que
 * lhe desse borda decorativa passava em silêncio, e ele é exatamente um
 * "componente de interface" no sentido da WCAG 1.4.11.
 */
const CONTROLS = ['input', 'textarea', 'select'] as const;

/**
 * As tags de abertura dos controles, do `<` até o `>` que as fecha.
 *
 * ⚠️ **NÃO DÁ PARA FAZER ISTO COM `/<input\b[\s\S]*?\/>/`, e a razão é o
 * `<select>`:** ele **não** é auto-fechado (tem `<option>` dentro), então um
 * padrão ancorado em `/>` o atravessaria inteiro ou não o acharia. E um
 * `[^>]*>` cru também não serve: `onChange={(event) => …}` tem um `>` dentro
 * do atributo. Então a contagem de chaves decide onde a tag acaba — um `>` só
 * fecha a tag quando está FORA de `{ … }`.
 */
function controlTags(source: string): string[] {
  const tags: string[] = [];
  const opens = new RegExp(`<(?:${CONTROLS.join('|')})\\b`, 'gu');

  for (const match of source.matchAll(opens)) {
    let depth = 0;
    for (let i = match.index; i < source.length; i += 1) {
      const char = source[i];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) {
        tags.push(source.slice(match.index, i + 1));
        break;
      }
    }
  }

  return tags;
}

/** O nome do elemento de uma tag de abertura: `<select …>` → `select`. */
function kindOf(tag: string): string {
  return /^<(\w+)/u.exec(tag)?.[1] ?? '';
}

/**
 * Os utilitários escritos DENTRO da tag, com a pontuação de JSX descartada.
 *
 * ⚠️ Sem a normalização, `cx(TEXT_INPUT_CLASS, 'border-line')` daria o token
 * `'border-line')}` — que não é igual a `border-line` e passaria batido. A
 * comparação tem de ser por token exato (regra 9, `utilitiesIn` do harness),
 * e para isso o que não é caractere de classe vira espaço antes.
 */
function utilitiesWrittenIn(tag: string): string[] {
  return utilitiesIn(tag.replace(/[^\w[\]#./:-]+/gu, ' '));
}

/**
 * ⚠️ **O FILETE DECORATIVO EM TODAS AS FORMAS — e nenhuma delas pinta
 * controle.** Esta lista é a metade que faltava: a primeira asserção deste
 * arquivo prova que a CONSTANTE não escreve o filete decorativo, mas não
 * pergunta se uma TELA o escreveu ao lado dela. E escrever os dois no mesmo
 * elemento não é empate: quem vence é a ordem de emissão do CSS, que ninguém
 * declara. Hoje `.border-line` sai antes de `.border-line-field` — a decisão A
 * inteira estaria dependendo da ordem alfabética.
 */
const DECORATIVE_EDGES = [
  'border-line',
  'border-line-soft',
  'border-line-strong',
] as const;

/**
 * A ÚNICA isenção que não é por tipo nativo: o `<textarea>` do trecho do
 * grifo. Ele não desenha aresta nenhuma — quem a desenha é a **moldura**
 * `border-line-field` um nó acima (decisão do dono de 2026-09-24), e quem a
 * guarda é `pages/__tests__/highlight-form.test.tsx`, nas duas rotas.
 *
 * ⚠️ **E a isenção MORDE:** ela vale enquanto o controle continuar sem borda
 * própria. No dia em que alguém lhe der uma, a asserção de baixo fica vermelha
 * em vez de a isenção o esconder.
 */
const FRAMED_BY_AN_ANCESTOR = 'highlight-fields.tsx: textarea';

/** As telas de `pages/`, sem comentário — prosa cita classe, e não é código. */
function pages(): Page[] {
  return readdirSync(PAGES_DIR)
    .filter((entry) => entry.endsWith('.tsx'))
    .sort()
    .map((file) => ({
      file,
      source: stripComments(readFileSync(resolve(PAGES_DIR, file), 'utf8')),
    }));
}

/**
 * ⚠️ **AS TELAS QUE ESCREVEM CAMPO DE TEXTO — o número fica pinado.**
 *
 * É a forma que o `ui-source-scan.test.ts` já usa para o piso de toque: o
 * valor é medido, escrito, e quem acrescentar uma tela **soma um** em vez de
 * apagar a asserção. Uma décima tela com campo entra aqui; uma tela que pare
 * de ter campo sai daqui — e nos dois casos alguém diz por escrito o que fez.
 */
const SCREENS_WITH_TEXT_FIELDS: readonly string[] = [
  'accept-invite.tsx',
  'acervo-filters.tsx',
  'book-form.tsx',
  'busca.tsx',
  'free-note-fields.tsx',
  'highlight-fields.tsx',
  'login.tsx',
  'plan-editor.tsx',
  'preferencias.tsx',
];

describe('⚠️ a borda de campo de texto tem tom PRÓPRIO (decisão A, Tarefa 48)', () => {
  it('⚠️ draws the field edge with the FIELD tone, never with the decorative fillet', () => {
    /*
      ⚠️ **POR TOKEN, NUNCA POR `includes`, E A FUNÇÃO VEM DO HARNESS** (regra
      9: a forma certa tem um dono, e quem precisa dela IMPORTA, não copia).

      Sem ela, `expect(TEXT_INPUT_CLASS).not.toContain('border-line')` ficaria
      **vermelho contra a própria entrega**, porque `border-line-field` contém
      `border-line` como substring — e o próximo leitor "consertaria" a guarda
      afrouxando a asserção, que é quando ela para de guardar.
    */
    const written = utilitiesIn(TEXT_INPUT_CLASS);

    expect(written).toContain('border-line-field');
    /*
      ⚠️ A metade negativa, e ela não é redundância: sem ela o mutante que
      ACRESCENTA `border-line` ao lado do novo passa — e no CSS emitido quem
      vence é a ordem de emissão, não a intenção de quem escreveu. É o mesmo
      raciocínio que fez a pílula de caneta nascer local na 47a.
    */
    expect(written).not.toContain('border-line');
    expect(written).not.toContain('border-line-strong');
    expect(written).not.toContain('border-line-soft');
  });

  it('⚠️ reaches all NINE screens with a text field — the constant is the only owner', () => {
    const consumers = pages()
      .filter(({ source }) => source.includes('TEXT_INPUT_CLASS'))
      .map(({ file }) => file);

    expect(consumers).toEqual([...SCREENS_WITH_TEXT_FIELDS]);
  });

  it('⚠️ leaves no text control drawing an edge of its own', () => {
    /*
      ⚠️ **A METADE QUE MEDE O ALCANCE DE VERDADE.** A asserção acima conta
      quem IMPORTA a constante; esta conta quem a USA em cada controle. As
      duas são necessárias: uma tela pode importar a constante para um campo e
      escrever o segundo à mão, e foi assim que o papel do card da prévia
      virou cópia à mão na 47b (mutante M28).

      ⚠️ **E ela varre `<input>`, `<textarea>` E `<select>`** — a primeira
      versão lia só o primeiro, e o `<select>` de leitura do acervo ficava sem
      acusador nenhum. Medido na rodada de correção: 20 controles, 18 com a
      constante e duas isenções escritas.
    */
    const handWritten: string[] = [];
    const decorated: string[] = [];
    const kinds: string[] = [];
    let nativeBox = 0;
    let framed = 0;

    for (const { file, source } of pages()) {
      for (const tag of controlTags(source)) {
        const kind = kindOf(tag);
        kinds.push(kind);

        // O `checkbox` nativo desenha a própria caixa; ele não tem borda
        // nossa para pintar. Esta isenção é por TIPO.
        if (/type="(?:checkbox|radio)"/u.test(tag)) {
          nativeBox += 1;
          continue;
        }

        const written = utilitiesWrittenIn(tag);

        if (`${file}: ${kind}` === FRAMED_BY_AN_ANCESTOR) {
          expect(written.filter((name) => name.startsWith('border'))).toEqual(
            [],
          );
          framed += 1;
          continue;
        }

        if (!tag.includes('TEXT_INPUT_CLASS')) {
          handWritten.push(`${file}: ${tag.replace(/\s+/gu, ' ')}`);
        }
        for (const edge of DECORATIVE_EDGES) {
          if (written.includes(edge)) decorated.push(`${file}: ${edge}`);
        }
      }
    }

    expect(handWritten).toEqual([]);
    /*
      ⚠️ **A TELA NÃO ANULA A DECISÃO ESCREVENDO O FILETE AO LADO.** Sem esta
      asserção, `cx(TEXT_INPUT_CLASS, 'border-line')` numa tela qualquer tem
      ZERO acusadores — e no CSS emitido quem venceria é a ordem dos seletores,
      não quem escreveu por último.
    */
    expect(decorated).toEqual([]);

    // ⚠️ As duas isenções, pinadas. Uma terceira entra com a razão escrita.
    expect(nativeBox).toBe(1);
    expect(framed).toBe(1);

    /*
      ⚠️ O pino de que a varredura VARREU — a lição do `pageSource` do
      `chrome.test.tsx`. Se `controlTags` parar de achar `<select>` (ou
      `<textarea>`), as listas acima ficam vazias e a guarda fica verde por não
      ter olhado, que é o defeito que esta rodada veio consertar.
    */
    for (const kind of CONTROLS) expect(kinds).toContain(kind);
  });
});
