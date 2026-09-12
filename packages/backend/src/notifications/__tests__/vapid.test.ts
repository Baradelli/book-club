import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateEphemeralVapidKeys } from '../../test-support/ephemeral-vapid-keys';
import { getVapidConfig, publicNotificationConfig } from '../vapid';

/**
 * ⚠️ **REGRAS 14, 15 e 17 DA TAREFA 36 — a configuração VAPID
 * (`docs/NOTIFICACOES.md` §3).**
 *
 * ⚠️ **NENHUMA CHAVE REAL APARECE AQUI.** Todo par usado neste arquivo é
 * **gerado na hora, em memória, e descartado** pelo
 * `test-support/ephemeral-vapid-keys.ts`; nada é escrito em disco e nada é
 * reaproveitado entre execuções. As chaves de verdade vivem só no `.env` (que o
 * `.gitignore` cobre) e no `.env.example` como placeholder **vazio** — e a
 * regra 17, no rodapé deste arquivo, é o que vigia esse "vazio".
 *
 * O ambiente é mexido com `vi.stubEnv`, **em memória**: o `.env` real do dono
 * não é lido nem escrito por teste nenhum (o vitest não carrega `.env`; quem
 * carrega é o CLI do Prisma).
 */

/** A raiz do monorepo: `src/notifications/__tests__/` → cinco níveis acima. */
const ENV_EXAMPLE = fileURLToPath(
  new URL('../../../../../.env.example', import.meta.url),
);

function setBothKeys(): { publicKey: string; privateKey: string } {
  const pair = generateEphemeralVapidKeys();
  vi.stubEnv('VAPID_PUBLIC_KEY', pair.publicKey);
  vi.stubEnv('VAPID_PRIVATE_KEY', pair.privateKey);
  return pair;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getVapidConfig', () => {
  /**
   * ⚠️ **REGRA 14 — a feature NASCE DESLIGADA, e o desligamento é LIMPO.**
   *
   * `null` desliga a feature inteira: as rotas respondem `{ enabled: false }`, a
   * tela esconde o toggle e o dispatcher não faz nada. **Ninguém precisa de
   * VAPID configurado para rodar o projeto em desenvolvimento**
   * (`NOTIFICACOES.md` §3) — e é este o estado real da máquina do dono hoje.
   */
  it('is null when the environment has no key at all', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    vi.stubEnv('VAPID_PRIVATE_KEY', '');

    expect(getVapidConfig()).toBeNull();
  });

  /**
   * ⚠️ **O CASO DE VERDADE: `.env.example` tem `VAPID_PUBLIC_KEY=` — a variável
   * EXISTE e o valor é `''`.** Uma guarda escrita como `=== undefined` diria
   * "configurado" para a string vazia, e o backend tentaria assinar push com
   * chave vazia. É por isso que a guarda é de **falsidade**, não de ausência.
   */
  it.each([
    ['both empty', '', ''],
    ['only the public one', 'uma-publica', ''],
    ['only the private one', '', 'uma-privada'],
  ])('is null with %s', (_label, publicKey, privateKey) => {
    vi.stubEnv('VAPID_PUBLIC_KEY', publicKey);
    vi.stubEnv('VAPID_PRIVATE_KEY', privateKey);

    expect(getVapidConfig()).toBeNull();
  });

  it('is null when the variables are absent, not just empty', () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', undefined);
    vi.stubEnv('VAPID_PRIVATE_KEY', undefined);

    expect(getVapidConfig()).toBeNull();
  });

  it('reads both keys from the environment when they are there', () => {
    const pair = setBothKeys();
    vi.stubEnv('VAPID_SUBJECT', 'mailto:dono@clube.test');

    expect(getVapidConfig()).toEqual({
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      subject: 'mailto:dono@clube.test',
    });
  });

  /** O `subject` tem padrão, e é o do `NOTIFICACOES.md` §3. */
  it.each([
    ['absent', undefined],
    ['empty', ''],
  ])(
    'falls back to mailto:admin@localhost when the subject is %s',
    (_label, subject) => {
      setBothKeys();
      vi.stubEnv('VAPID_SUBJECT', subject);

      expect(getVapidConfig()?.subject).toBe('mailto:admin@localhost');
    },
  );

  /**
   * As chaves do par de fixture têm o TAMANHO das de verdade — é a precondição
   * que faz este arquivo medir o que o nome dele promete, e não um par de
   * strings quaisquer.
   */
  it('states the precondition: the fixture pair has the shape of a real one', () => {
    const pair = generateEphemeralVapidKeys();

    expect(pair.publicKey).toHaveLength(87);
    expect(pair.privateKey).toHaveLength(43);
    // Dois pares consecutivos são diferentes: nada aqui é constante de arquivo.
    expect(generateEphemeralVapidKeys().privateKey).not.toBe(pair.privateKey);
  });
});

describe('publicNotificationConfig', () => {
  /**
   * ⚠️ **REGRA 14 — `{ enabled: false, vapidPublicKey: null }`** (decisão G).
   * É o contrato do `NOTIFICACOES.md` §4, e é o que deixa a tela esconder o
   * toggle sem tratar "não configurado" como erro.
   */
  it('is the disabled shape when there is no config', () => {
    expect(publicNotificationConfig(null)).toEqual({
      enabled: false,
      vapidPublicKey: null,
    });
  });

  /**
   * ⚠️ **REGRA 15 — com chave configurada sai a PÚBLICA, e a resposta NÃO
   * contém a privada.**
   *
   * A asserção é sobre o objeto **serializado**, e não sobre a lista de chaves:
   * é o que pega uma privada escondida num campo com outro nome, num objeto
   * aninhado, ou num `toJSON` esperto. É aqui que a propriedade é decidível — a
   * função é pura, e é a ÚNICA dona da projeção pública (§7.10: a propriedade se
   * prova onde ela É decidível; o teste de rota fia a rota).
   */
  it('carries the public key and never the private one', () => {
    const pair = generateEphemeralVapidKeys();

    const response = publicNotificationConfig({
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      subject: 'mailto:admin@localhost',
    });

    expect(response).toEqual({ enabled: true, vapidPublicKey: pair.publicKey });
    // A privada não está em NENHUM lugar do que sai...
    expect(JSON.stringify(response)).not.toContain(pair.privateKey);
    // ...e o `subject`, que é o e-mail do dono, também não: ele é do protocolo
    // de envio, não do cliente. Um campo a mais aqui é PII de graça.
    expect(JSON.stringify(response)).not.toContain('admin@localhost');
    // A precondição do par: a PÚBLICA está, senão o `not.toContain` acima
    // passaria com um objeto vazio.
    expect(JSON.stringify(response)).toContain(pair.publicKey);
  });

  /**
   * ⚠️ E o caso que a decisão H existe para matar: a privada e a pública de um
   * par de verdade **compartilham o prefixo?** Não — mas o teste acima não
   * depende disso. Este aqui pina que a projeção não é "corta 43 caracteres":
   * ela enumera os campos.
   */
  it('enumerates the fields instead of trimming the config', () => {
    const pair = generateEphemeralVapidKeys();

    const response = publicNotificationConfig({
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      subject: 'mailto:admin@localhost',
    });

    expect(Object.keys(response).sort()).toEqual(['enabled', 'vapidPublicKey']);
  });
});

/**
 * ⚠️ **REGRA 17 — O `.env.example` CONTINUA COM AS CHAVES VAZIAS.**
 *
 * O `.env.example` é o único arquivo de ambiente que o `.gitignore` deixa
 * entrar no repositório (`.env` e `.env.*` ignorados, `!.env.example`). Se um
 * dia alguém colar uma chave de verdade ali, ela vai para o commit, para o
 * histórico e para todo clone — e este teste é o que fica **vermelho antes
 * disso**.
 *
 * ⚠️ Ele mora aqui, e não num teste de repositório genérico, porque é onde quem
 * mexe em VAPID está olhando.
 */
describe('the .env.example keeps the VAPID keys empty', () => {
  const SOURCE = readFileSync(ENV_EXAMPLE, 'utf8');

  /** `NOME=valor` → o valor, sem aspas e sem as pontas. `null` se não há a linha. */
  function valueOf(source: string, name: string): string | null {
    const line = source
      .split(/\r?\n/)
      .find((row) => row.trimStart().startsWith(`${name}=`));
    if (line === undefined) return null;
    return line
      .slice(line.indexOf('=') + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }

  /**
   * ⚠️ **A PRECONDIÇÃO, e sem ela isto é asserção vazia** (§7.4): uma linha
   * ausente também daria "sem valor", e a guarda passaria num arquivo que
   * perdeu as variáveis — ou num caminho errado, que devolveria string vazia e
   * faria tudo aqui passar sem ter lido nada.
   */
  it('reads the real file, and both variables are declared in it', () => {
    expect(SOURCE).toContain('DATABASE_URL');
    expect(valueOf(SOURCE, 'VAPID_PUBLIC_KEY')).not.toBeNull();
    expect(valueOf(SOURCE, 'VAPID_PRIVATE_KEY')).not.toBeNull();
  });

  it.each(['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'])(
    '%s is declared with no value',
    (name) => {
      expect(
        valueOf(SOURCE, name),
        `${name} in .env.example has a VALUE. A VAPID key must never be committed: keep the placeholder empty and put the real key in the ignored .env.`,
      ).toBe('');
    },
  );

  /**
   * ⚠️ **O ANTÍDOTO (§7.4): o leitor TEM DE VER um valor quando há um.** Sem
   * este par, um `valueOf` quebrado devolveria `''` para qualquer linha e a
   * guarda acima passaria para sempre — inclusive com uma chave colada.
   */
  it('accuses a pasted key, and tells a quoted one from an empty one', () => {
    const withAKey = 'VAPID_PRIVATE_KEY=uma-chave-que-alguem-colou';

    expect(valueOf(withAKey, 'VAPID_PRIVATE_KEY')).toBe(
      'uma-chave-que-alguem-colou',
    );
    expect(valueOf('VAPID_PRIVATE_KEY=""', 'VAPID_PRIVATE_KEY')).toBe('');
    expect(valueOf('VAPID_PRIVATE_KEY="x"', 'VAPID_PRIVATE_KEY')).toBe('x');
    expect(valueOf('OUTRA=coisa', 'VAPID_PRIVATE_KEY')).toBeNull();
  });

  /**
   * E a outra ponta do segredo: o `.env.example` não pode ganhar uma corrida
   * base64url do tamanho de uma chave em variável NENHUMA — nem numa que
   * alguém batize de outro jeito.
   */
  it('has no key-shaped literal anywhere in the file', () => {
    expect(/[A-Za-z0-9_-]{40,}/.test(SOURCE)).toBe(false);
  });
});
