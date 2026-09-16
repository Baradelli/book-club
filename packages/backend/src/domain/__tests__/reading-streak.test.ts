import { describe, expect, it } from 'vitest';

import { computeReadingStreak } from '../reading-streak';

/**
 * A CORRENTE DE LEITURA — o "foguinho" (ADR 0010).
 *
 * ⚠️ **Função PURA, e é de propósito.** Ela recebe os dias do plano, os dias
 * lidos e o "hoje" já resolvido no fuso da pessoa — não vai ao banco, não lê
 * relógio e não sabe o que é fuso. Toda a correção da feature mora aqui, e é
 * aqui que ela é barata de testar; o resto é encanamento.
 *
 * ⚠️ **DIAS DO PLANO, NÃO DIAS DO CALENDÁRIO** (ADR 0010). Um plano que pula
 * domingo é normal, e contar por calendário quebraria a corrente de quem fez
 * tudo certo. O domingo que o plano não tem simplesmente não existe para ela.
 */
describe('computeReadingStreak', () => {
  const PLANO = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];

  it('é zero sem plano nenhum', () => {
    expect(
      computeReadingStreak({ planDays: [], readDays: [], today: '2026-09-13' }),
    ).toBe(0);
  });

  it('é zero para quem nunca leu', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: [],
        today: '2026-09-13',
      }),
    ).toBe(0);
  });

  it('conta os dias seguidos até hoje', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: ['2026-09-11', '2026-09-12', '2026-09-13'],
        today: '2026-09-13',
      }),
    ).toBe(3);
  });

  it('para no primeiro dia não lido, e não conta os de antes dele', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        // leu o 10, PULOU o 11, leu o 12 e o 13 → a corrente é 2, não 3
        readDays: ['2026-09-10', '2026-09-12', '2026-09-13'],
        today: '2026-09-13',
      }),
    ).toBe(2);
  });

  /**
   * ⚠️ **O CASO QUE DECIDE SE O FOGO É USÁVEL**: hoje ainda não lido **não**
   * quebra a corrente — a pessoa ainda tem o dia.
   *
   * Sem isto o fogo apagaria toda manhã, e a primeira coisa que o app faria ao
   * ser aberto seria dar uma má notícia **falsa**. É o inverso do que a feature
   * existe para fazer, e é o erro mais fácil de cometer aqui.
   */
  it('⚠️ NÃO quebra quando hoje ainda não foi lido — o dia ainda é seu', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: ['2026-09-11', '2026-09-12'],
        today: '2026-09-13',
      }),
    ).toBe(2);
  });

  it('⚠️ mas QUEBRA quando o dia anterior a hoje ficou sem leitura', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: ['2026-09-10', '2026-09-11'],
        today: '2026-09-13',
      }),
    ).toBe(0);
  });

  it('conta hoje quando hoje foi lido', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: ['2026-09-13'],
        today: '2026-09-13',
      }),
    ).toBe(1);
  });

  /**
   * ⚠️ O plano pula domingo (13/09/2026 é domingo, e não está na lista). Quem
   * leu sexta e segunda tem corrente **2** — o domingo não conta contra, porque
   * não havia o que ler.
   */
  it('⚠️ o dia que o PLANO não tem não quebra a corrente', () => {
    expect(
      computeReadingStreak({
        planDays: ['2026-09-11', '2026-09-14'],
        readDays: ['2026-09-11', '2026-09-14'],
        today: '2026-09-14',
      }),
    ).toBe(2);
  });

  /**
   * ⚠️ **O FUTURO NÃO CONTA, nem a favor nem contra.** O plano do mês inteiro
   * já está cadastrado no dia 1: sem este corte, os vinte dias por vir contariam
   * como "não lidos" e a corrente seria sempre **zero** — a feature nasceria
   * morta, e verde.
   */
  it('⚠️ ignora os dias do plano que ainda não chegaram', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: ['2026-09-10', '2026-09-11'],
        today: '2026-09-11',
      }),
    ).toBe(2);
  });

  it('não se importa com a ordem em que os dias chegam', () => {
    expect(
      computeReadingStreak({
        planDays: ['2026-09-13', '2026-09-10', '2026-09-12', '2026-09-11'],
        readDays: ['2026-09-13', '2026-09-12'],
        today: '2026-09-13',
      }),
    ).toBe(2);
  });

  /**
   * ⚠️ **Dia lido que não está no plano é IGNORADO, não contado.** Ele existe
   * de verdade: o admin pode **remover** um dia do plano depois de alguém o ter
   * lido, e o `ReadingLog` daquele dia sobrevive (as guardas das Tarefas 32c e
   * 34b recusam a remoção, mas só para os dias COM leitura — um dia removido
   * antes de ser lido não deixa rastro). Contá-lo inflaria a corrente com um dia
   * que ninguém consegue ver na tela.
   */
  it('⚠️ ignora leitura de um dia que não está mais no plano', () => {
    expect(
      computeReadingStreak({
        planDays: ['2026-09-12', '2026-09-13'],
        readDays: ['2026-09-11', '2026-09-13'],
        today: '2026-09-13',
      }),
    ).toBe(1);
  });

  it('conta o plano inteiro quando a pessoa leu tudo', () => {
    expect(
      computeReadingStreak({
        planDays: PLANO,
        readDays: PLANO,
        today: '2026-09-13',
      }),
    ).toBe(4);
  });

  /** Dia repetido no plano não conta duas vezes (defesa de dado torto). */
  it('não conta o mesmo dia duas vezes', () => {
    expect(
      computeReadingStreak({
        planDays: ['2026-09-12', '2026-09-12', '2026-09-13'],
        readDays: ['2026-09-12', '2026-09-13'],
        today: '2026-09-13',
      }),
    ).toBe(2);
  });
});
