import { COUNTER_EXEMPT_KEYS, GUILT_TERMS } from '@clube/shared/anti-culpa';
import { pt } from '@clube/shared/locales';
import { expect } from 'vitest';

import { expectNoPrivacyTalk, expectNoPrivacyTalkIn } from './adr-0002-dom';
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
 *   `packages/shared/src/locales/__tests__/anti-guilt.test.ts`, que percorre o
 *   catálogo inteiro — independe de estado e de qual tela alguém lembrou de
 *   renderizar. ⚠️ Até a Tarefa 38d ele percorria também o `en`, e esse era o
 *   argumento mais forte: todo teste de tela pinava `pt`, e um
 *   `"You're 3 days behind"` no segundo catálogo embarcava sem uma linha
 *   vermelha;
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
 * Tailwind v4), `bg-[#...]`, e um `style` com a variável crua direto. Zero
 * acusadores em 192 testes.
 *
 * O `[#` cobre a família inteira de valores arbitrários de cor; nenhum token do
 * tema é escrito assim (`packages/ui/src/theme.css`), então um `[#` numa classe
 * de tela já é cor fora do sistema — vermelha ou não.
 *
 * ⚠️ **O RAMO DA VARIÁVEL CRUA FOI TROCADO NA TAREFA 39, NUNCA APAGADO.** O
 * token se chamava `--clube-danger` até o prefixo morrer (decisão A do MVP
 * 3.5); hoje ele se chama `--danger`. Uma guarda que deixa de casar qualquer
 * coisa **continua verde e para de guardar** — é a pior das duas falhas, e
 * `anti-guilt-dom.test.ts` existe exatamente para que a troca seja
 * verificável: ele planta os quatro jeitos e exige que cada um seja acusado.
 */
export const DANGER_STYLE = /text-\[#|bg-\[#|--danger|text-danger|bg-danger/u;

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
 * ⚠️ **A ISENÇÃO DO CONTADOR (Tarefa 40, decisão E) — E ELA É A PARTE DA
 * VARREDURA QUE MAIS FÁCIL SE ESTRAGA SEM NINGUÉM VER.**
 *
 * "Dia 11 de 30" é a POSIÇÃO da leitura no plano, e o dono decidiu que ela
 * entra (`docs/BACKLOG.md`, decisões fechadas do MVP 3.5). Ela tem a forma que
 * o `COUNTER_SHAPE` proíbe, então a frase é **subtraída** do texto antes de o
 * formato ser medido.
 *
 * ⚠️ **A LISTA DE CHAVES NÃO ISENTA NADA POR SI**, porque o `COUNTER_SHAPE`
 * roda sobre o DOM renderizado: no texto da tela não há caminho de chave, só
 * "Dia 11 de 30". Quem executa a isenção é esta função, que **deriva** a frase
 * de cada chave de `COUNTER_EXEMPT_KEYS` — lê o valor no catálogo, escapa cada
 * literal e troca só os buracos `{{…}}` por `\d+`.
 *
 * ⚠️ **POR QUE FRASE EXATA, E NUNCA REGEX LARGA.** Um
 * `replace(/\d+ de \d+/g, '')` deixaria tudo verde e isentaria **todo**
 * contador do app — a guarda seguiria no relatório e teria parado de guardar,
 * que é a pior das duas falhas (a lição do `DANGER_STYLE` na Tarefa 39). Aqui
 * só os DÍGITOS são variáveis: o "Dia " da frente e o " de " do meio têm de
 * casar caractere por caractere, e é isso que mantém "3 de 30 dias" acusado.
 *
 * ⚠️ **E A SUBSTITUIÇÃO É GLOBAL de propósito:** o sumário do livro tem trinta
 * linhas, e o `readableText()` do harness ainda repete o texto de cada elemento
 * numa linha própria. Subtrair só a primeira ocorrência deixaria a segunda
 * acusando, e o conserto fácil seria a regex larga.
 *
 * ⚠️⚠️ **O BURACO QUE SOBRA, MEDIDO E NÃO CONSERTADO — leia antes de "melhorar"
 * o padrão.** O `document.body.textContent` cola irmãos sem separador, então
 * dois `<p>` com "Dia 11 de 30" e "3 de 30 dias" viram
 * `"Dia 11 de 303 de 30 dias"`, e o `\d+` do buraco final engole o `303`:
 * **naquela linha** o contador não é acusado. Quem acusa é a linha por
 * ELEMENTO, que o `readableText()` também emite — e ela está pinada por
 * `anti-guilt-dom.test.ts › ⚠️ pins the per-element line of readableText()`,
 * porque até a rodada de auditoria da Tarefa 40 nada a pinava.
 *
 * ⚠️ **`(?!\d)` no fim do padrão NÃO resolve, e foi medido:** `\d+` guloso já
 * para no primeiro não-dígito, então a asserção é sempre verdadeira e o `303`
 * continua dentro do casamento. As quatro variantes (`\d+`, `\d+(?!\d)`,
 * `\d+?(?!\d)`, `(?<!\d)…(?!\d)`) casam **exatamente a mesma coisa**. Nada foi
 * acrescentado ao padrão de propósito: uma asserção que não muda o casamento
 * pareceria o conserto sem ser, e o próximo leitor a trataria como resolvido.
 *
 * ⚠️ **O SOBREVIVENTE EQUIVALENTE, com a prova.** Rotear também o VOCABULÁRIO
 * pela subtração (varrer os `GUILT_TERMS` no texto já subtraído, em vez do
 * texto inteiro) sobrevive com **zero acusadores**. É equivalente HOJE, e a
 * prova é de inalcançabilidade: os literais do único padrão de hoje são `'Dia '`
 * e `' de '`, e nenhum dos 12 `GUILT_TERMS` (`atras`, `' tras'`, `atraz`,
 * `deixou`, `penden`, `divida`, `falta`, `perdeu`, `behind`, `overdue`,
 * `missed`, `streak`) é substring de nenhum dos dois — então a subtração não
 * pode apagar termo nenhum. ⚠️ **Deixa de ser equivalente no dia em que a lista
 * de chaves isentas crescer**: uma frase isenta que contenha um radical (um
 * "Dia 3 · faltam 2" qualquer) passaria a esconder a palavra também. Por isso a
 * ordem das linhas em `expectNoGuilt()` é deliberada, e está escrita lá.
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function exemptCounterPatterns(): RegExp[] {
  return COUNTER_EXEMPT_KEYS.map((key) => {
    const template = key
      .split('.')
      .reduce<unknown>(
        (node, segment) => (node as Record<string, unknown>)[segment],
        pt,
      );

    /*
      ⚠️ O caminho morto não passa calado. Uma chave isenta com um segmento
      errado (`pages.book.plan.dayOfPan`) daria `undefined`, e uma subtração de
      string vazia isentaria... nada, com a guarda verde. O acusador do lado do
      catálogo é `anti-guilt.test.ts` (`as chaves isentas do contador existem no
      catálogo pt`); esta linha é o do lado de cá.
    */
    expect(typeof template).toBe('string');

    const literals = (template as string)
      .split(/\{\{[A-Za-z][A-Za-z0-9]*\}\}/gu)
      .map(escapeForRegExp);

    return new RegExp(literals.join('\\d+'), 'gu');
  });
}

/**
 * O texto sem as frases isentas, e **quantas** foram subtraídas de fato.
 *
 * A contagem é o que a decisão F consome: uma isenção que nunca subtrai nada é
 * letra morta, e letra morta isenta um texto FUTURO de mesmo formato sem
 * ninguém reparar.
 */
export function withoutExemptCounters(text: string): {
  text: string;
  removed: number;
} {
  let result = text;
  let removed = 0;

  for (const pattern of exemptCounterPatterns()) {
    const matches = result.match(pattern);
    if (matches !== null) removed += matches.length;
    result = result.replace(pattern, ' ');
  }

  return { text: result, removed };
}

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
 *
 * ⚠️ **E A VARREDURA DO ADR 0002 MORA DENTRO DELA, desde a rodada de correção
 * da Tarefa 25.** Ela era uma segunda chamada, e a auditoria mediu o preço: nos
 * cinco estados que chamavam só esta função — o `/me` morto das duas telas de
 * grifo, a rede caída da coleção, a paleta do formulário e o "tentar de novo"
 * dele — uma frase de privacidade plantada no `Notice` dava **0 acusadores em
 * 508 testes**.
 *
 * O diagnóstico já estava escrito no docblock do
 * `expectNoGuiltBesidesFormError` logo abaixo, que a embute **exatamente por
 * este motivo**, e a lição não tinha sido aplicada aqui: guarda que depende de
 * alguém lembrar de chamá-la não é guarda (§7.9). Agora as duas famílias de
 * estado — a normal e a com erro de formulário — passam pela mesma checagem,
 * por construção.
 */
function scanGuilt(): number {
  const spoken = withoutDiacritics(readableText());
  for (const term of GUILT_TERMS) {
    expect(spoken).not.toContain(term);
  }

  /*
    ⚠️ A subtração das frases isentas (Tarefa 40, decisão E) entra SÓ na medida
    do FORMATO. O vocabulário acima e a cor abaixo continuam vendo o texto
    inteiro: a isenção é do `COUNTER_SHAPE`, não um passe livre para a frase.
  */
  const { text, removed } = withoutExemptCounters(readableText());
  expect(text).not.toMatch(COUNTER_SHAPE);
  expect(styleSurface()).not.toMatch(DANGER_STYLE);
  expectNoPrivacyTalk();

  return removed;
}

export function expectNoGuilt(): void {
  /*
    ⚠️ **`toBe(0)`, E NÃO "nada" — a metade que nasceu na rodada de correção da
    Tarefa 44.** Veja o docblock de `expectNoGuiltWithPlanPosition()` logo
    abaixo: as duas variantes são MUTUAMENTE EXCLUSIVAS de propósito, e é isso
    que faz a troca de uma pela outra ficar vermelha no estado em que acontece.
  */
  expect(scanGuilt()).toBe(0);
}

/**
 * ⚠️ **A VARREDURA DOS ESTADOS QUE MOSTRAM A POSIÇÃO NO PLANO (Tarefa 40,
 * decisão F) — e ela existe para a isenção não virar letra morta.**
 *
 * `expectNoGuilt()` fica verde quando nenhuma frase isenta está na tela, e
 * **tem de ficar**: a maioria das telas não fala do plano, e um estado de
 * carregamento não mostra plano nenhum — exigir uma subtração ali seria a
 * asserção vazia do §7.4 virada do avesso. Mas uma isenção que nunca subtrai
 * nada também nunca é medida, e no dia em que um texto novo tiver o mesmo
 * formato ela o isentará sem ninguém reparar.
 *
 * Daí esta variante, no molde do `expectNoGuiltBesidesFormError`: ela mede tudo
 * o que o `expectNoGuilt()` mede **e** exige ≥ 1 subtração efetiva.
 *
 * ⚠️ **EM QUE ESTADOS ELA VALE, por escrito:** só naqueles em que a tela mostra
 * a posição no plano — a tela do livro com plano carregado, a tela do dia, e o
 * bloco de hoje no Início (Tarefas 42–45). Em carregamento, em erro, com plano
 * vazio e em toda tela que não fala do plano, quem se chama é o
 * `expectNoGuilt()`.
 *
 * ⚠️ **A TELA DO LIVRO A CHAMA DESDE A TAREFA 44** — era a decisão H da Tarefa
 * 40 ("as chaves nascem sem consumidor, e a tela vem nas 42–48") se cumprindo.
 * O par positivo de `anti-guilt-dom.test.ts` continua exercitando os dois lados
 * sem tela nenhuma, inclusive o mutante "a frase isenta saiu da tela".
 *
 * ⚠️⚠️ **AS DUAS VARIANTES SÃO MUTUAMENTE EXCLUSIVAS, e isso é DESENHO — não
 * sobrou assim.** Medido na rodada de correção da Tarefa 44: enquanto esta
 * função era `expectNoGuilt()` **mais** uma exigência, ela era superconjunto da
 * outra, e trocá-la pela outra numa tela apenas REMOVIA uma asserção. Asserção
 * removida nunca fica vermelha sozinha — o mutante obrigatório da regra 3 da
 * Tarefa 44 sobrevivia por causa da FORMA ANINHADA, e o conserto de então foi
 * um pino que lia o próprio fonte do teste e contava chamadas (≥ 45).
 *
 * Hoje as duas dividem o núcleo `scanGuilt()`, que devolve **quantas** frases
 * isentas foram subtraídas, e discordam só no veredito sobre esse número:
 * `expectNoGuilt()` exige **0**, esta exige **> 0**. Consequências:
 *
 * - trocar esta pela de sempre num estado com posição → **vermelho ali**;
 * - deixar a posição vazar num estado que não deveria mostrá-la (carregamento,
 *   erro, plano sem dia de hoje) → **vermelho ali** — o defeito INVERSO, que o
 *   pino de contagem não via;
 * - e nenhum número escrito à mão precisa ser mantido.
 *
 * ⚠️ **O QUE ISSO CUSTA, por escrito:** `expectNoGuilt()` deixou de ser neutra
 * quanto à frase isenta e passou a RECUSÁ-LA. É seguro enquanto a
 * `COUNTER_EXEMPT_KEYS` for o que é — `pages.book.plan.dayOfPlan` sozinha, com
 * **um** consumidor de produção. Quem isentar uma frase presente em toda tela
 * verá o vermelho na hora, e terá de rever esta divisão em vez de descobri-la
 * tarde.
 */
export function expectNoGuiltWithPlanPosition(): void {
  expect(scanGuilt()).toBeGreaterThan(0);
}

/**
 * A mesma varredura sobre uma STRING de HTML — para o único estado que se
 * observa fora do DOM: o primeiro frame, via `renderToString` (§7.10).
 *
 * Ela também embute o ADR 0002, pela mesma razão da função acima: o primeiro
 * frame é um estado como qualquer outro, e é justamente aquele em que ninguém
 * lembra de acrescentar uma segunda chamada.
 */
export function expectNoGuiltInHtml(html: string): void {
  const spoken = withoutDiacritics(html);
  for (const term of GUILT_TERMS) {
    expect(spoken).not.toContain(term);
  }

  /* A mesma isenção da função acima, e só sobre o formato. */
  expect(withoutExemptCounters(html).text).not.toMatch(COUNTER_SHAPE);
  expect(html).not.toMatch(DANGER_STYLE);
  expectNoPrivacyTalkIn(html);
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
  /* A mesma isenção das duas funções acima, e só sobre o formato. */
  expect(withoutExemptCounters(readableText()).text).not.toMatch(COUNTER_SHAPE);

  const red = Array.from(document.querySelectorAll('*')).filter(
    (element) =>
      DANGER_STYLE.test(element.getAttribute('class') ?? '') ||
      DANGER_STYLE.test(element.getAttribute('style') ?? ''),
  );
  expect(red.map((element) => element.textContent)).toEqual(expectedRed);

  expectNoPrivacyTalk();
}
