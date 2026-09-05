import { GUILT_TERMS } from '@clube/shared/anti-culpa';
import { expect } from 'vitest';

import { expectNoPrivacyTalk } from './adr-0002-dom';
import { readableText, withoutDiacritics } from './harness';

/**
 * ⚠️ **A VARREDURA ANTI-CULPA DO DOM — UMA SÓ, PARA AS TRÊS TELAS.**
 *
 * `docs/plano-clube-do-livro.md` §1: *"o sistema **não pune ausência de
 * registro**; valoriza qualquer registro útil. Quem está atrasado não vê dívida
 * vermelha nem 'você falhou 3 dias'."*
 *
 * ⚠️ **POR QUE ESTE ARQUIVO EXISTE, e é um achado da revisão da Tarefa 17.**
 * As telas tinham DUAS varreduras com o mesmo nome de função e forças
 * diferentes: a `home.test.tsx` ficou com a versão fraca da Tarefa 16 (palavras
 * INTEIRAS, **sem** remoção de diacrítico, **sem** regex de placar) e a
 * `book.test.tsx` ganhou a forte. MEDIDO: `"Você deixou 3 dias passarem"` e
 * `"0 de 30 dias"` plantados nas duas telas dão **0 acusadores na home** e
 * **14 na tela do livro**. Pelo §7.9 do `docs/CONVENCOES-CODIGO.md`, guarda no
 * lugar errado é **pior que nenhuma**: ela dá a sensação de cobertura, e é
 * exatamente sob essa sensação que a próxima frase entra.
 *
 * ⚠️ **E ELA NÃO É A GUARDA DO VOCABULÁRIO.** A partição do §7.9 continua:
 *
 * - **palavra de CATÁLOGO** é propriedade do catálogo, e vive em
 *   `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre
 *   `pt` **e** `en` inteiros — independe de estado, independe de locale (todo
 *   teste de tela pina `pt`, e um `"You're 3 days behind"` embarcaria sem uma
 *   linha vermelha);
 * - **o que NÃO é catálogo é DOM**, e é o que está aqui: a COR, o NÚMERO
 *   renderizado a partir de dado (um "0 de 30 dias" não está em catálogo
 *   nenhum), e a palavra que entrou na tela **sem** passar pelo `t()`.
 *
 * Chame-a em **todos** os estados de cada tela — o estado feliz incluído, que
 * na Tarefa 16 era exatamente o que faltava.
 */

/**
 * O vocabulário da cobrança vive em `@clube/shared/anti-culpa` — **uma lista
 * só**, que esta guarda e a do catálogo (`shared/src/locales/__tests__`)
 * consomem. Ele foi duas cópias até a Tarefa 19, e as duas discordaram na
 * primeira vez que uma foi corrigida. Reexportado porque os testes de tela o
 * importam daqui.
 */
export { GUILT_TERMS };
/**
 * ⚠️ **VERMELHO POR REGEX, NÃO POR DUAS STRINGS LITERAIS.**
 *
 * MEDIDO: `['text-danger', 'bg-danger']` conhecia duas grafias, e a cor entrava
 * por outras três sem que nada acusasse — `text-[#b3261e]` (valor arbitrário do
 * Tailwind v4), `bg-[#...]`, e um `style` com `--clube-danger` direto. Zero
 * acusadores em 192 testes.
 *
 * O `[#` cobre a família inteira de valores arbitrários de cor; nenhum token do
 * tema é escrito assim (`packages/ui/src/theme.css`), então um `[#` numa classe
 * de tela já é cor fora do sistema — vermelha ou não.
 */
export const DANGER_STYLE =
  /text-\[#|bg-\[#|--clube-danger|text-danger|bg-danger/u;

/**
 * O placar disfarçado: "3 de 30", "3 of 30", "3/30", "+2".
 *
 * ⚠️ Ele varre o DOM inteiro, então as referências dos fixtures são escritas
 * sem barra (`'p. 9-30'`, não `'p. 9/30'`): conteúdo do clube com uma razão
 * dentro acusaria sem haver placar nenhum. O que a varredura protege é o CROMO
 * da tela, que é o único lugar de onde um contador sairia.
 */
export const COUNTER_SHAPE = /\d+\s*(?:de|of|\/)\s*\d+|\+\s*\d+/u;

/**
 * Reexportado: a definição mora no `harness.tsx` (é o que quebra o ciclo com o
 * `adr-0002-dom.ts`), e os arquivos de teste que já o importavam daqui
 * continuam funcionando.
 */
export { withoutDiacritics };

/** `class` **e** `style`: a cor entra pelos dois. */
export function styleSurface(): string {
  return Array.from(document.querySelectorAll('*'))
    .flatMap((element) => [
      element.getAttribute('class') ?? '',
      element.getAttribute('style') ?? '',
    ])
    .join('\n');
}

/**
 * A varredura sobre a tela RENDERIZADA — texto, atributos que carregam texto
 * (o `readableText()` do harness), classes e `style`.
 */
export function expectNoGuilt(): void {
  const spoken = withoutDiacritics(readableText());
  for (const term of GUILT_TERMS) {
    expect(spoken).not.toContain(term);
  }

  expect(readableText()).not.toMatch(COUNTER_SHAPE);
  expect(styleSurface()).not.toMatch(DANGER_STYLE);
}

/**
 * A mesma varredura sobre uma STRING de HTML — para o único estado que se
 * observa fora do DOM: o primeiro frame, via `renderToString` (§7.10).
 */
export function expectNoGuiltInHtml(html: string): void {
  const spoken = withoutDiacritics(html);
  for (const term of GUILT_TERMS) {
    expect(spoken).not.toContain(term);
  }

  expect(html).not.toMatch(COUNTER_SHAPE);
  expect(html).not.toMatch(DANGER_STYLE);
}

/**
 * Comentário não é código — a mesma isenção que o `ui-source-scan.test.ts` já
 * precisou: a prosa deste projeto EXPLICA as regras, e os docblocks das telas
 * citam `text-danger`/`bg-danger` nominalmente para dizer que eles não entram.
 * Sem isto, o comentário que documenta a regra a deixaria vermelha.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, ' ')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/**
 * ⚠️ **A VARREDURA ANTI-CULPA NUM ESTADO COM ERRO DE FORMULÁRIO — UMA SÓ, PARA
 * AS DUAS TELAS DE FORMULÁRIO.**
 *
 * ⚠️ **POR QUE ELA SUBIU PARA CÁ, e é a lição da Tarefa 19 se repetindo.** Ela
 * nasceu em `free-note.test.tsx` (Tarefa 19) e foi COPIADA para
 * `book-form.test.tsx` (Tarefa 20) com uma linha a mais — a do ADR 0002. Ou
 * seja: já eram duas cópias com forças diferentes, que é exatamente como o
 * `GUILT_TERMS` viveu até a Tarefa 19 descobrir que as duas listas tinham
 * divergido na primeira correção. Aqui a concordância volta a ser estrutural.
 *
 * **O motivo de ela existir**, medido na Tarefa 19: o `Field` do design system
 * pinta a mensagem de erro do campo com `text-danger`, e as telas não podem
 * tocar `packages/ui`. Ou seja, **todo estado com campo inválido é vermelho por
 * construção**, e a varredura de cor não consegue distinguir "o título está em
 * branco" de "você deixou três dias passarem".
 *
 * Pular o `expectNoGuilt` nesses estados seria o caminho fácil — e aí a lista
 * de PALAVRAS e o formato de PLACAR deixariam de ser conferidos justamente onde
 * uma frase de cobrança caberia ("faltou preencher…"). Então aqui:
 *
 * - as palavras e o placar, iguais ao `expectNoGuilt`;
 * - a cor, **estreitada**: os elementos vermelhos da tela têm de ser
 *   EXATAMENTE as mensagens esperadas. Um ponto vermelho novo em qualquer outro
 *   lugar continua acusando;
 * - e a varredura do **ADR 0002**, que fica DENTRO de propósito (§7.9): deixá-la
 *   como uma segunda chamada faz cada estado de erro depender de alguém lembrar
 *   dela, e guarda que depende de memória não é guarda.
 *
 * O vermelho legítimo é o do FORMULÁRIO (um campo que precisa de correção),
 * nunca o do REGISTRO de leitura — que é o que o §1 do plano proíbe.
 */
export function expectNoGuiltBesidesFormError(
  expectedRed: readonly string[],
): void {
  const spoken = withoutDiacritics(readableText());
  for (const term of GUILT_TERMS) {
    expect(spoken).not.toContain(term);
  }
  expect(readableText()).not.toMatch(COUNTER_SHAPE);

  const red = Array.from(document.querySelectorAll('*')).filter(
    (element) =>
      DANGER_STYLE.test(element.getAttribute('class') ?? '') ||
      DANGER_STYLE.test(element.getAttribute('style') ?? ''),
  );
  expect(red.map((element) => element.textContent)).toEqual(expectedRed);

  expectNoPrivacyTalk();
}
