import { generateKeyPairSync } from 'node:crypto';

/**
 * ⚠️ **UM PAR VAPID DE FIXTURE, GERADO NA HORA, EM MEMÓRIA, E DESCARTADO.**
 *
 * Esta é a única fonte de chave VAPID que os testes deste projeto conhecem — e
 * ela é de **uso único**: cada chamada sorteia um par novo, nada é gravado em
 * disco, nada é reaproveitado entre execuções, e **nenhuma chave real do dono
 * entra em teste nenhum** (a regra de segurança da Tarefa 36: as chaves de
 * verdade vivem só no `.env`, que o `.gitignore` cobre, e no `.env.example`
 * como placeholder VAZIO).
 *
 * Não usa `web-push` de propósito: ele **não é dependência de nenhum pacote**, e
 * não precisa ser — o envio é a Tarefa 38. O formato VAPID não é dele, é do
 * padrão (RFC 8292 / Web Push): a chave é um par **P-256 (prime256v1)**, e o
 * `web-push generate-vapid-keys` só embrulha o mesmo `crypto` do Node.
 *
 * ## O formato, que é o que faz este arquivo ser 20 linhas e não uma biblioteca
 *
 * ```
 * pública   ponto EC não comprimido: 0x04 ‖ X(32) ‖ Y(32)  = 65 bytes → 87 chars base64url
 * privada   o escalar `d`:                        d(32)    = 32 bytes → 43 chars base64url
 * ```
 *
 * O `export({ format: 'jwk' })` do Node já devolve `x`, `y` e `d` em base64url,
 * então a pública é uma concatenação e a privada é o `d` como veio.
 *
 * ⚠️ **Só `test-support/`, e nunca `src` de produção.** O backend não gera
 * chave em lugar nenhum: ele apenas **lê** `VAPID_PUBLIC_KEY` e
 * `VAPID_PRIVATE_KEY` do ambiente (`notifications/vapid.ts`). Gerar par em
 * produção seria trocar a chave a cada reinício — e toda inscrição existente
 * pararia de receber push, em silêncio.
 */
export interface EphemeralVapidKeys {
  /** 87 caracteres base64url — é a que PODE chegar ao front. */
  publicKey: string;
  /** 43 caracteres base64url — é a que NUNCA sai do backend. */
  privateKey: string;
}

function requiredJwkPart(value: string | undefined, part: string): string {
  if (value === undefined || value === '') {
    throw new Error(`ephemeral VAPID key: the JWK has no ${part}`);
  }
  return value;
}

/** Um par novo a cada chamada. Nada aqui é determinístico, e é o ponto. */
export function generateEphemeralVapidKeys(): EphemeralVapidKeys {
  const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = pair.publicKey.export({ format: 'jwk' });
  const priv = pair.privateKey.export({ format: 'jwk' });

  const x = Buffer.from(requiredJwkPart(pub.x, 'x'), 'base64url');
  const y = Buffer.from(requiredJwkPart(pub.y, 'y'), 'base64url');

  return {
    publicKey: Buffer.concat([Buffer.from([0x04]), x, y]).toString('base64url'),
    privateKey: requiredJwkPart(priv.d, 'd'),
  };
}
