import {
  noContentResponseSchema,
  readingLogResponseSchema,
} from '@clube/shared';
import { Button, PresenceMark } from '@clube/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../auth/auth-context';
import type { ActiveClubMe } from '../club/active-club';
import { Notice } from './chrome';
import { nameOfWriter } from './club-names';

/**
 * A MARCA DE LEITURA — "eu li" virando gesto, e "quem leu" virando presença.
 *
 * ⚠️ **PROGRESSO É PRESENÇA, NÃO PLACAR** (`docs/ACEITE-MVP.md`, MVP 3,
 * pergunta 1, respondida pelo dono). Nada aqui conta nada: nem dias lidos, nem
 * percentual, nem "+2" de estouro. Um leitor a mais é uma marca a mais. E a
 * metade ESTRUTURAL é mais forte que a regex da varredura anti-culpa: a rota
 * não devolve contagem nenhuma, então não existe número para renderizar por
 * engano.
 *
 * ⚠️ **A PERGUNTA 1 FOI REVERTIDA PELO DONO NA TAREFA 38c** — ele pediu a
 * corrente de leitura, que é um número por pessoa
 * (→ `docs/adr/0010-corrente-de-leitura-visivel.md`). ✅ **Este módulo não
 * mudou, e a frase estreita continua verdadeira:** a marca de leitura do dia
 * continua sendo presença, o `readers` continua sem contagem, e a corrente
 * mora em outra rota e em outra tela. ⚠️ **Não leia esta seção como "o app não
 * tem número"** — leia como "o número não passa por aqui".
 *
 * ⚠️ **DOIS ASSUNTOS NUM MÓDULO SÓ, e o nome só cobre o primeiro.** O
 * `ReadMarks` é informação (uma marca por leitor, sem estado e sem rede); o
 * `TodayReading` é **ação de escrita** — dois estados, uma chamada HTTP, um
 * caminho de erro e a releitura do livro. Em 105 linhas isso não dói e
 * separá-los agora seria um arquivo de trinta linhas. Fica registrado porque o
 * segundo é quem vai crescer (desfazer, fila offline, `ActivityEvent`): quando
 * crescer, é ele que sai daqui, e o nome do módulo continua honesto.
 *
 * ⚠️ **MÓDULO PRÓPRIO, E A RAZÃO É MEDIDA (lição nº 8 do MVP 1: divida ANTES
 * de a tela crescer).** O `book.tsx` entrou nesta fatia com **247 linhas**
 * (o contador canônico do projeto, no docblock de `acervo.tsx`), e a fatia
 * traz três coisas novas: a marca por leitor, o toque em primeira pessoa com
 * estado de escrita, e o recado de falha com "tentar de novo". Enfiadas lá, a
 * tela passaria de 350 — que é o número que a spec desta tarefa fixou como o
 * "antes". Com o corte, ela ficou em **277** e este módulo em **105**. Aqui
 * elas ficam ao lado do `club-names.ts`, que é o vizinho do assunto: quem
 * escreveu e quem leu se nomeiam pelo MESMO `nameOfWriter`.
 *
 * ⚠️ **A MARCA DE LEITURA É DISTINGUÍVEL DA DE ESCRITA SEM DEPENDER DE COR**
 * (decisão C). As duas convivem na MESMA linha do plano, e a lição nº 12 do
 * MVP 2 (varrer palavra não pega desenho, e cor sozinha não é portadora) mais
 * a nº 16 ("duas coisas que falam a mesma frase") já mentiram numa tela deste
 * projeto.
 *
 * ⚠️⚠️ **E A NATUREZA DO PORTADOR MUDOU NA TAREFA 44 (decisão B).** A tabela
 * abaixo dizia:
 *
 * | ~~escreveu~~ | ~~a INICIAL (letra, sem SVG)~~ | ~~"{nome} escreveu neste dia"~~ |
 * | ~~leu~~      | ~~um GLIFO (SVG, sem letra)~~  | ~~"{nome} leu este dia"~~       |
 *
 * ...e ela **fica riscada, não apagada**, porque a linha de baixo só se
 * entende sabendo o que havia antes. No canvas os dois são o MESMO desenho —
 * círculo de 18×18 com a inicial em monoespaçada — e o que os separa é
 * **vazado × cheio**:
 *
 * |            | forma                              | `aria-label`                |
 * | ---------- | ---------------------------------- | --------------------------- |
 * | escreveu   | disco CHEIO (`Livro.dc.html:73`)   | "{nome} escreveu neste dia" |
 * | leu        | disco VAZADO (`Livro.dc.html:83`)  | "{nome} leu este dia"       |
 *
 * ⚠️ **O "sem depender de cor" NÃO enfraqueceu, e a razão é que a diferença é
 * ESTRUTURAL:** o vazado não tem preenchimento NENHUM. Um "vazado" repintado
 * com outro fundo continuaria diferente no código e deixaria de ser
 * distinguível por quem não separa matizes — e é exatamente esse mutante que
 * o acusador mata, procurando qualquer utilitário `bg-*` no vazado.
 *
 * ⚠️ **E A SILHUETA DEIXOU DE SER O ARGUMENTO.** O docblock antigo registrava,
 * medido, que trocar o raio PEQUENO por `rounded-full` **sobrevivia** — a
 * silhueta não tinha acusador. Agora os dois SÃO `rounded-full` por decisão do
 * canvas, e o que carrega a distinção é o preenchimento, que tem acusador.
 *
 * O acusador das metades é
 * `tells READING apart from WRITING on the same row` em
 * `__tests__/book.test.tsx`, e ele usa a **mesma pessoa** nos dois papéis —
 * senão a diferença de rótulo (ou a inicial) poderia vir do nome, e não do
 * verbo.
 *
 * ⚠️ **E NENHUM DOS DOIS É `<svg>` ESCRITO À MÃO.** O `PresenceMark` desenha a
 * inicial em texto e, sem nome, cai no `User` do `lucide-react` — que é
 * `CLAUDE.md` e é também o que mantém o desenho visível para a varredura do
 * ADR 0002 (`__tests__/adr-0002-iconography.test.ts`): um ícone importado tem
 * NOME, e um `<path d="…">` não teria palavra nenhuma para a guarda achar.
 *
 * ⚠️ **A MARCA NÃO É LINK NEM ALVO DE TOQUE** (decisão I): ela é informação, e
 * o dia inteiro já é um link para a anotação. Alvo dentro de alvo em tela de
 * celular é toque errado garantido.
 */

/** `/plan-items/:planItemId/reading-log` — o endereço das DUAS operações. */
function readingLogPath(planItemId: string): string {
  return `/plan-items/${encodeURIComponent(planItemId)}/reading-log`;
}

export interface ReadMarksProps {
  /** Os leitores daquele dia, na ordem que a API devolveu. */
  userIds: readonly string[];
  me: ActiveClubMe | null;
  names: Map<string, string | null>;
}

/**
 * UMA MARCA POR LEITOR, E NADA QUANDO NINGUÉM LEU.
 *
 * A ausência é **silenciosa** — nem "ninguém leu", nem espaço reservado: é o
 * anti-culpa aplicado ao vazio, o mesmo que o dia sem autoria já faz.
 *
 * O nome sai do `nameOfWriter` do `club-names.ts` — **um dono só** para as
 * duas sobreposições e para o acervo. Duas funções seriam duas verdades sobre
 * o mesmo nome, que é exatamente a inconsistência que a Tarefa 27 existiu para
 * fechar ("Maria" embaixo e "alguém do clube" dois dedos acima).
 *
 * Sem nome resolvido, a frase neutra — e ela é a versão de LEITURA da que a
 * escrita já tinha, nunca a de escrita reaproveitada: dizer "escreveu" sobre
 * quem só leu é comunicar errado, que é pior que não comunicar.
 */
export function ReadMarks({ me, names, userIds }: ReadMarksProps) {
  const { t } = useTranslation();

  return (
    <>
      {userIds.map((userId) => {
        const name = nameOfWriter(userId, me, names);

        return (
          /*
            ⚠️ **O `data-read-mark` FICA, e ele é o corte de teste da decisão
            C.** As duas marcas da linha são `role="img"` com nome acessível; é
            este gancho que separa "quem leu" de "quem escreveu" para o
            `avatarsIn()`/`readMarksIn()` do `book.test.tsx`. Sem ele os dois
            helpers contariam a mesma coisa e os testes da Tarefa 27 (as
            iniciais, a frase nomeada) passariam a falar de outro elemento.

            ⚠️ **E O `PresenceMark` É QUEM DESENHA DESDE A TAREFA 44.** O par
            `<span><Check/></span>` daqui e o `PersonAvatar` do `book.tsx`
            eram DOIS desenhos diferentes para a mesma coluna; o canvas tem um
            só, em dois estados. O `state` é o que muda, e ele é `'read'`
            porque esta lista é a de quem LEU.
          */
          <span className="flex" data-read-mark="" key={userId}>
            <PresenceMark
              label={
                name === null
                  ? t('pages.book.plan.reader')
                  : t('pages.book.plan.readerNamed', { name })
              }
              name={name}
              state="read"
            />
          </span>
        );
      })}
    </>
  );
}

export interface TodayReadingProps {
  /** O dia de HOJE no plano. O componente só é montado quando ele existe. */
  planItemId: string;
  /** Se EU já marquei — não "se o dia tem leitor". */
  marked: boolean;
  /** Rebusca o livro (decisão F). Rejeita se a releitura falhar. */
  onChanged: () => Promise<void>;
}

/**
 * O TOQUE "LI HOJE" — em primeira pessoa, e só no dia de hoje.
 *
 * ⚠️ **BOTÃO DE DOIS ESTADOS, E NÃO UM `checkbox`** (decisão D): o estado é do
 * SERVIDOR e a ação é assíncrona, e um `checkbox` prometeria alternância local
 * imediata. O estado atual vive no RÓTULO, junto com a ação — por isso não há
 * `aria-pressed`: quem ouve a tela ouve a frase inteira, e a tela continua com
 * zero `[aria-pressed]`, que é o que sobrou da morte das abas na Tarefa 28.
 *
 * ⚠️ **SÓ HOJE, e é escopo, não simplificação** (a tabela "Fora" da spec). A
 * rota aceita qualquer `planItemId`; a tela oferecer 30 toggles transforma a
 * lista num formulário de auditoria retroativa — e é exatamente onde "por que
 * você não marcou o dia 4?" nasce. Ler atrasado se resolve marcando o dia
 * quando ele FOR hoje. ⚠️ Se o dono quiser marcar dia passado, a pergunta está
 * registrada em `docs/tasks/32b-marca-de-leitura-na-tela.md` (seção "A
 * pergunta do dono"), que é o único endereço dela hoje.
 *
 * ⚠️ **DEPOIS DE MARCAR, A TELA REBUSCA O LIVRO** (decisão F). Não existe rota
 * de sobreposição (medido na Tarefa 32), e atualizar só o estado local faria a
 * marca do ATOR aparecer e a dos outros envelhecer — a divergência só
 * apareceria no próximo recarregamento. O `onChanged` é a releitura, e ela é
 * parte da MESMA operação: o botão só se libera quando ela termina, então o
 * toque duplo não escapa pela janela entre a escrita e a releitura.
 *
 * ⚠️ **E O TOQUE DUPLO NÃO MANDA DOIS `PUT`.** A guarda é o `inFlight` logo
 * abaixo — **desta tela**, não do `Button` de `packages/ui`. A Tarefa 32 já
 * matou o 500 do lado do servidor; aqui é o lado que evita a corrida, e a
 * prova é por CONTAGEM (§7.3), nunca por ausência de erro. Medido com o
 * `loading` do `Button` neutralizado (o visual em voo preservado): **1**
 * acusador sem o `inFlight`, **0** com ele — ou seja, a propriedade deixou de
 * depender de um pacote que esta fatia não pode tocar.
 *
 * ⚠️ **FALHA NÃO DESFAZ A TELA** (decisão G): recado neutro e "tentar de novo"
 * que REFAZ a operação. O recado fala do registro que não foi gravado, nunca
 * da pessoa que não leu — e ele é um `Notice`, que não tem cor de perigo: o
 * vermelho aqui seria o §1 do plano de produto sendo violado pelo caminho de
 * erro.
 */
export function TodayReading({
  marked,
  onChanged,
  planItemId,
}: TodayReadingProps) {
  const { t } = useTranslation();
  const { api } = useAuth();

  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /**
   * ⚠️ **A GUARDA DA CORRIDA MORA AQUI, E NÃO NO `packages/ui` — correção
   * medida da rodada da 32b.**
   *
   * A primeira versão confiava no `loading` do `Button` (`blocked = disabled
   * || loading`, em `packages/ui/src/components/button.tsx`). Isso punha a
   * propriedade "toque duplo não manda dois `PUT`" num pacote que esta fatia
   * **não pode tocar** e cujo contrato pode mudar sem ninguém olhar para cá —
   * e a medição que a "provava" estava suja: tirar o `loading` tira junto o
   * `aria-busy`, então um dos dois acusadores era a regra 15 medindo o
   * spinner, não a corrida.
   *
   * ⚠️ **`useRef` e não `useState`**: o `setBusy(true)` só vale no PRÓXIMO
   * render, e dois cliques no mesmo tick leriam o `busy` antigo. O `ref` muda
   * no instante da primeira entrada, que é onde a corrida acontece.
   *
   * O `loading` do `Button` fica — como **aviso visual** (spinner, cursor e
   * `aria-busy`), não como regra.
   */
  const inFlight = useRef(false);

  async function toggle(): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);

    try {
      const path = readingLogPath(planItemId);
      if (marked) {
        /*
          ⚠️ **204 SEM CORPO — a primeira vez no app.** O
          `noContentResponseSchema` (`@clube/shared`) é `z.undefined()`, e não
          `z.null()`: o cliente faz `safeJsonParse('')`, que LANÇA e devolve
          `undefined`. Um schema que recusasse isso transformaria toda
          desmarcação bem-sucedida num `ApiError` com o registro já apagado.
          → o docblock do schema, e o teste dele em `api-client.test.ts`.
        */
        await api.delete(path, noContentResponseSchema);
      } else {
        /*
          `api.request` e não `api.put`: o `ApiClient` não tem atalho de `PUT`,
          e criar um pediria mudar o cliente HTTP compartilhado por uma linha.
          Sem corpo — o dia vem da rota e o leitor vem do JWT.
        */
        await api.request(path, {
          method: 'PUT',
          schema: readingLogResponseSchema,
        });
      }
      await onChanged();
    } catch {
      /*
        Nada da API na tela: o erro vira CHAVE de catálogo (§6.2). E não há
        `status` a distinguir — 404 (o livro saiu do ar), 500 e rede caída
        dizem a mesma coisa para quem queria marcar que leu, e todas se
        resolvem com o mesmo gesto.
      */
      setFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      {/*
        ⚠️ **O SELO É O ESTADO MARCADO, E ESTE É O PRIMEIRO CONSUMIDOR DA
        VARIANTE** (decisão F da Tarefa 44). `Livro.dc.html:55`:
        `background:var(--gold-soft)`, `border:1px solid var(--gold-line)`,
        `color:var(--gold-strong)` — e o glifo `Check`, que o `Button` já
        desenha sozinho quando a variante é `seal`.

        ⚠️ **`seal` É ESTADO, NÃO HIERARQUIA.** O ouro é o filete da edição
        crítica (o dia de hoje, a abertura de seção), não uma terceira cor de
        ação: desmarcado, o botão continua `ghost`. É o que impede o dourado de
        virar "o botão importante" e aparecer em tela nenhuma mais.

        ⚠️ **E O "TENTAR DE NOVO" NÃO O VESTE**, logo abaixo: ele não é o
        registro de leitura, é a repetição de uma operação que falhou. Um selo
        dourado ali diria que alguma coisa foi marcada.
      */}
      <Button
        loading={busy}
        onClick={() => void toggle()}
        variant={marked ? 'seal' : 'ghost'}
      >
        {marked ? t('pages.book.read.unmark') : t('pages.book.read.mark')}
      </Button>
      {failed ? (
        <Notice
          action={
            <Button
              loading={busy}
              onClick={() => void toggle()}
              variant="ghost"
            >
              {t('pages.book.retry')}
            </Button>
          }
          title={t('pages.book.read.failed')}
        />
      ) : null}
    </div>
  );
}
