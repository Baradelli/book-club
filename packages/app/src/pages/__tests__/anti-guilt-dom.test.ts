import { pt } from '@clube/shared/locales';
import { afterEach, describe, expect, it } from 'vitest';

import { planDayLabel } from '../plan-day-label';
import {
  COUNTER_SHAPE,
  DANGER_STYLE,
  expectNoGuilt,
  expectNoGuiltBesidesFormError,
  expectNoGuiltInHtml,
  expectNoGuiltWithPlanPosition,
  PLAN_DAY_LABEL_ATTRIBUTE,
  PLAN_DAY_LABEL_SHAPE,
} from './anti-guilt-dom';
import { readableText } from './harness';

/**
 * ⚠️ **O PAR POSITIVO DA VARREDURA DE COR — a guarda medida contra ela mesma.**
 *
 * `docs/CONVENCOES-CODIGO.md` §7.9: *"uma guarda no lugar errado é pior que
 * nenhuma, porque ela dá a sensação de cobertura"*. E há uma falha pior que
 * essa: a guarda que **deixa de casar qualquer coisa**. Ela continua verde em
 * todos os 811 testes do app, some do relatório e para de guardar no mesmo
 * instante — sem uma linha vermelha.
 *
 * Foi exatamente esse o risco da Tarefa 39: o `DANGER_STYLE` é regex e um dos
 * ramos dele era `--clube-danger`, o nome do token ANTES de o prefixo morrer.
 * Trocar o ramo por `--danger` é uma edição de quatro caracteres, e **rodar a
 * suíte e ver verde não distingue "trocou certo" de "apagou o ramo"** — as duas
 * coisas ficam verdes.
 *
 * Por isso este arquivo existe, e por isso ele é **positivo**: ele planta a cor
 * proibida dos quatro jeitos por onde ela entra e exige que cada um seja
 * ACUSADO. Apagar um ramo do regex deixa o par vermelho; é a única forma de a
 * troca ser verificável.
 *
 * Os quatro jeitos são os MEDIDOS na Tarefa 16, quando a varredura era
 * `['text-danger', 'bg-danger']` (duas strings literais) e três deles passavam
 * em 192 testes sem um acusador.
 */

/** `class` e `style`, os dois atributos por onde a cor chega ao DOM. */
const FOUR_WAYS_IN: ReadonlyArray<readonly [string, string, string]> = [
  ['a text utility', 'class', 'text-danger'],
  ['a background utility', 'class', 'bg-danger'],
  ['an arbitrary hex value', 'class', 'text-[#b3261e]'],
  ['the raw custom property', 'style', 'color: var(--danger)'],
];

function plant(attribute: string, value: string): void {
  document.body.innerHTML = `<p ${attribute}="${value}">uma frase qualquer</p>`;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DANGER_STYLE bites on every way the colour gets in', () => {
  it.each(FOUR_WAYS_IN)('matches %s', (_name, _attribute, value) => {
    // O regex sozinho, sem DOM: é ele que os três consumidores compartilham.
    expect(value).toMatch(DANGER_STYLE);
  });

  it.each(FOUR_WAYS_IN)(
    'makes expectNoGuilt() fail on %s',
    (_name, attribute, value) => {
      plant(attribute, value);

      // A guarda pelo ponto de entrada REAL — é assim que as 15 telas a
      // chamam. Provar só o regex deixaria passar um `styleSurface()` que
      // parasse de ler o atributo.
      expect(() => expectNoGuilt()).toThrow();
    },
  );

  it.each(FOUR_WAYS_IN)(
    'makes expectNoGuiltBesidesFormError() fail on %s',
    (_name, attribute, value) => {
      plant(attribute, value);

      // A variante de formulário NÃO ignora a cor: ela a estreita. Um ponto
      // vermelho fora da lista esperada continua acusando — e a lista vazia é
      // o caso "esta tela não tem erro de campo nenhum".
      expect(() => expectNoGuiltBesidesFormError([])).toThrow();
    },
  );

  it.each(FOUR_WAYS_IN)(
    'makes expectNoGuiltInHtml() fail on %s',
    (_name, attribute, value) => {
      // O primeiro frame (`renderToString`) é um estado como qualquer outro, e
      // é o único que se observa fora do DOM (§7.10).
      expect(() =>
        expectNoGuiltInHtml(`<p ${attribute}="${value}">uma frase</p>`),
      ).toThrow();
    },
  );

  it('does NOT match the colour the app is allowed to use', () => {
    // Sem esta linha o par acima ficaria verde com um regex que casa tudo
    // (`/./`), e uma guarda que acusa sempre é tão inútil quanto uma que nunca
    // acusa — ela seria desligada na primeira tela.
    expect('text-content bg-surface rounded-control').not.toMatch(DANGER_STYLE);
    expect('color: var(--accent)').not.toMatch(DANGER_STYLE);
  });

  it('names the token the theme actually declares', () => {
    // O pino cruzado: o ramo do regex tem de ser o nome que o `theme.css`
    // declara HOJE. Com `--clube-danger` (o nome morto) este teste fica
    // vermelho, e é esse vermelho que faltava na Tarefa 39.
    expect(DANGER_STYLE.source).toContain('--danger');
    expect(DANGER_STYLE.source).not.toContain('--clube-danger');
  });
});

describe('COUNTER_SHAPE still bites, and only on a scoreboard', () => {
  it('matches the scoreboard shapes', () => {
    // Companheiro do par acima: as duas constantes são exportadas juntas e
    // consumidas juntas, e uma delas sem par positivo é a próxima a apagar.
    for (const scoreboard of ['3 de 30', '3 of 30', '3/30', '+2']) {
      expect(scoreboard).toMatch(COUNTER_SHAPE);
    }
  });

  it('leaves a page reference alone', () => {
    // `'p. 9-30'` é conteúdo do clube, não placar — é por isso que os fixtures
    // escrevem a faixa com hífen.
    expect('p. 9-30').not.toMatch(COUNTER_SHAPE);
  });
});

/**
 * ⚠️ **O PAR POSITIVO DA ISENÇÃO DO CONTADOR (Tarefa 40, decisões E e F).**
 *
 * "Dia 11 de 30" é a POSIÇÃO da leitura no plano, e o dono decidiu que ela
 * entra (`docs/BACKLOG.md`, decisões fechadas do MVP 3.5). Ela tem a forma que
 * o `COUNTER_SHAPE` proíbe, então a varredura subtrai a frase isenta do texto
 * ANTES de medir o formato.
 *
 * ⚠️ **E É AQUI QUE A ISENÇÃO PODE VIRAR UM BURACO.** Três maneiras de
 * estragá-la, e uma linha para cada:
 *
 * 1. **apagar a subtração** — a frase legítima volta a ser acusada, e a
 *    Tarefa 44 "conserta" isso afrouxando o `COUNTER_SHAPE`;
 * 2. **subtrair por regex larga** (`/\d+ de \d+/g`) — todo contador do app
 *    passa a ser legal, a guarda morre calada e nenhum teste fica vermelho;
 * 3. **subtrair só a primeira ocorrência** — duas frases de posição na mesma
 *    tela (o sumário tem 30 linhas) deixariam a segunda acusando, e o conserto
 *    fácil seria voltar para o item 2.
 *
 * Cada um dos três tem o seu caso abaixo, e eles falham em direções
 * diferentes: 1 fica vermelho no caso (a), 2 fica vermelho no caso (b), 3 fica
 * vermelho no caso (c).
 */
describe('⚠️ the plan position is exempt, and the exemption opens no hole', () => {
  /*
    A frase vem do CATÁLOGO, interpolada — não uma literal copiada para cá. Se
    a chave mudar de texto, a subtração e este par mudam juntos; se ela mudar
    de LUGAR, o teste de existência do `anti-guilt.test.ts` acusa em `shared`.
  */
  const POSITION = pt.pages.book.plan.dayOfPlan
    .replace('{{number}}', '11')
    .replace('{{total}}', '30');

  it('starts from a phrase the counter guard WOULD refuse', () => {
    /*
      ⚠️ O par positivo da premissa (§7.4): se a frase isenta deixasse de ter a
      forma de placar, os três casos abaixo ficariam verdes provando nada — e a
      isenção seria uma lista que não isenta coisa nenhuma. Com "Dia 11º" no
      lugar, esta linha fica vermelha e diz exatamente isso.
    */
    expect(POSITION).toBe('Dia 11 de 30');
    expect(POSITION).toMatch(COUNTER_SHAPE);
  });

  /*
    ⚠️ **OS CASOS (a), (b) E (c) PASSARAM A CHAMAR A VARIANTE ESTRITA na rodada
    de correção da Tarefa 44, e isso NÃO os afrouxa.** Nos três a frase isenta
    está na tela, e desde que as duas variantes são mutuamente exclusivas
    (veja o `it()` `(f) … MUTUALLY EXCLUSIVE`) quem varre um DOM com posição no
    plano é esta. A propriedade medida é a mesma de antes, mutante a mutante:

    - apagar a subtração → (a) fica vermelho (o `COUNTER_SHAPE` volta a casar);
    - subtrair por regex larga → (b) fica vermelho (o placar de verdade passa);
    - subtrair só a primeira ocorrência → (c) fica vermelho.
  */
  it('(a) lets the plan position through', () => {
    document.body.innerHTML = `<p>${POSITION}</p>`;

    expect(() => expectNoGuiltWithPlanPosition()).not.toThrow();
  });

  it('(b) still accuses a real counter on the same screen', () => {
    /*
      ⚠️ **ESTE É O CASO QUE A REGEX LARGA MATA.** "3 de 30 dias" é placar: ele
      conta o que foi feito contra o que havia para fazer, que é a comparação
      que o §1 do plano proíbe. Ele está na MESMA tela que a frase isenta, e
      continua acusado — a subtração é por frase exata, e "3 de 30 dias" não
      tem o "Dia " na frente.
    */
    document.body.innerHTML = `<p>${POSITION}</p><p>3 de 30 dias</p>`;

    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });

  /**
   * ⚠️ **A ISENÇÃO VIVE EM QUATRO FUNÇÕES, E O PAR POSITIVO COBRIA DUAS —
   * medido pela auditoria da Tarefa 40.**
   *
   * Trocar a subtração exata pela regex larga **dentro** do
   * `expectNoGuiltInHtml` ou do `expectNoGuiltBesidesFormError` dava **zero
   * acusadores em 861 testes**, nas duas. Ou seja: o atalho que o docblock
   * deste arquivo chama de "a pior das duas falhas" tinha dois caminhos
   * abertos, e os casos (a)–(c) acima só fechavam o do `expectNoGuilt()`.
   *
   * E os dois caminhos não são periféricos:
   *
   * - `expectNoGuiltBesidesFormError` é a varredura de **todo estado de campo
   *   inválido** da avulsa e do formulário de livro;
   * - `expectNoGuiltInHtml` é a do **primeiro frame** (§7.10), o único estado
   *   que se observa fora do DOM.
   *
   * ⚠️ E o arquivo já sabia fazer isso: o par do `DANGER_STYLE`, logo acima,
   * planta os quatro jeitos pelas TRÊS funções. A lição é a de sempre — guarda
   * que depende de alguém lembrar de estender não fica estendida.
   */
  /**
   * ⚠️ **O CASO (b) NO MESMO ELEMENTO — e ele existe porque a auditoria mediu
   * que o (b) de dois elementos passava por uma coincidência.**
   *
   * `document.body.textContent` **cola** os irmãos sem separador: os dois `<p>`
   * do caso (b) viram `"Dia 11 de 303 de 30 dias"`, e aí o `\d+` do buraco final
   * engole o `303`. Nessa linha o contador **não** é acusado; quem acusa é a
   * linha por ELEMENTO que o `readableText()` também emite (harness, desde a
   * Tarefa 25, por um motivo não relacionado).
   *
   * ⚠️ **MEDIDO NESTA RODADA, e contra o que a auditoria propôs:** acrescentar
   * `(?!\d)` ao fim do padrão **não conserta nada** — `\d+` guloso já para no
   * primeiro não-dígito, então a asserção é sempre verdadeira e o `303`
   * continua dentro do casamento. As quatro variantes testadas (`\d+`,
   * `\d+(?!\d)`, `\d+?(?!\d)` e `(?<!\d)…(?!\d)`) casam **todas** a mesma coisa.
   * Por isso o padrão NÃO ganhou uma asserção decorativa: ela pareceria o
   * conserto sem ser.
   *
   * O que este caso faz é tirar a propriedade da dependência: as duas frases num
   * elemento só, sem colagem possível, e o contador continua acusado.
   */
  it('(b) accuses the real counter inside the SAME element, with no glueing', () => {
    document.body.innerHTML = `<p>${POSITION} — 3 de 30 dias</p>`;

    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });

  it('⚠️ pins the per-element line of readableText(), which case (b) leans on', () => {
    /*
      A linha colada engole o contador quando ele vem IMEDIATAMENTE depois da
      frase isenta e a fronteira é dígito|dígito. O que salva o caso (b) de dois
      elementos é o `readableText()` emitir também o texto PRÓPRIO de cada
      elemento, numa linha cada. Isso não era pinado em lugar nenhum — era
      herança da rodada de correção da Tarefa 25, feita por outro motivo (a
      varredura do ADR 0002 ancorada por `\b`).

      Se alguém "simplificar" o harness para devolver só o `body.textContent`,
      esta linha fica vermelha **aqui**, no arquivo que depende disso, em vez de
      a isenção abrir um buraco calado.
    */
    document.body.innerHTML = `<p>${POSITION}</p><p>3 de 30 dias</p>`;
    const lines = readableText().split('\n');

    expect(lines).toContain(POSITION);
    expect(lines).toContain('3 de 30 dias');
  });

  it('(b) accuses the real counter through expectNoGuiltInHtml() too', () => {
    const html = `<p>${POSITION}</p><p>3 de 30 dias</p>`;
    expect(() => expectNoGuiltInHtml(html)).toThrow();

    // O outro lado, senão a linha acima ficaria verde com uma função que
    // sempre lança.
    expect(() => expectNoGuiltInHtml(`<p>${POSITION}</p>`)).not.toThrow();
  });

  it('(b) accuses the real counter through expectNoGuiltBesidesFormError() too', () => {
    document.body.innerHTML = `<p>${POSITION}</p><p>3 de 30 dias</p>`;
    expect(() => expectNoGuiltBesidesFormError([])).toThrow();

    document.body.innerHTML = `<p>${POSITION}</p>`;
    expect(() => expectNoGuiltBesidesFormError([])).not.toThrow();
  });

  it('(c) subtracts EVERY occurrence, and still sees the counter between them', () => {
    // Duas linhas de sumário, como a tela do livro terá trinta.
    document.body.innerHTML = `<p>${POSITION}</p><p>Dia 12 de 30</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).not.toThrow();

    // E o contador de verdade no meio delas não passa de carona.
    document.body.innerHTML = `<p>${POSITION}</p><p>7 de 30</p><p>Dia 12 de 30</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });

  /**
   * ⚠️ **A DECISÃO F: a isenção tem de ser USADA para valer.**
   *
   * Uma isenção que nunca subtrai nada é letra morta — e letra morta isenta,
   * no dia seguinte, um texto FUTURO de mesmo formato sem ninguém reparar. Daí
   * a variante que exige ≥ 1 subtração efetiva.
   *
   * ⚠️ **EM QUE ESTADOS ELA VALE, por escrito, porque a exigência ao contrário
   * é a asserção vazia do §7.4 virada do avesso:** só nos estados em que a
   * tela MOSTRA a posição no plano — a tela do livro com plano carregado, a
   * tela do dia, e o bloco de hoje no Início (Tarefas 42–45). Nos estados de
   * carregamento, de erro, de plano vazio e em toda tela que não fala do plano,
   * quem se chama é o `expectNoGuilt()`: lá não há posição nenhuma para
   * subtrair, e exigir uma seria exigir que a tela cobrasse.
   */
  it('(f) refuses to call itself satisfied when the exempt phrase is NOT on screen', () => {
    document.body.innerHTML = `<p>${POSITION}</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).not.toThrow();

    // O mutante da regra 5: a frase isenta sai da tela. A variante acusa.
    document.body.innerHTML = '<p>Dias do plano de leitura</p>';
    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });

  /**
   * ⚠️⚠️ **AS DUAS VARIANTES SÃO MUTUAMENTE EXCLUSIVAS — e esta é a
   * propriedade que faltava, medida na rodada de correção da Tarefa 44.**
   *
   * A forma ANTERIOR era ANINHADA: `expectNoGuiltWithPlanPosition()` chamava
   * `expectNoGuilt()` e acrescentava `expect(removed).toBeGreaterThan(0)`. Ou
   * seja, a estrita era **superconjunto** da de sempre, e trocar uma pela
   * outra numa tela só REMOVIA uma asserção. Asserção removida não fica
   * vermelha sozinha: o mutante obrigatório da regra 3 da Tarefa 44
   * sobrevivia, e o conserto de lá foi um pino que lia o próprio fonte do
   * teste e contava chamadas.
   *
   * ⚠️ **O pino de fonte era estritamente mais FRACO, e por duas razões:** ele
   * contava ocorrências em vez de medir a tela, e não via o defeito INVERSO —
   * uma frase de posição vazando num estado que não deveria mostrá-la (o
   * carregamento, o erro, o plano sem dia de hoje). Com as duas variantes
   * exclusivas, os dois defeitos ficam vermelhos no estado em que acontecem, e
   * nenhum número precisa ser escrito à mão.
   *
   * ⚠️ **O QUE ISTO CUSTA, por escrito:** `expectNoGuilt()` deixou de ser
   * neutra quanto à frase isenta e passou a RECUSÁ-LA. Isso só é seguro
   * enquanto a `COUNTER_EXEMPT_KEYS` tiver as chaves que tem: hoje
   * `pages.book.plan.dayOfPlan` é a única, com **um** consumidor de produção
   * (`book.tsx`). Quem isentar uma frase que apareça em toda tela terá de
   * rever esta divisão — e o vermelho aparece na hora, em toda tela que a
   * mostrar.
   */
  it('⚠️ (f) the two variants are MUTUALLY EXCLUSIVE on the same DOM', () => {
    document.body.innerHTML = `<p>${POSITION}</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).not.toThrow();
    // ⚠️ A metade NOVA: a de sempre RECUSA a posição no plano.
    expect(() => expectNoGuilt()).toThrow();

    document.body.innerHTML = '<p>Dias do plano de leitura</p>';
    expect(() => expectNoGuilt()).not.toThrow();
    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });

  it('(f) keeps measuring everything expectNoGuilt() measures', () => {
    /*
      Sem esta linha a variante poderia ter trocado a varredura pela contagem —
      e aí a tela que mostra a posição no plano seria a ÚNICA sem varredura de
      cor e de vocabulário.
    */
    document.body.innerHTML = `<p>${POSITION}</p><p class="text-danger">x</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).toThrow();

    document.body.innerHTML = `<p>${POSITION}</p><p>Você está em atrazo</p>`;
    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });
});

/**
 * ⚠️ **A ISENÇÃO DO RÓTULO DO DIA DO PLANO — decisão do DONO, 2026-10-07
 * (Tarefa 48a), perguntado diretamente.** O `DD/MM · tema` do grifo tem a
 * forma que o `COUNTER_SHAPE` proíbe ("07/10" parece "3/30"), e o dono
 * escolheu MANTER o formato e isentá-lo, em vez de "7 out · tema".
 *
 * A isenção é estreita nos DOIS eixos, e cada eixo tem caso negativo aqui:
 *
 * - **a forma exata**: `DD/MM` com dois dígitos (dia 01–31, mês 01–12),
 *   seguido de `" · "` e de um tema — e só o PREFIXO `DD/MM · ` sai do texto:
 *   o tema continua varrido;
 * - **o lugar**: só o texto de um elemento marcado com
 *   `data-plan-day-label`, que só o select do formulário, a linha do acervo
 *   e a prévia põem.
 *
 * ⚠️ **O risco aceito pelo dono, por escrito:** um placar disfarçado de data
 * na forma exata, num desses três lugares, passaria.
 */
describe('⚠️ the plan-day label is exempt (owner, 2026-10-07), and the exemption opens no hole', () => {
  const LABEL = planDayLabel({ date: '2026-10-07', title: 'Cap. 2' });

  function marked(text: string): string {
    return `<span ${PLAN_DAY_LABEL_ATTRIBUTE}="">${text}</span>`;
  }

  it('starts from a label the counter guard WOULD refuse, produced by the one owner of the format', () => {
    expect(LABEL).toBe('07/10 · Cap. 2');
    expect(LABEL).toMatch(COUNTER_SHAPE);
    expect(LABEL).toMatch(PLAN_DAY_LABEL_SHAPE);
  });

  it('lets the marked label through, in an <option> and in a <span>', () => {
    document.body.innerHTML = `<select><option value="">Sem dia do plano</option><option ${PLAN_DAY_LABEL_ATTRIBUTE}="" value="p-2">${LABEL}</option></select>${marked('01/12 · O fim')}`;

    expect(() => expectNoGuilt()).not.toThrow();
  });

  /*
    ⚠️ OS NEGATIVOS OBRIGATÓRIOS. Cada um num elemento MARCADO — o lugar
    certo —, para que só a FORMA decida. Trocar a regex da isenção por
    `\d+/\d+` deixa estes vermelhos.
  */
  it.each([
    ['a bare scoreboard', '3/30'],
    ['a scoreboard with a unit', '3/30 dias'],
    ['a bare DD/MM with no " · theme"', '07/10'],
    ['a day without the leading zero', '7/10 · x'],
    ['a month without the leading zero', '07/1 · x'],
    ['a day past 31', '32/10 · x'],
    ['a month past 12', '07/13 · x'],
    ['day zero', '00/10 · x'],
  ])('still accuses %s, even inside a marked element', (_label, text) => {
    document.body.innerHTML = marked(text);

    expect(() => expectNoGuilt()).toThrow();
  });

  it('still accuses the exact label shape OUTSIDE the three marked places', () => {
    document.body.innerHTML = `<p>${LABEL}</p>`;

    expect(() => expectNoGuilt()).toThrow();
  });

  it('still accuses a real counter on the same screen as a marked label', () => {
    document.body.innerHTML = `${marked(LABEL)}<p>3/30 lidos</p>`;

    expect(() => expectNoGuilt()).toThrow();
  });

  /*
    ⚠️ **A ISENÇÃO É POR ELEMENTO, não pela string da tela inteira** (achado
    MÉDIO da revisão da 48a). A primeira versão recolhia o prefixo dos
    elementos marcados e o apagava do texto TODO: um \`<p>\` SEM marca com o
    MESMO prefixo passava junto. Aqui o \`<p>\` sozinho seria acusado — e
    continua acusado ao lado do rótulo marcado.
  */
  it('still accuses an UNMARKED element that repeats the prefix of a marked label', () => {
    document.body.innerHTML = `${marked(LABEL)}<p>07/10 · lidos</p>`;

    expect(() => expectNoGuilt()).toThrow();
  });

  /*
    A isenção tira o prefixo do nó de texto no DOM VIVO, lê, e devolve. Uma
    varredura que deixasse a tela alterada mudaria o que as asserções
    seguintes do mesmo teste veem.
  */
  it('leaves the DOM exactly as it found it, on success and on failure', () => {
    document.body.innerHTML = marked(LABEL);
    expectNoGuilt();
    expect(document.body.textContent).toBe(LABEL);

    document.body.innerHTML = `${marked(LABEL)}<p>3/30</p>`;
    expect(() => expectNoGuilt()).toThrow();
    expect(document.body.textContent).toBe(`${LABEL}3/30`);
  });

  it('still accuses an UNMARKED element with the same prefix and a guilt word', () => {
    document.body.innerHTML = `${marked(LABEL)}<p>07/10 · você está atrasado</p>`;

    expect(() => expectNoGuilt()).toThrow();
  });

  it('still scans the THEME: a counter after the exempt prefix is accused', () => {
    document.body.innerHTML = marked('07/10 · 3/30 lidos');

    expect(() => expectNoGuilt()).toThrow();
  });

  it('still scans the vocabulary of a marked label', () => {
    document.body.innerHTML = marked('07/10 · você está atrasado');

    expect(() => expectNoGuilt()).toThrow();
  });

  /*
    A isenção do rótulo NÃO é a posição no plano: ela não conta como
    subtração da `expectNoGuiltWithPlanPosition()`, e por isso não desfaz a
    exclusividade mútua das duas variantes.
  */
  it('applies the same exemption, and the same negatives, in the form-error variant', () => {
    document.body.innerHTML = marked(LABEL);
    expect(() => expectNoGuiltBesidesFormError([])).not.toThrow();

    document.body.innerHTML = marked('3/30');
    expect(() => expectNoGuiltBesidesFormError([])).toThrow();
  });

  it('does not count as a plan position for the strict variant', () => {
    document.body.innerHTML = marked(LABEL);

    expect(() => expectNoGuiltWithPlanPosition()).toThrow();
  });
});
