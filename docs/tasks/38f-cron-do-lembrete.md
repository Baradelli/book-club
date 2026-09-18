# Tarefa 38f — O lembrete passa a sair sozinho: `node-cron` atrás de uma chave

> **Fatia pedida pelo dono no fechamento do MVP 3** (2026-09-17), depois de ele configurar as
> chaves VAPID e conferir a notificação no aparelho. Ela fecha o **primeiro dos três buracos
> de ambiente** do MVP 3: *"ninguém chama o lembrete"*.
>
> Leia antes: **`docs/adr/0006-push-dispatcher-pull-based.md`** — ⚠️ **ele RECUSOU `node-cron`
> por escrito, e esta fatia é a variante que o dono escolheu** · `docs/NOTIFICACOES.md` §6 ·
> `docs/CONVENCOES-CODIGO.md` **§7.1** (fidelidade nos dois sentidos), **§7.3** (contador, nunca
> cronômetro), **§7.4** (asserção vazia), **§7.9** (a guarda no lugar certo), **§7.10**.

---

## ⚠️⚠️ A decisão de produto, e por que ela NÃO desfaz o ADR 0006

O ADR 0006 lista `node-cron` dentro do Fastify entre as alternativas **recusadas**, com três
argumentos. Relidos contra o que foi **de fato entregue** na Tarefa 37:

| argumento original | estado |
| --- | --- |
| *"o agendamento morre com o processo"* | ✅ **continua valendo, e foi aceito conscientemente** |
| *"com duas instâncias, todo mundo recebe duas notificações"* | ❌ **caiu** — o claim no banco (`ON CONFLICT DO NOTHING`) torna impossível |
| *"a idempotência ficaria na memória do processo"* | ❌ **caiu pelo mesmo motivo** |

O próprio ADR fecha com *"precisaria do claim no banco de qualquer forma, e então o timer
interno não paga por si"* — **argumento de custo, não de correção**. O claim foi entregue.

⚠️ **Por isso esta fatia é uma VARIANTE REGISTRADA, não uma emenda.** O ADR já tem precedente
disso: *"um serviço externo de agendamento … é compatível com esta decisão … fica registrado
como variante de deploy, não como arquitetura diferente"*. Esta é a segunda variante, e a
chave de ambiente é o que a mantém sendo variante: **num deploy com duas instâncias ela fica
desligada e o cron externo assume, sem tocar uma linha de código.**

---

## As decisões

| | Decisão | Por quê |
| --- | --- | --- |
| **A** | **`NOTIFICATIONS_CRON=on` liga; qualquer outro valor, e a ausência, deixam desligado** | Desligado é o padrão **seguro**: quem sobe uma segunda instância sem ler nada não passa a mandar push duplicado. ⚠️ O teste do valor errado (`'true'`, `'1'`, `'ON'`) importa: um `Boolean(env.X)` liga com a string `'off'` |
| **B** | **`*/5 * * * *`** — de 5 em 5 minutos | Metade da janela de tolerância (`DEFAULT_WINDOW_MINUTES = 10`): uma passada perdida ainda tem a seguinte dentro da janela |
| **C** | ⚠️ **Sem `timezone` no `node-cron`** | `*/5 * * * *` é "todo minuto múltiplo de 5, de toda hora" — **independente de fuso por construção**. Passar `timezone` aqui não muda nada e faz o próximo leitor achar que o fuso do lembrete se decide aqui. Ele se decide no `Settings.timezone` de cada pessoa, com Luxon, dentro do `scheduler.ts` |
| **D** | ⚠️ **O callback NUNCA deixa uma rejeição escapar** | Um `await` solto num callback de cron vira *unhandled rejection*, e o Node 15+ **derruba o processo por padrão** — o lembrete levaria a API junto. Falha de uma passada é logada e a próxima acontece |
| **E** | ⚠️ **Uma passada por vez** (guarda de reentrância) | Se uma passada demorar mais que 5 min, o `node-cron` dispara a seguinte **em paralelo**. O claim no banco impede notificação duplicada, mas duas passadas concorrentes são trabalho jogado fora e log ilegível |
| **F** | **Agenda mesmo sem VAPID configurado**, e o **boot** diz em uma linha se está configurado ou não | O dispatcher já devolve `vapid-not-configured` **sem abrir o banco** — é barato. Um segundo portão dobraria os caminhos de configuração a testar para não ganhar nada, e o aviso no boot é onde o dono olha |

---

## As regras

1. **TDD.** O agendamento é decidível **sem relógio real** e sem subir servidor: o que se
   testa é *"o `cron.schedule` foi chamado, com que expressão, e o callback chama o
   dispatcher"*. ⚠️ **Nada de `setTimeout` esperando 5 minutos** (§7.3: contador, nunca
   cronômetro).
2. ⚠️⚠️ **A GUARDA NÃO PODE PINAR O TEXTO DO ARQUIVO.** Um `expect(source).toContain('cron.schedule')`
   é exatamente a classe que este projeto já pagou **quatro vezes** (Tarefas 29a, 34b, 38,
   38d): o texto continua verdadeiro depois de a propriedade morrer. A guarda observa o
   **comportamento** — a chamada, a expressão recebida, e o efeito do callback.
3. ⚠️ **O portão da decisão A, testado NOS DOIS SENTIDOS** (§7.1 aplicado a configuração):
   com `on` **agenda**; sem a variável, e com valor diferente, **não agenda**. Um teste só do
   "ligado" deixa passar um cron que roda sempre; um teste só do "desligado" deixa passar um
   cron que nunca roda. **Os dois têm de ter acusador por mutação.**
4. ⚠️ **A decisão D com teste:** dispatcher que **rejeita** não derruba o processo, e a passada
   seguinte acontece assim mesmo. Prove que a rejeição foi tratada — não que "não lançou".
5. ⚠️ **A decisão E com teste, por CONTADOR:** com uma passada ainda pendente, um segundo tique
   **não** chama o dispatcher de novo; quando a primeira termina, o tique seguinte chama.
6. **`node-cron` é dependência nova — a primeira em várias fatias.** Registre a versão, o
   tamanho, e que ela é `dependency` do **backend** e **nunca** chega ao `app`. ⚠️ **O chunk de
   entrada do PWA tem de ficar idêntico** (**431.836 B** hoje): se mudar, alguma coisa vazou.
7. **`.env.example` ganha `NOTIFICATIONS_CRON=` vazio**, com o comentário do que ligá-lo faz.
   ⚠️ **Não é segredo** — é chave de comportamento. Os segredos continuam só no `.env`.
8. ⚠️ **Os documentos, senão a fatia cria os ponteiros mortos que este fechamento passou o dia
   apagando.** Todos com riscar-e-explicar, com data:
   - `docs/adr/0006-*.md` — a **variante registrada**, com a tabela dos três argumentos acima;
   - `docs/NOTIFICACOES.md` §6 — *"não existe cron dentro do processo do Fastify"* ganha a
     ressalva da variante;
   - `docs/COMO-TESTAR.md` §6.7 — *"o lembrete NÃO roda sozinho"* passa a ser condicional;
   - `docs/SETUP.md` — o ADR já promete que o agendamento é passo de deploy registrado lá;
   - ⚠️ **`docs/BACKLOG.md` e `docs/ACEITE-MVP.md` §A.4 — o buraco nº 1 ("ninguém chama o
     lembrete") FECHA.** São **três** buracos listados em dois documentos; sobram dois, e os
     dois textos têm de concordar entre si.
9. Gates: `pnpm -r test` · `pnpm -r typecheck` · `pnpm lint` · `pnpm prettier --check .` ·
   `pnpm --filter @clube/app build`. Hoje: **587 · 195 · 1917 · 757**; integração **618**;
   chunk **431.836 B** (teto **450.000**); precache **16 / 898,67 KiB**.
10. ⚠️ **NÃO rode o dispatcher de verdade e NÃO suba o servidor com o cron ligado.** Ele é AO
    VIVO: com VAPID configurado — e **agora está** — ele manda push real para o aparelho do
    dono e queima o claim do dia. Quem liga pela primeira vez é o dono.

---

## Definição de pronto

- [x] `NOTIFICATIONS_CRON=on` agenda `*/5 * * * *`; ausente ou com outro valor, não agenda —
      **os dois com acusador por mutação**.
- [x] O callback chama `dispatchDueNotifications` e **engole rejeição sem derrubar**, provado.
- [x] Duas passadas não se sobrepõem, provado por **contador**.
- [x] Nenhuma guarda pina o TEXTO do arquivo.
- [x] `node-cron` só no backend; chunk do PWA **idêntico**.
- [x] O buraco nº 1 fechado no `BACKLOG.md` **e** no `ACEITE-MVP.md`, com os dois concordando.
- [x] Nenhuma migration.
