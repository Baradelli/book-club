import { expect } from 'vitest';

import { readableText, withoutDiacritics } from './harness';

/**
 * ⚠️ **O ADR 0002 VIRANDO ASSERÇÃO DE TELA** —
 * `docs/adr/0002-visibilidade-total-no-clube.md`: *"Não existe conteúdo privado
 * dentro de um clube. (…) O filtro `Tudo · Minhas · de <pessoa>` é
 * **navegação**: uma forma de olhar o mesmo acervo. Ele nunca deve ser
 * apresentado, rotulado ou explicado como privacidade."*
 *
 * ⚠️ **POR QUE ELE EXISTE, JÁ HAVENDO A VARREDURA DE `ui/`.** O
 * `packages/ui/src/__tests__/adr-0002-iconography.test.ts` cobre o design
 * system inteiro — e **só** ele. Ele não vê `packages/app`, e a Tarefa 19 é
 * exatamente a fatia que o próprio docblock daquele arquivo aponta como o lugar
 * mais provável de alguém explicar uma privacidade que não existe: a listagem
 * de anotações, com um filtro por autoria em cima.
 *
 * ⚠️ **ELA NÃO PEGA DESENHO, E ISSO DEIXOU DE SER UMA LACUNA** — a rodada de
 * correção da Tarefa 25 fechou a outra metade.
 *
 * O texto anterior deste docblock dizia que *"um cadeado desenhado à mão numa
 * tela do app **passaria** por esta função"* e delegava para a guarda de
 * `packages/ui`, que varre só aquele pacote. Estava correto e era uma dívida
 * **declarada em prosa e nunca fechada** — a lição nº 5 do MVP 1 na forma mais
 * literal. A auditoria mediu: um `Lock` do `lucide-react` **e** um `<svg>` cru
 * com `path` de cadeado em toda linha do acervo de grifos davam **0 acusadores
 * em 508 testes**.
 *
 * A partição do §7.9 agora é de três, e cada guarda mora onde a propriedade é
 * decidível:
 *
 * - **desenho e ícone importado** são propriedade da FONTE, e a guarda é
 *   `./adr-0002-iconography.test.ts` (nenhum `<svg>` inline em
 *   `packages/app/src`, nenhum `Lock`/`EyeOff`/`Shield` do `lucide-react`) —
 *   espelho exata do que `ui/src/__tests__/adr-0002-iconography.test.ts` faz no
 *   design system, e ela consome a `PRIVACY_TERMS` **desta** lista, não uma
 *   cópia;
 * - **vocabulário de CATÁLOGO** é do catálogo (nos dois locales);
 * - **vocabulário RENDERIZADO** é o que está aqui: texto e os atributos que
 *   carregam texto (`readableText()`, §7.6.1 — o `aria-label` é justamente o
 *   que o leitor de tela fala), inclusive a frase que entrou na tela sem passar
 *   pelo `t()`.
 *
 * ⚠️ **E ESTA FUNÇÃO NÃO SE CHAMA À MÃO num estado novo:** o `expectNoGuilt()`
 * já a chama, desde a mesma rodada — cinco testes de estado renderizado a
 * esqueciam. → o docblock de `expectNoPrivacyTalk` abaixo.
 */

/**
 * Radicais, não palavras (a mesma disciplina do `GUILT_TERMS`), já sem acento e
 * em minúscula — a varredura passa por `withoutDiacritics`.
 *
 * Os dois idiomas, porque o vocabulário do ADR não é do `pt`: uma tela que
 * escrevesse "Only you can see this" erraria igual.
 */
export const PRIVACY_TERMS: readonly string[] = [
  // Iconografia e rótulo, em português
  'cadead', // cadeado · cadeados
  'privad', // privado · privada · privadas
  'secret',
  'oculto',
  'oculta',
  'so voc', // "só você vê", já sem acento
  'somente voc',
  'apenas voc',
  'visivel para',
  'visivel so',
  // Inglês
  'private',
  'only you',
  'visible to',
  'hidden from',
];

/**
 * ⚠️ ANCORADO À ESQUERDA, e pelo mesmo motivo medido em `ui/`: um `includes`
 * cru acusa `block`/`unlock`/`SCROLL_LOCK_CLASS` e meia dúzia de identificadores
 * legítimos. Sem âncora à direita, para o radical pegar o plural.
 */
export function mentionsPrivacyTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`\\b${escaped}`, 'u').test(text);
}

/**
 * A varredura sobre uma STRING qualquer — é o que permite as duas superfícies
 * (o DOM e o HTML do primeiro frame) compartilharem o vocabulário.
 */
export function expectNoPrivacyTalkIn(text: string): void {
  const spoken = withoutDiacritics(text);

  for (const term of PRIVACY_TERMS) {
    expect(mentionsPrivacyTerm(spoken, term)).toBe(false);
  }
}

/**
 * ⚠️ **NÃO A CHAME À MÃO NUM ESTADO NOVO: o `expectNoGuilt()` já a chama.**
 *
 * Ela era uma SEGUNDA chamada, e a auditoria da Tarefa 25 mediu o que isso
 * custa: cinco testes de estado renderizado (o `/me` morto das duas telas, a
 * rede caída da coleção, a paleta do formulário e o "tentar de novo" dele)
 * chamavam só o `expectNoGuilt`, e uma `description="Este acervo e privado:
 * somente voce ve estes grifos."` plantada no `Notice` daqueles estados dava
 * **0 acusadores em 508 testes**.
 *
 * O diagnóstico já estava escrito — no docblock do
 * `expectNoGuiltBesidesFormError`, que embute esta varredura **exatamente por
 * isso**: *"deixá-la como uma segunda chamada faz cada estado de erro depender
 * de alguém lembrar dela, e guarda que depende de memória não é guarda"*. A
 * lição estava aplicada num dos dois pontos e não no outro.
 *
 * Continua exportada porque os testes que já a chamavam continuam válidos (a
 * chamada dupla é inofensiva) e porque ela é a guarda certa para quem varre uma
 * superfície que não é o DOM da tela.
 */
export function expectNoPrivacyTalk(): void {
  expectNoPrivacyTalkIn(readableText());
}
