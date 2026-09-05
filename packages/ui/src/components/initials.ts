/**
 * As iniciais do `PersonAvatar`.
 *
 * Módulo próprio, e não uma função dentro do componente, porque é a única
 * parte dele com regra de verdade — e regra se testa sem montar DOM.
 */

/**
 * Partículas que NÃO viram inicial. "Maria de Souza" é MS, não MD.
 *
 * Só o que aparece em nome de pessoa em português e nas grafias que um clube
 * de leitura encontra. Não é uma lista de stopwords: é uma lista de partículas
 * de nome próprio.
 */
const NAME_PARTICLES = new Set([
  'da',
  'das',
  'de',
  'del',
  'della',
  'di',
  'do',
  'dos',
  'du',
  'e',
  'van',
  'von',
  'y',
]);

/** `\p{L}` (letra Unicode) e não `[a-z]`: "Ângela" e "Þóra" são nomes. */
const HAS_LETTER = /\p{L}/u;

/**
 * `Array.from` e não `word[0]`: indexar string anda por UNIDADE DE CÓDIGO, e
 * um nome que comece por emoji ou por letra fora do BMP devolveria metade de
 * um par surrogate — um caractere de substituição na tela.
 */
function firstLetterOf(word: string): string {
  const letter = Array.from(word).find((character) =>
    HAS_LETTER.test(character),
  );
  return letter === undefined ? '' : letter.toLocaleUpperCase('pt-BR');
}

/**
 * Uma palavra → 1 letra. Duas ou mais → 2 letras (a primeira e a última, que é
 * como as pessoas se apresentam). Partículas ignoradas.
 *
 * Devolve `null` quando não há letra nenhuma para extrair — nome nulo (o
 * convite cria a pessoa SEM nome, `User.name` é nullable), nome em branco, ou
 * um nome só de emoji. Quem chama cai no glifo neutro (regra 29).
 */
export function initialsFromName(name: string | null): string | null {
  if (name === null) return null;

  // Tudo que tem ao menos uma letra é candidato; um "🎉" solto não é palavra.
  const words = name.split(/\s+/u).filter((word) => HAS_LETTER.test(word));

  const meaningful = words.filter(
    (word) => !NAME_PARTICLES.has(word.toLocaleLowerCase('pt-BR')),
  );

  // Alguém chamado só "De"? Melhor a partícula do que o glifo neutro.
  const chosen = meaningful.length > 0 ? meaningful : words;

  const first = chosen[0];
  if (first === undefined) return null;

  /*
    ⚠️ SEM `|| null` nas duas linhas abaixo, e é código MORTO removido, não um
    descuido: toda palavra de `chosen` passou pelo filtro `HAS_LETTER`, então
    `firstLetterOf` sempre acha uma letra e nunca devolve `''`. O `|| null` era
    inalcançável — nenhum teste podia cobri-lo, e ele fazia parecer que existia
    um caso de "escolheu uma palavra e não saiu letra" que não existe.

    O único caminho para `null` é o de cima: `chosen` vazio, ou seja, nenhuma
    palavra com letra nenhuma (nome nulo, em branco, ou só emoji).
  */
  const last = chosen[chosen.length - 1];
  if (chosen.length === 1 || last === undefined) {
    return firstLetterOf(first);
  }

  return `${firstLetterOf(first)}${firstLetterOf(last)}`;
}
