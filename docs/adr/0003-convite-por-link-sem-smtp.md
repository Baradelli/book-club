# ADR 0003 — Entrada no sistema só por convite com código, sem e-mail transacional

- Status: aceito
- Data: set/2026
- Fase: MVP 1 (Bloco A — Clube, convite e sessão)

## Contexto

Alguém precisa entrar no sistema. As pessoas do clube não são anônimas da internet: são a
esposa, um amigo, alguém que já foi convidado pessoalmente. Não existe caso de uso para
cadastro aberto — e cadastro aberto num app sem moderação é só superfície de ataque.

Ao mesmo tempo, o admin não deveria ter de inventar e transmitir senha por conta própria,
nem o projeto deveria depender de um provedor de e-mail para funcionar.

## Decisão

**Não existe cadastro aberto.** A única entrada é o convite:

1. Um admin do clube (`OWNER`/`ADMIN`) cria um `Invite` com `code`, `role` e `expiresAt`.
2. O link `/convite/<code>` é entregue **fora do sistema** — WhatsApp, pessoalmente, o canal
   que o clube já usa.
3. A pessoa abre o link, informa nome e **define a própria senha**. O aceite cria o `User`
   (se ainda não existir) e o `Membership` com o papel do convite.
4. O convite é de **uso único** e expira.

**Não há SMTP, provedor de e-mail, nem e-mail transacional de qualquer tipo** no projeto.
"Esqueci minha senha" é resolvido pelo super-admin com um reset manual (MVP 4).

## Alternativas consideradas

- **Admin define e-mail e senha inicial.** Mais simples ainda: uma tela, zero fluxo público.
  Mas o admin passa a conhecer a senha de outra pessoa e tem de transmiti-la, e a pessoa
  provavelmente nunca troca. Senha que outra pessoa escolheu é senha compartilhada.
- **Convite por e-mail (Resend/SES).** É o que um produto de verdade faria, e resolve o
  reset de senha de graça. Mas custa: um provedor para configurar, chaves para guardar,
  domínio para verificar, entregabilidade para depurar, e um serviço externo do qual o app
  passa a depender para alguém conseguir entrar. Para um clube de duas a seis pessoas, é
  infraestrutura desproporcional — e o canal de entrega real (WhatsApp) já existe e é melhor.
- **Login social (Google).** Zero senha para gerenciar, e todo mundo tem conta Google. Mas
  amarra o projeto a um provedor OAuth, exige configuração de credencial e tela de consent,
  e não resolve autorização — ainda seria preciso o convite para saber em qual clube a
  pessoa entra. Fica registrado como possibilidade futura, não como necessidade.
- **Link mágico sem senha (magic link).** Elegante, mas depende de e-mail — cai na alternativa
  anterior.

## Consequências

- (+) Cada pessoa escolhe a própria senha, e ninguém mais a conhece.
- (+) Zero infraestrutura externa: o projeto roda com Postgres e nada mais. Não há chave de
  provedor para vazar nem serviço para cair.
- (+) A autorização vem embutida no convite: o `role` já está definido antes de a pessoa
  entrar.
- (−) O código do convite viaja por um canal que não controlamos. Mitigação: **uso único** e
  `expiresAt` curto (padrão sugerido: 7 dias), `code` com entropia suficiente para não ser
  chutável, e revogação pelo admin (MVP 4).
- (−) Não há "esqueci minha senha" self-service. No tamanho de clube previsto, pedir ao
  super-admin é aceitável — e o reset entra no MVP 4.
- (−) Se o projeto crescer para dezenas de clubes, e-mail transacional se torna inevitável.
  Registrado no plano, §11, como decisão em aberto. A troca é aditiva: o convite continua
  existindo; ganha um canal de entrega.
