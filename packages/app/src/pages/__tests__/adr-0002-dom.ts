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
 * ⚠️ **E ELE É MAIS FRACO QUE O DE `ui/`, DE PROPÓSITO — a diferença está
 * medida.** Lá a guarda mais forte é *"nenhum `<svg>` inline"*, que transforma
 * todo glifo em NOME e faz o desenho cair na varredura de palavras. Aqui isso é
 * impossível: o `PersonAvatar` renderiza o `<svg>` do `lucide-react` (o glifo
 * neutro de "sem nome"), então um cadeado desenhado à mão numa tela do app
 * **passaria** por esta função. A guarda que pega desenho continua sendo a de
 * `ui/`, e a saída correta para um ícone novo é ele vir do `lucide-react` e do
 * design system — nunca um `<svg>` escrito numa tela.
 *
 * O que ESTA função guarda é o VOCABULÁRIO renderizado: texto e os atributos
 * que carregam texto (`readableText()`, §7.6.1 — o `aria-label` é justamente o
 * que o leitor de tela fala).
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
 * Chame em todo estado NOVO de tela que mostre conteúdo do clube ou um filtro
 * por autoria.
 */
export function expectNoPrivacyTalk(): void {
  const spoken = withoutDiacritics(readableText());

  for (const term of PRIVACY_TERMS) {
    expect(mentionsPrivacyTerm(spoken, term)).toBe(false);
  }
}
