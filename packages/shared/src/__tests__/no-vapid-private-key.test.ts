import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **REGRA 16 DA TAREFA 36 — A CHAVE VAPID PRIVADA NÃO ENTRA EM
 * `packages/shared`.**
 *
 * Este pacote é **empacotado no PWA**: tudo o que mora aqui e é importado por
 * uma tela vira bytes no navegador de quem abre o app. A chave privada VAPID é
 * o segredo que assina o push do servidor — quem a tiver manda notificação em
 * nome do clube. Ela vive **só** no `.env` do backend (que o `.gitignore`
 * cobre) e no `.env.example` como placeholder **vazio** (regra 17).
 *
 * O `notificationConfigResponseSchema` declara `vapidPublicKey` e mais nada, e
 * o `serializerCompiler` do Zod corta o resto (§6.1) — **mas isto é segredo, e
 * segredo merece asserção própria** (decisão H). O §6.1 protege a RESPOSTA;
 * esta varredura protege o PACOTE, que é a outra porta: uma constante colada
 * num arquivo daqui não passa por serializer nenhum.
 *
 * ## Duas camadas, e a de cima é sobre VALOR, não sobre nome
 *
 * Uma varredura **por nome** (`privateKey`, `VAPID_PRIVATE_KEY`) é proxy: ela
 * acusa quem batiza o segredo e deixa passar quem o cola numa constante
 * chamada `K`. Então a camada A procura a **forma do valor** — uma corrida
 * base64url longa —, que é o que uma chave VAPID *é*, com qualquer nome:
 *
 * ```
 * privada  32 bytes → 43 caracteres base64url
 * pública  65 bytes → 87 caracteres base64url
 * ```
 *
 * Medido: **nenhum arquivo de `packages/shared` tem hoje uma corrida de 40+
 * caracteres** de `[A-Za-z0-9_-]`, tests inclusive. Então o teto pode ser
 * apertado até abaixo da menor das duas chaves, e a camada A vale para **todo**
 * arquivo do pacote — inclusive os de teste, que é justamente onde uma chave de
 * conveniência costuma ser colada ("só para o teste passar").
 *
 * A camada B é a por nome, e ela vale só para o que o PWA **empacota**: um
 * `*.test.ts` não vai para bundle nenhum, e há uso legítimo dos termos lá — o
 * `local-day.test.ts` mexe em `process.env['TZ']` desde a Tarefa 16 (é o único
 * jeito de escolher o lado esperado à mão, §7.8) e o
 * `notification-schemas.test.ts` **precisa** escrever `vapidPrivateKey` para
 * provar que o schema o corta.
 *
 * ⚠️ **E o antídoto do §7.4 é obrigatório nas duas:** uma varredura que não acha
 * arquivo nenhum, ou um predicado que não casa com nada, devolve `[]` — e `[]`
 * faz a guarda passar **para sempre sem olhar nada**, que é a guarda que parece
 * cobrir e não cobre (§7.9). Os dois lados estão abaixo.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url));

/** Todo `.ts`/`.tsx` do pacote — o `__tests__` INCLUÍDO (ver a camada A). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') || entry.endsWith('.tsx') ? [full] : [];
  });
}

function isTestFile(file: string): boolean {
  return /\.test\.tsx?$/.test(basename(file));
}

/**
 * CAMADA A — a forma do VALOR: 40 caracteres seguidos do alfabeto base64url.
 *
 * Abaixo dos 43 da chave privada e dos 87 da pública, e acima de tudo o que o
 * pacote escreve hoje. `.` e `/` cortam a corrida, então URL de endpoint e
 * caminho de módulo não casam.
 */
const SECRET_SHAPED = /[A-Za-z0-9_-]{40,}/;

/**
 * CAMADA B — o nome, e a leitura de ambiente.
 *
 * `process.env` entra porque o pacote **não lê ambiente**, por decisão da
 * Tarefa 12 (o cliente HTTP e o token são fábricas com dependência injetada;
 * quem lê o ambiente é o `packages/app`) — e é o caminho pelo qual um segredo
 * chegaria ao bundle sem ninguém escrever o nome dele.
 */
const FORBIDDEN_NAME =
  /\b(VAPID_PRIVATE_KEY|vapidPrivateKey|privateKey)\b|process\s*\.\s*env/;

/**
 * Comentário não é código, e a prosa deste pacote cita os termos: o
 * `notification.ts` explica por extenso que a privada nunca sai. Bloco
 * primeiro, linha depois — e `//` precedido de `:` fica (é uma URL).
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function looksLikeASecret(source: string): boolean {
  return SECRET_SHAPED.test(stripComments(source));
}

function namesTheSecret(source: string): boolean {
  return FORBIDDEN_NAME.test(stripComments(source));
}

/** Uma chave de mentira, do TAMANHO da de verdade — montada em runtime. */
function aKeyShapedString(length: number): string {
  return 'A'.repeat(length);
}

describe('packages/shared never carries the VAPID private key', () => {
  /**
   * ⚠️ **O ANTÍDOTO, primeira metade: a varredura TEM DE ACHAR ARQUIVO.** Um
   * `sourceFiles` quebrado devolveria `[]`, e aí as duas guardas passariam sem
   * ter aberto nada.
   */
  it('reads the whole package, tests included', () => {
    const files = sourceFiles(SRC_DIR);

    expect(files.length).toBeGreaterThan(20);
    expect(files.map((file) => basename(file))).toContain('notification.ts');
    expect(files.some((file) => isTestFile(file))).toBe(true);
    expect(files.some((file) => !isTestFile(file))).toBe(true);
  });

  /**
   * ⚠️ **O ANTÍDOTO da camada A: o predicado TEM DE ACUSAR uma chave de
   * verdade** — nos dois tamanhos, e com qualquer nome, que é o ponto de a
   * camada ser sobre valor.
   */
  it.each([
    ['a private key (32 bytes, 43 chars)', 43],
    ['a public key (65 bytes, 87 chars)', 87],
  ])('accuses %s pasted anywhere', (_label, length) => {
    expect(looksLikeASecret(`const K = '${aKeyShapedString(length)}';`)).toBe(
      true,
    );
    // ...mesmo sem nome nenhum que a denuncie: é o furo da varredura por nome.
    expect(namesTheSecret(`const K = '${aKeyShapedString(length)}';`)).toBe(
      false,
    );
  });

  /** E o outro lado: um identificador comprido normal não é segredo. */
  it.each([
    'export const pushSubscriptionResponseSchema = 1;',
    "import { a } from './notification';",
    "const url = 'https://fcm.googleapis.com/fcm/send/abc-123';",
  ])('never mistakes %s for a key', (source) => {
    expect(looksLikeASecret(source)).toBe(false);
  });

  /**
   * ⚠️ **O ANTÍDOTO da camada B**, nas quatro formas realistas: o campo do
   * objeto, a constante batizada, a leitura de ambiente e a grafia do `.env`.
   */
  it.each([
    [
      'a config field',
      'export interface V { publicKey: string; privateKey: string }',
    ],
    ['a named constant', 'export const vapidPrivateKey = k;'],
    ['an env read', "const k = process.env['VAPID_PRIVATE_KEY'];"],
    ['the env name in code', 'const NAME = "VAPID_PRIVATE_KEY";'],
  ])('accuses %s in a bundled module', (_label, source) => {
    expect(namesTheSecret(source)).toBe(true);
  });

  /**
   * O outro lado da camada B, e é o que impede a guarda de virar ruído: a chave
   * **PÚBLICA** pode estar aqui (o contrato a declara) e a prosa pode citar a
   * privada. Guarda que acusa à toa é a que alguém desliga (§7.9).
   */
  it.each([
    [
      'the public key of the contract',
      'vapidPublicKey: z.string().nullable(),',
    ],
    ['a comment about the private one', '// a privateKey nunca sai do backend'],
    ['a docblock about it', '/** VAPID_PRIVATE_KEY mora no .env */'],
  ])('never mistakes %s for a secret', (_label, source) => {
    expect(namesTheSecret(source)).toBe(false);
  });

  /**
   * ⚠️ **A GUARDA, CAMADA A — nenhum arquivo do pacote, TESTE INCLUÍDO, carrega
   * uma corrida base64url do tamanho de uma chave.**
   */
  it('has no key-shaped literal in any file of the package', () => {
    const offenders = sourceFiles(SRC_DIR).filter((file) =>
      looksLikeASecret(readFileSync(file, 'utf8')),
    );

    expect(
      offenders,
      `${offenders.length} file(s) in packages/shared carry a 40+ character base64url run — the shape of a VAPID key. This package is BUNDLED INTO THE PWA: a key belongs in the backend .env, never here.`,
    ).toEqual([]);
  });

  /**
   * ⚠️ **A GUARDA, CAMADA B — nenhum módulo EMPACOTADO nomeia o segredo nem lê
   * o ambiente.** Os `*.test.ts` ficam de fora porque não vão para bundle
   * nenhum, e porque há uso legítimo lá (o `process.env['TZ']` do
   * `local-day.test.ts`, §7.8; o `vapidPrivateKey` que o
   * `notification-schemas.test.ts` precisa escrever para provar que o schema o
   * corta). A camada A, que é a que pega a chave de verdade, não os isenta.
   */
  it('has no private key name, and no environment read, in any bundled module', () => {
    const offenders = sourceFiles(SRC_DIR)
      .filter((file) => !isTestFile(file))
      .filter((file) => namesTheSecret(readFileSync(file, 'utf8')));

    expect(
      offenders,
      `${offenders.length} bundled module(s) in packages/shared mention a VAPID private key or read process.env. The private key must live only in the backend .env; this package does not read the environment (Tarefa 12).`,
    ).toEqual([]);
  });
});
