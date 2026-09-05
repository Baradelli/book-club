# COMO-TESTAR.md — o passo a passo do dono

> Como subir o projeto, entrar, e olhar o que existe hoje. **Tudo neste arquivo foi executado
> de verdade** antes de ser escrito — os comandos, as rotas e as respostas são as reais, não
> as prováveis.
>
> Estado: **Tarefas 01 a 18 fechadas.** Backend do MVP 1 completo; do front existem
> **login**, **aceite de convite**, **home**, **tela do livro** e **a anotação do dia com o
> editor**. **O circuito principal do produto funciona.**

---

## 1. O que dá para testar hoje — e o que NÃO dá

**Dá:**

| O quê | Onde |
|---|---|
| Entrar e sair | `/login` |
| Aceitar convite e definir a própria senha | `/convite/:code` |
| A home: nome do clube, estante, atalho da leitura de hoje | `/` |
| **A tela do livro**: o plano dia a dia, hoje destacado, quem escreveu | `/books/:id` |
| **Escrever a anotação do dia**, com autosave e o editor completo | pelo atalho de hoje |
| **Ler o que a outra pessoa escreveu** naquele mesmo dia | a mesma tela |
| **Escrever a anotação do dia SEM conexão** — o texto fica guardado e sobe sozinho | a mesma tela (§6.1) |
| O estado "nenhum clube ainda" | `/` com um usuário sem membership |
| Seletor de clube | `/` com **2+** clubes |
| Tema claro/escuro e idioma pt/en | cabeçalho |
| Instalar como app (PWA) | menu do navegador |
| Rota inexistente | qualquer `/xyz` |

**NÃO dá, e é importante você saber antes de procurar:**

- **Menções `@`/`[[` e colar imagem no editor** → ficaram de fora da Tarefa 18 de propósito:
  não existe endpoint de upload no backend, e não há tela de busca de anotação para as menções
  apontarem. As duas são "capability-gated" por prop — ligar depois é passar a prop.
- **A anotação avulsa** (a que não é de um dia do plano) e o filtro **Tudo · Minhas · de X** →
  Tarefa 19.
- ⚠️ **ABRIR O APP DO ZERO SEM CONEXÃO** (o "cold start" no metrô) → **ainda não**, e esta é a
  confusão mais provável. A Tarefa 21 fez a **escrita** sobreviver à queda da rede; a
  **leitura** (`/me`, o livro, as anotações) continua indo ao servidor, então abrir o app com
  o avião ligado mostra erro de carregamento. A premissa da fatia é o app **já aberto** (ou
  reaberto com rede) e a rede caindo **enquanto você escreve**. Cache de leitura é MVP 2 —
  teste como está no §6.1, não no túnel.
- **Criar anotação avulsa sem conexão** → de fora de propósito: o `POST` de criação não é
  idempotente e o backend não tem chave de idempotência, então reenviar às cegas criaria nota
  duplicada. A tela avulsa continua exigindo conexão para **criar**.
- **Cadastrar livro pela interface** → Tarefa 20. Por enquanto é pela API (§5 aqui).
- **Criar clube e convidar pela interface** → MVP 4 (Tarefas 42/43). Por API (§5).
- Grifos, marcar "li", feed, notificação → MVPs 2 e 3.

---

## 2. Uma vez só: conferir o ambiente

O banco roda em Docker, na porta **5436** (as 5432–5435 estão ocupadas por outros projetos
seus):

```bash
pnpm db:up                    # sobe o Postgres
docker ps --format "{{.Names}}\t{{.Ports}}" | grep clube_db
```

O `packages/backend/.env` já existe e tem `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. **A senha
do super-admin está nesse arquivo** — abra para ver. Se quiser trocá-la:

```bash
# edite SEED_ADMIN_PASSWORD no packages/backend/.env, depois:
SEED_ADMIN_FORCE_PASSWORD=1 pnpm prisma:seed
```

> Sem o `SEED_ADMIN_FORCE_PASSWORD=1` o seed **nunca** sobrescreve senha que já existe — é
> proteção deliberada.

---

## 3. Subir

Dois terminais:

```bash
# terminal 1 — a API
pnpm dev:backend        # http://localhost:3333

# terminal 2 — o app
pnpm dev:app            # http://localhost:5173
```

Confira que subiram:

```bash
curl http://localhost:3333/health        # {"status":"ok"}
```

E abra **http://localhost:3333/docs** — é o Swagger com **todas** as rotas, e é por ali que
você vai criar clube e livro sem escrever `curl`.

**Para derrubar:** `Ctrl+C` em cada terminal. Se o backend não morrer, é porque o
`tsx watch` roda **dois** processos — mate o supervisor primeiro:

```bash
netstat -ano | grep ":3333"                    # descobre o PID
powershell "Stop-Process -Id <PID> -Force"
```

---

## 4. Entrar

1. Abra **http://localhost:5173** → você é mandado para `/login`.
2. E-mail `admin@clube.local`, senha do `.env`.
3. Você cai na home.

**O que você vai ver na primeira vez: "nenhum clube ainda".** Isso está **certo**, não é bug.
O super-admin do seed é dono da *plataforma* e não é membro de nenhum *clube* — são papéis
diferentes. Criar clube pela interface é MVP 4.

Vale testar dois caminhos aqui:

- **Senha errada** → mensagem de credencial inválida, **e você continua na tela de login** (um
  401 de login não desloga ninguém — foi conserto da Tarefa 15).
- **Abrir `/` sem estar logado** → vai para `/login`, e depois de entrar **volta para onde você
  queria**, não para a home. Teste com `http://localhost:5173/books/abc?tab=plano#dia-3`: você
  vai para o login, entra, e cai naquele endereço. Use um `bookId` que exista para ver a tela
  do livro de verdade; com um id inventado, o que se testa é o **destino preservado** (e a
  frase própria de "livro não encontrado", que não é a genérica).

---

## 5. Criar clube e convite (pelo Swagger) — o livro já é pela tela

**Use o Swagger, não o terminal.** Motivo medido: no Git Bash do Windows, acento e travessão
no `curl -d` viram JSON malformado, e o erro que volta é um `400 Bad Request` **genérico, sem
`details`** — porque JSON quebrado morre no parser, antes da validação. Você perde meia hora
procurando um bug que é do shell.

No **http://localhost:3333/docs**:

1. **`POST /auth/login`** → copie o `token` da resposta.
2. Clique em **Authorize** (no alto) e cole o token.
3. **`POST /clubs`** — só super-admin. O clube nasce **com você como `OWNER`** na mesma
   operação:
   ```json
   { "name": "Clube do Casal", "timezone": "America/Sao_Paulo" }
   ```
   Guarde o `id` que volta.
4. **O livro e o plano NÃO precisam mais do Swagger** — desde a Tarefa 20 eles têm tela; veja
   o §5.1 logo abaixo. O JSON continua aqui só como referência do formato (e para quem quiser
   cadastrar um mês inteiro de uma vez colando):
   ```json
   {
     "title": "O Senhor dos Anéis",
     "author": "J. R. R. Tolkien",
     "month": "2026-09",
     "totalPages": 1200,
     "planItems": [
       { "date": "2026-09-03", "title": "Cap. 1 — Uma festa muito esperada", "reference": "p. 1-30" },
       { "date": "2026-09-04", "title": "Cap. 2 — A sombra do passado",      "reference": "p. 31-60" },
       { "date": "2026-09-05", "title": "Cap. 3 — Três não é demais",        "reference": "p. 61-92" }
     ]
   }
   ```
   `month` é `"YYYY-MM"`; as datas do plano são únicas e **crescentes**.
5. **`POST /clubs/{clubId}/invites`** → devolve um `code`. É o que você manda para sua namorada.
   ```json
   { "role": "MEMBER", "ttlDays": 7 }
   ```

> **Eu já deixei isso pronto.** Existe o clube **"Clube do Casal"**, o livro **"O Senhor dos
> Anéis"** com plano de 3 dias (ontem, hoje, amanhã), e um convite com o código
> **`ENFCGUH7MHS2`**. Se quiser começar do zero, o §8 explica como limpar.

---

## 5.1. Cadastrar o livro do mês pela tela (Tarefa 20)

Esta é a tela que aposentou o Swagger no uso do dia a dia. **Só aparece para quem é `OWNER` ou
`ADMIN` do clube** — se você não vir o botão, o papel é o motivo, não um bug.

**Onde entra:** na **home**, um botão de cadastrar livro; e na **tela do livro**, um botão de
corrigir o que já está lá.

O caminho normal:

1. Preencha **título** e **mês** (`AAAA-MM`). Autor, capa e total de páginas são opcionais —
   deixar em branco não manda campo vazio nenhum para o servidor.
2. No plano, use o **gerador**: escolha a data do primeiro dia e quantos dias, e ele cria as
   linhas com as datas já preenchidas. **Ponha o dia de hoje dentro do intervalo**, senão o
   atalho da home não aparece (e não aparecer é o correto).
3. Escreva o **tema** de cada dia — é a única parte que não dá para gerar, porque é o conteúdo.
   A referência (`p. 31-60`) é livre e opcional.
4. **Salvar.** Não há autosave aqui, de propósito: o salvamento **substitui o plano inteiro**,
   e um autosave gravaria plano pela metade.

Coisas que valem provocar:

| Provoque | O que tem de acontecer |
|---|---|
| Salve com o título ou o mês em branco | o campo fica marcado e **nada é enviado** — não é o servidor que recusa, é a tela. |
| Escreva `2026-13` no mês | reprovado **na tela**, antes de sair. |
| Gere 30 dias e deixe um tema em branco | **só aquela linha** é marcada. |
| Ponha duas linhas com a mesma data, ou uma data anterior à de cima | a **linha certa** é marcada, com frases diferentes para "repetida" e "fora de ordem". As datas do plano são únicas e crescentes. |
| Abra a edição e salve **sem mudar nada** | nada é enviado. Nem o livro, nem o plano. |
| Remova um dia em que **alguém já escreveu** e salve | o servidor recusa com uma frase explicando, **a linha volta**, e o que você digitou nas outras linhas continua lá. |
| Mude o tema de um dia, remova esse dia, e leve a recusa acima | a linha volta **com o tema que você digitou**, não com o antigo. |
| O gerador some depois que o plano tem linhas | é de propósito: gerar por cima apagaria os temas, que são o que não se refaz. Para crescer o plano, use **acrescentar um dia**. |
| Abra a tela num celular e depois numa janela larga | no celular a linha empilha; no desktop ela vira `data · tema · referência` numa só. |
| Peça para sua namorada (que é `MEMBER`) procurar o botão | ela **não** vê nenhum. E se você mandar o link direto para ela, a tela recusa com frase própria. |

---

## 6. Testar a home

Recarregue **http://localhost:5173**. Agora deve aparecer:

- o **nome do clube** no cabeçalho;
- a **estante** com o livro (título, autor, o mês);
- o **atalho da leitura de hoje**, com o tema do dia ("Cap. 2 — A sombra do passado").

Coisas que valem provocar:

| Provoque | O que tem de acontecer |
|---|---|
| Clique no atalho de hoje | abre **a anotação do dia**, com o editor. É o circuito principal do produto. |
| Clique num livro da estante | abre **a tela do livro**: o plano dia a dia, hoje destacado, e os avatares de quem escreveu. Não recarrega o app (é navegação interna). |
| Remova o item de hoje do plano (pela tela de edição do §5.1) | o atalho **desaparece** e **nada** aparece no lugar cobrando você. Sem "você está atrasado", sem contador, sem vermelho. É o princípio anti-culpa, e é regra testada. |
| Cadastre um segundo livro com `month` do **mês que vem** | a estante mostra os dois, e o atalho de hoje **continua funcionando**. Isso era um bug de verdade até a Tarefa 16: o livro futuro roubava o primeiro lugar e o atalho desaparecia. |
| Crie um **segundo clube** (`POST /clubs`) | aparece o **seletor de clube** no cabeçalho (com um clube só ele não aparece, de propósito). Trocar de clube troca a estante. |
| Troque o tema no cabeçalho | claro/escuro, e a escolha **sobrevive ao recarregamento**. Recarregue com `Ctrl+Shift+R` e veja que **não pisca branco** antes de escurecer. |
| Troque o idioma para `en` | tudo traduz. Se alguma coisa aparecer como `pages.home.algo`, é chave faltando — **me diga qual**. |
| Desligue o Wi-Fi e recarregue | mensagem de falha de rede **com botão de repetir**, e o repetir refaz a requisição. (Isto é a **leitura**, e ela continua precisando de rede: cache de leitura é MVP 2. O que sobrevive à queda é a **escrita** — §6.1.) |

---

## 6.1. Testar a escrita sem conexão (Tarefa 21)

> ⚠️ **A PREMISSA, e sem ela o teste "falha" sem haver nada errado:** o app tem de estar **já
> aberto** quando a conexão cair. Abrir do zero sem rede não funciona ainda (a leitura vai ao
> servidor — veja o §1). O jeito certo de testar é: abra a anotação do dia **com** rede, e só
> então corte.

Cortar a rede: no computador, DevTools → aba **Network** → *Offline*. No celular, ligue o modo
avião com o app aberto.

| Provoque | O que tem de acontecer |
|---|---|
| Com o dia aberto, corte a rede e **escreva** | 1,5 s depois o indicador diz **"Sem conexão agora. Seu texto está guardado e vai sozinho."** — sem vermelho, sem botão, sem cobrança. |
| Continue escrevendo por vários minutos, ainda offline | o indicador não muda e **nada** é enviado. Não há tentativa a cada N segundos: não existe timer. |
| **Religue a rede** (DevTools → *Online*, ou desligue o avião) | em segundos o indicador vira **"Salvo"**, e no DevTools → Network aparece **UMA** requisição `PUT`, não uma por minuto de digitação. |
| Offline, escreva, **feche a aba** e reabra **com** rede | o texto está lá, e sobe sozinho. É o teste que mais importa desta fatia. |
| Offline, escreva e reabra a mesma tela ainda offline | o editor abre com **o seu rascunho** (não com a versão velha do servidor). |
| Escreva no celular numa aba **anônima** (armazenamento bloqueado) | o app **não quebra**: ele volta a dizer "Não foi possível salvar agora. Seu texto continua na tela." com "Salvar de novo", como era antes desta fatia. |

Onde o texto fica guardado: **IndexedDB**, banco `clube-do-livro`, tabela `pendingNotes` —
DevTools → aba *Application* → *IndexedDB*. Uma linha por (pessoa, dia): ela aparece quando
você digita e **some** quando o servidor confirma. Se você entrar com a outra conta, a linha da
primeira **não** é enviada — a fila é por pessoa, de propósito (o autor da nota vem do login).

---

## 7. Testar o aceite de convite

Este é o fluxo que a sua esposa vai viver, e vale testar **numa janela anônima** (para não
misturar com a sua sessão):

1. Abra `http://localhost:5173/convite/ENFCGUH7MHS2`.
2. Preencha e-mail, nome (opcional) e senha (**mínimo 8 caracteres**).
3. Ao enviar, você entra **já autenticado** e no clube.

O que provocar:

- **Código inexistente** (`/convite/NAOEXISTE`) → mensagem de convite não encontrado.
- **O mesmo código duas vezes** → o convite é de **uso único**; a segunda vez diz que o link não
  vale mais.
- **Senha de 7 caracteres** → marca o campo, não um alerta genérico.

> **Limitação conhecida, e é decisão registrada:** a tela **não sabe** de qual clube é o convite
> nem se ele venceu **antes** de você enviar — não existe rota pública de prévia. Então dá para
> digitar tudo e só então descobrir que o código venceu. Se isso te incomodar no uso real, me
> diga: são ~15 linhas de backend.

---

## 8. Limpar e recomeçar

Para apagar o que **eu** deixei e testar do zero (ordem importa por causa das chaves
estrangeiras):

```bash
docker exec -i clube_db psql -U clube -d clube <<'SQL'
BEGIN;
DELETE FROM "Note";
DELETE FROM "ReadingPlanItem";
DELETE FROM "Book";
DELETE FROM "Invite";
DELETE FROM "Membership";
DELETE FROM "Club";
COMMIT;
SELECT (SELECT count(*) FROM "Club") AS clubes, (SELECT count(*) FROM "User") AS usuarios;
SQL
```

Isso **preserva** o super-admin do seed (a tabela `User` não é tocada) e apaga clubes,
membros, convites, livros, planos e anotações. Se você criou usuários pelo aceite de convite e
quiser removê-los também, apague-os por e-mail **depois** do bloco acima.

---

## 9. O aceite e as perguntas → `docs/ACEITE-MVP.md`

Este arquivo ensina a **rodar e provocar** cada tela. O que precisa estar funcionando para o MVP
ser dado por pronto — e as perguntas que só você pode responder — mora em **`docs/ACEITE-MVP.md`**,
num arquivo só, porque toda vez que a mesma lista existiu em dois lugares neste projeto as duas
cópias divergiram na primeira correção.

Lá estão, para o MVP 1:

- **o roteiro de aceite** — o circuito completo no celular, a checklist §14 do `EDITOR.md`, a
  escrita sem conexão, o convite, e o que olhar de contraste e tema escuro;
- **as oito perguntas** — o filtro por pessoa e o nome de quem escreveu, se entra mais gente no
  clube, a anotação do dia arquivada, arquivar livro, abrir o app sem rede, criar avulsa
  offline, manter o inglês, e o que você esperava e não encontrou;
- **o espaço das suas considerações** e o veredito que fecha o MVP.

O ritual é sempre o mesmo: eu preparo o roteiro e as perguntas, você testa e responde, e as
respostas viram decisões fechadas no `BACKLOG.md` antes de o MVP seguinte ser detalhado.

---

## 10. Se algo não subir

| Sintoma | Causa provável |
|---|---|
| `curl /health` não responde | o Docker está parado. `pnpm db:up`, e confira `docker ps`. |
| Login dá erro de rede no navegador | o backend não está de pé, ou o `VITE_API_URL` do `packages/app/.env` aponta para outra porta (o certo é `http://localhost:3333`). |
| `prisma migrate` reclama | rode `pnpm --filter @clube/backend prisma migrate status`. São **3** migrations e ele deve dizer "up to date". |
| A tela fica branca | abra o console do navegador e me mande o erro. Tela branca é bug — existe rota `*` justamente para isso não acontecer. |
| Um `400 Bad Request` sem explicação ao usar `curl` | é o encoding do shell. Use o Swagger (§5). |
