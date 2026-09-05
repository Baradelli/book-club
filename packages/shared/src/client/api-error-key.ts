import type { ApiError } from './api-client';
import { NETWORK_ERROR_STATUS } from './api-client';

/**
 * Erro da API → **chave de i18n**. Nunca texto.
 *
 * `docs/CONVENCOES-CODIGO.md` §6.2 fechou o formato do erro no backend, e a
 * consequência cai aqui: as mensagens do Zod são **em inglês** e
 * `error.message` só existe na classe 400. A tela que renderizasse `message`
 * mostraria *"String must contain at least 1 character(s)"* no meio de uma
 * tela em português.
 *
 * Esta é a primeira fatia com um chamador dessa regra: se ela nascer torta
 * aqui, as telas 15–21 herdam a torção.
 */

/**
 * Chave genérica por status. Não há entrada para 2xx de propósito: um corpo de
 * sucesso fora do schema cai no `errors.unknown`, que é o que ele é.
 */
const KEY_BY_STATUS: Readonly<Record<number, string>> = {
  [NETWORK_ERROR_STATUS]: 'errors.network',
  400: 'errors.badRequest',
  401: 'errors.unauthorized',
  403: 'errors.forbidden',
  404: 'errors.notFound',
  409: 'errors.conflict',
  410: 'errors.gone',
  413: 'errors.payloadTooLarge',
  500: 'errors.serverError',
};

const UNKNOWN_STATUS_KEY = 'errors.unknown';

/** Campo que existe mas ninguém mapeou ainda. Nunca a mensagem em inglês. */
const UNKNOWN_FIELD_KEY = 'errors.fields.invalid';

/**
 * Os `path` que o `details` da API pode trazer (§6.2: `instancePath` vira
 * `planItems.0.title`), já com o índice normalizado para `*`.
 *
 * O item de plano é `planItem.*` e não `planItems.*` porque `planItems` também
 * é um campo (o array inteiro): com o mesmo prefixo, uma chave seria objeto e
 * a outra folha no mesmo lugar do catálogo.
 */
const KEY_BY_FIELD_PATH: Readonly<Record<string, string>> = {
  author: 'errors.fields.author',
  code: 'errors.fields.code',
  coverUrl: 'errors.fields.coverUrl',
  doc: 'errors.fields.doc',
  email: 'errors.fields.email',
  month: 'errors.fields.month',
  name: 'errors.fields.name',
  password: 'errors.fields.password',
  planItems: 'errors.fields.planItems',
  'planItems.*.date': 'errors.fields.planItem.date',
  'planItems.*.reference': 'errors.fields.planItem.reference',
  'planItems.*.title': 'errors.fields.planItem.title',
  reference: 'errors.fields.reference',
  role: 'errors.fields.role',
  text: 'errors.fields.text',
  timezone: 'errors.fields.timezone',
  title: 'errors.fields.title',
  totalPages: 'errors.fields.totalPages',
  ttlDays: 'errors.fields.ttlDays',
};

/**
 * TODA chave que `apiErrorKey` pode devolver — **derivada** dos mapas, nunca
 * escrita à mão: uma lista à mão envelhece e o teste de catálogo passaria
 * conferindo o conjunto errado.
 *
 * É o contrato com os catálogos de i18n: `locales/__tests__` prova que `pt` e
 * `en` têm todas elas.
 */
export const API_ERROR_KEYS: readonly string[] = [
  ...new Set([
    ...Object.values(KEY_BY_STATUS),
    ...Object.values(KEY_BY_FIELD_PATH),
    UNKNOWN_STATUS_KEY,
    UNKNOWN_FIELD_KEY,
  ]),
];

/** `planItems.0.date` → `planItems.*.date`. Um plano de 30 dias tem UMA chave. */
function normalizePath(path: string): string {
  return path
    .split('.')
    .map((segment) => (/^\d+$/.test(segment) ? '*' : segment))
    .join('.');
}

/**
 * `Object.hasOwn` e não `mapa[chave] ?? PADRAO`.
 *
 * Um mapa-objeto herda de `Object.prototype`: para `constructor`, `toString`,
 * `__proto__`, `valueOf` e companhia o acesso NÃO devolve `undefined` — devolve
 * o membro herdado —, o `??` não dispara, e a função devolveria uma **função**
 * com o tipo prometendo `string`.
 *
 * Hoje é inalcançável (nenhum schema usa `z.record()` com chave vinda do
 * usuário, então nenhum `details[].path` da API é texto arbitrário). É uma
 * linha para nunca depender disso.
 */
function lookup(
  map: Readonly<Record<string | number, string>>,
  key: string | number,
  fallback: string,
): string {
  return Object.hasOwn(map, key) ? (map[key] ?? fallback) : fallback;
}

export function apiErrorKey(error: ApiError): string {
  const first = error.details?.[0];

  if (first) {
    return lookup(
      KEY_BY_FIELD_PATH,
      normalizePath(first.path),
      UNKNOWN_FIELD_KEY,
    );
  }

  return lookup(KEY_BY_STATUS, error.status, UNKNOWN_STATUS_KEY);
}
