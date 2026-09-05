import { ApiError, apiErrorKey } from '@clube/shared/client';
import type { ParseKeys, TFunction } from 'i18next';

/**
 * O ERRO DA API NA TELA — o assunto central da Tarefa 15
 * (`docs/CONVENCOES-CODIGO.md` §6.2 e §6.8).
 *
 * Nada que a API escreve chega ao olho de ninguém. O caminho é sempre o mesmo:
 * `ApiError` → **chave de catálogo** → `t()`. Duas razões medidas, não zelo:
 *
 * - fora da classe 400 o corpo leva TEXTO GENÉRICO POR STATUS (`'Unauthorized'`,
 *   `'Conflict'`, `'Gone'`) — em inglês, e sem relação com a tela;
 * - na classe 400 o corpo leva `error.message`, que é ou a mensagem do Zod em
 *   inglês (*"String must contain at least 1 character(s)"*) ou a mensagem
 *   INTERNA de uma usecase (`password must have at least 8 characters`).
 *
 * O mesmo vale para o erro de validação do React Hook Form: com o
 * `zodResolver`, `errors.email.message` é a frase do Zod, **em inglês**. Por
 * isso nenhuma tela desta fatia lê `.message` de nada — nem da API, nem do
 * formulário. Quem impede isso de voltar é a regra de ESLint do
 * `eslint.config.js` (regra 22).
 */

/**
 * Uma chave que existe no catálogo, garantida pelo compilador — é o
 * `CustomTypeOptions` de `src/i18n.ts` que torna isto possível.
 *
 * Ela tipa os mapas DESTA fatia (`byStatus`, `fieldKeys`), e é o que faz uma
 * chave esquecida em `pt`/`en` reprovar no `tsc` em vez de virar a própria
 * chave na tela (regra 23).
 */
export type MessageKey = ParseKeys;

/**
 * Onde a mensagem vai. `field` presente = a mensagem pertence àquele campo do
 * formulário (o `Field` a mostra, com `aria-invalid`); ausente = é do
 * formulário todo.
 */
export interface FormMessage {
  /**
   * ⚠️ `string` e não `MessageKey`, de propósito: o valor que vem de
   * `apiErrorKey` é `string` (ele mora em `shared`, que não conhece o
   * catálogo tipado do app). Quem fecha esse buraco é o `messageFor` abaixo —
   * chave que não existe vira mensagem genérica, nunca a chave crua.
   */
  readonly key: string;
  readonly field?: string;
}

/** O mesmo, com a chave TIPADA: é a forma que os mapas da tela declaram. */
export interface StatusMessage {
  readonly key: MessageKey;
  readonly field?: string;
}

/**
 * Status → mensagem específica da tela, quando a genérica de `apiErrorKey`
 * está errada para o contexto.
 *
 * Dois exemplos reais, e os dois são da Tarefa 15: o 401 do login é
 * "credencial não confere" e não `errors.unauthorized` ("Sua sessão
 * terminou"); o 410 do aceite é "este convite venceu" e não `errors.gone`
 * ("Este link não vale mais"), que serve para qualquer link.
 */
export type StatusMessages = Readonly<Record<number, StatusMessage>>;

export interface ResolveOptions {
  /**
   * Os campos que ESTE formulário tem. Um `details[].path` que não está aqui
   * (o `code` do convite, que vem da URL) não pode virar erro de campo: o
   * `Field` correspondente não existe na tela, e a mensagem desapareceria.
   */
  readonly fields: readonly string[];
  readonly byStatus?: StatusMessages;
}

/**
 * `ApiError` → chave + campo. NUNCA texto.
 *
 * A precedência é: campo apontado pelo `details` → override por status →
 * chave genérica de `apiErrorKey`. O `details` vem primeiro porque é a
 * informação mais específica que a API dá — e é a única que sabe QUAL campo.
 *
 * ⚠️ REGISTRADO, NÃO CONSERTADO: essa precedência é **inalcançável pelas telas
 * de hoje**, e o teste que a prova é o unitário de propósito. Por §6.2 o
 * `details` só existe na classe **400**, e nenhuma das duas telas desta fatia
 * sobrescreve o 400 no `BY_STATUS` — então nenhum caminho de tela chega ao
 * desempate. Ele é decidível aqui (`lets the details win over the status
 * override`), e é aqui que ele mora. Uma tela futura que sobrescreva o 400
 * herda a regra já provada; não a reprove por DOM.
 */
export function resolveApiError(
  error: unknown,
  options: ResolveOptions,
): FormMessage {
  // Um erro que não é `ApiError` é bug nosso (o cliente HTTP embala TUDO,
  // inclusive falha de rede, num `ApiError`). Genérico traduzido, nunca
  // `String(error)`: uma stack trace na tela é o pior dos dois mundos.
  if (!(error instanceof ApiError)) return { key: 'errors.unknown' };

  const detail = error.details?.[0];
  if (detail !== undefined && options.fields.includes(detail.path)) {
    // `apiErrorKey` é quem traduz `path` → chave (`email` →
    // `errors.fields.email`), e é ele que garante que um `path` DESCONHECIDO
    // caia em `errors.fields.invalid` em vez de na mensagem em inglês.
    return { key: apiErrorKey(error), field: detail.path };
  }

  const override = options.byStatus;
  if (override !== undefined && Object.hasOwn(override, error.status)) {
    // `Object.hasOwn` e não `override[status] ?? …`: um mapa-objeto herda de
    // `Object.prototype`, e é o mesmo cuidado do `apiErrorKey` (§ do
    // `api-error-key.ts`). Aqui a chave é numérica, então é defesa de forma,
    // não de conteúdo.
    const found = override[error.status];
    if (found !== undefined) return found;
  }

  return { key: apiErrorKey(error) };
}

/**
 * Chave → texto, com rede.
 *
 * O `defaultValue` NÃO é decoração: sem ele, uma chave que não exista no
 * catálogo faz o i18next renderizar **a própria chave** na tela
 * (`errors.fields.email` no lugar da frase), e ninguém percebe até um usuário
 * reclamar. É o mesmo sintoma que o teste de paridade `pt`/`en` da Tarefa 12
 * existe para impedir, só que pelo lado de quem chama.
 *
 * E é ele que permite o `FormMessage.key` ser `string`: o `apiErrorKey` de
 * `shared` não conhece o catálogo tipado do app, e a ponte é esta — uma
 * checagem de RUNTIME que o i18next já faz, não um `as`.
 *
 * ⚠️ E O `defaultValue` NÃO COBRE TODOS OS CASOS — medido na rodada de
 * correção, e é por isso que a checagem de tipo abaixo existe. Uma chave que
 * aponta para um **objeto** do catálogo (`errors.fields`, que é um nó com
 * filhos) NÃO dispara o `defaultValue`: o i18next devolve o diagnóstico dele,
 * *"key 'errors.fields (pt)' returned an object instead of string."* — em
 * inglês, na tela, exatamente o que a regra 19 proíbe. É inalcançável hoje
 * (`apiErrorKey` só devolve folha), e o docblock afirmava "nunca a chave crua",
 * o que era meia verdade: não é a chave, é pior.
 *
 * ⚠️ E O `returnObjects: true` É O QUE TORNA A CHECAGEM POSSÍVEL, também
 * medido: SEM ele o i18next devolve o diagnóstico como **string**, e um
 * `typeof === 'string'` não separa a frase do diagnóstico. Com ele, a chave de
 * nó devolve o OBJETO cru — que é o que o `typeof` consegue recusar. Folha
 * continua string, e chave ausente continua caindo no `defaultValue` (os
 * quatro casos estão medidos em `__tests__/form-errors.test.ts`).
 */
export function messageFor(t: TFunction, key: string): string {
  const translated: unknown = t(key, {
    defaultValue: t('errors.unknown'),
    returnObjects: true,
  });
  return typeof translated === 'string' ? translated : t('errors.unknown');
}

/**
 * A mensagem de UM campo: o erro de validação local vence o da API.
 *
 * A ordem importa e é a favor de quem digita: depois de um 409 no e-mail, a
 * pessoa corrige e apaga o `@` — a frase que ela precisa ler é a do campo
 * inválido AGORA, não a da resposta anterior.
 *
 * `invalid` é um booleano e não o objeto de erro do React Hook Form, de
 * propósito: assim esta função não tem como ler `.message` (a frase do Zod em
 * inglês) nem como ser tentada a isso.
 */
export function fieldMessage(
  t: TFunction,
  field: string,
  invalid: boolean,
  fieldKeys: Readonly<Record<string, MessageKey>>,
  apiMessage: FormMessage | undefined,
): string | undefined {
  if (invalid) {
    const key = Object.hasOwn(fieldKeys, field) ? fieldKeys[field] : undefined;
    return messageFor(t, key ?? 'errors.fields.invalid');
  }
  if (apiMessage?.field === field) return messageFor(t, apiMessage.key);
  return undefined;
}

/** A mensagem do FORMULÁRIO: só a que não pertence a campo nenhum. */
export function formMessage(
  t: TFunction,
  apiMessage: FormMessage | undefined,
): string | undefined {
  if (apiMessage === undefined || apiMessage.field !== undefined) {
    return undefined;
  }
  return messageFor(t, apiMessage.key);
}
