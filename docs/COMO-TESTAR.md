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
| **A tela do livro**: o plano dia a dia, hoje destacado, **quem escreveu, pelo NOME** | `/books/:id` |
| **Escrever a anotação do dia**, com autosave e o editor completo | pelo atalho de hoje |
| **Ler o que a outra pessoa escreveu** naquele mesmo dia | a mesma tela |
| **Escrever a anotação do dia SEM conexão** — o texto fica guardado e sobe sozinho | a mesma tela (§6.1) |
| **Cadastrar o livro do mês e o plano**, com o gerador de dias | `/clubs/:id/books/new` (§5.1) |
| **Anotação avulsa** (título e referência próprios) | pelo acervo (§6.2) |
| **MVP 2 — Registrar um GRIFO**: trecho, cor da caneta, página e comentário no editor | `/books/:id/highlights/new` (§5.2) |
| **MVP 2 — O acervo do livro**: anotações **e** grifos num lugar, filtrável por pessoa, tipo, leitura e cor | `/books/:id/acervo` (§6.2) |
| **MVP 2 — O filtro diz o NOME** (`Tudo · Minhas · De Maria`), com avatar | a mesma tela |
| **MVP 2 — Buscar por texto** no acervo do clube inteiro, em qualquer livro | `/busca`, pela home (§6.3) |
| **MVP 3 — Marcar "li hoje"**, e ver a marca de quem já leu, dia a dia | `/books/:id` (§6.4) |
| **MVP 3 — O feed de atividade** do clube: quem, o quê, em que livro, quando | `/` (§6.5) |
| **MVP 3 — Preferências**: horário do lembrete, ligar/desligar os dois avisos | `/preferencias`, pelo cabeçalho (§6.6) |
| **MVP 3 — Ativar as notificações NESTE aparelho** | `/preferencias` (§6.6) — ⚠️ **exige contexto seguro**, ver a ressalva abaixo |
| O estado "nenhum clube ainda" | `/` com um usuário sem membership |
| Seletor de clube | `/` com **2+** clubes |
| Tema claro/escuro e idioma pt/en | cabeçalho |
| Instalar como app (PWA) — **só em `localhost`**, ver a ressalva abaixo | menu do navegador |
| Rota inexistente | qualquer `/xyz` |

**NÃO dá, e é importante você saber antes de procurar:**

- **Instalar como app (PWA) pelo IP da rede.** Service worker exige contexto seguro
  (HTTPS ou `localhost`), e `http://192.168.0.83:5173` não é nenhum dos dois — o navegador
  não vai oferecer "instalar". Isso **não afeta** o teste de escrita sem conexão do §6.1: o
  rascunho e a fila vivem no IndexedDB, que funciona em `http` normalmente.
- ⚠️ **ATIVAR NOTIFICAÇÃO PELO IP DA REDE — a MESMA limitação, e ela pega o caso principal.**
  Push exige contexto seguro pelo mesmo motivo do PWA, então `http://192.168.0.83:5173` **não
  vai funcionar no celular**: o botão "ativar neste aparelho" vai dizer, com todas as letras,
  que o endereço não é seguro. A tela **explica** em vez de falhar calada — foi decisão de
  desenho —, mas a consequência prática é que **testar push no celular pela rede local não
  dá**. Os caminhos que funcionam: abrir pelo `localhost` da própria máquina, ou expor por um
  túnel HTTPS. ⚠️ **E no iPhone há uma segunda condição**: push em PWA só funciona com o app
  **adicionado à tela de início** — fora dela o navegador expõe a API e simplesmente nunca
  concede a permissão. A tela também diz isso, com uma frase própria.
- ⚠️ **BUSCAR SEM ACENTO.** Procurar `coracao` **não** acha "coração", e procurar `coração`
  não acha "coracao". A busca é `ILIKE` do Postgres: ela ignora **maiúscula** e respeita
  **acento** — é decisão fechada do MVP 2 e está pinada por teste contra o banco. Ligar a
  busca sem acento exige uma extensão do Postgres, um índice novo e um ADR; é fatia própria, e
  **é a pergunta 1 do MVP 2** no `docs/ACEITE-MVP.md`. Se isso te incomodar no celular, diga —
  é o principal candidato do MVP 3.
- ⚠️ **Menções `@`/`[[` e colar imagem no editor** → ficaram de fora de propósito: não existe
  endpoint de upload no backend. As duas são "capability-gated" por prop — ligar depois é
  passar a prop. (A busca de anotação para as menções apontarem **agora existe** — o §6.3 —,
  mas ligar a menção ao acervo é fatia própria.)
- ⚠️ **A barra do editor está só em PORTUGUÊS.** Trocar o idioma para inglês traduz o app
  inteiro **menos** os rótulos dos botões do editor ("Negrito", "Citação", "Grifo amarelo") e
  os do menu `/`. São **33 textos** cravados em `packages/ui`, medidos, e há um teste que
  impede o número de **crescer**. O conserto é conhecido e não é caro — mas ele depende da
  **pergunta 7 do MVP 1** ("manter o inglês?"): se a resposta for "não", o certo é apagar o
  segundo catálogo, e traduzir agora seria trabalho na direção oposta.
- ⚠️ **ABRIR O APP DO ZERO SEM CONEXÃO** (o "cold start" no metrô) → **ainda não**, e esta é a
  confusão mais provável. A Tarefa 21 fez a **escrita** sobreviver à queda da rede; a
  **leitura** (`/me`, o livro, as anotações, os grifos) continua indo ao servidor, então abrir
  o app com o avião ligado mostra erro de carregamento. A premissa é o app **já aberto** (ou
  reaberto com rede) e a rede caindo **enquanto você escreve**. ⚠️ **E isto NÃO entrou no
  MVP 2**: é a **pergunta 5** do MVP 1, que continua sem resposta, e o MVP 2 seguiu sem ela
  porque a regra do fechamento é não decidir no seu lugar. Teste como está no §6.1, não no
  túnel.
- **Criar anotação avulsa sem conexão** → de fora de propósito: o `POST` de criação não é
  idempotente e o backend não tem chave de idempotência, então reenviar às cegas criaria nota
  duplicada. Criar **grifo** sem conexão também não — a fila se provou numa tela (a do dia)
  antes de ser fiada nas outras.
- **Arquivar grifo ou anotação sem conexão** → o mesmo motivo.
- **Criar clube e convidar pela interface** → MVP 4 (Tarefas 42/43). Por API (§5).
- **Desarquivar** qualquer coisa → MVP 4. Arquivado é invisível, inclusive para quem escreveu.
- ⚠️ **VER PROGRESSO COMO NÚMERO** — percentual, "12 de 30 dias", barra que enche. **Não
  existe, e é decisão de produto, não fatia faltando.** O MVP 3 mostra progresso como
  **presença**: uma marca por leitor, por dia. A rota **não devolve contagem nenhuma**, então o
  número é impossível de renderizar por construção — a ideia é que o clube não vire placar. É a
  **pergunta 1 do MVP 3** no `docs/ACEITE-MVP.md`: se depois de usar você quiser o número,
  diga, e ele é fatia própria (e reabre a decisão, não só a tela).
- ⚠️ **"CARREGAR MAIS" NO FEED** → de fora de propósito. Paginação convida a rolar o histórico
  procurando quem fez mais, que é a mesma coisa que o placar. O feed mostra a atividade
  recente e para.
- ⚠️ **MARCAR OU DESMARCAR UM DIA QUE NÃO É HOJE** → **não dá pela tela**, e é bom saber antes
  de procurar o botão. Medido: o toggle "li hoje" é renderizado **fora** da lista de dias,
  só quando existe um item de plano para **hoje**; as linhas dos outros dias mostram apenas as
  marcas de quem leu, que são leitura. Quem viajou e quer registrar sábado no domingo **não
  tem como** — o backend sabe fazer isso (o registro é ancorado no **dia do plano**, não na
  data em que você tocou), mas a tela não oferece. É a **pergunta 2 do MVP 3** no
  `docs/ACEITE-MVP.md`. Se isso te incomodar no uso, diga: é fatia pequena, porque a metade
  difícil já está pronta.

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

## 3. Subir — e no CELULAR, que é onde o app se usa

Dois terminais:

```bash
# terminal 1 — a API
pnpm dev:backend        # escuta em 0.0.0.0:3333 (a máquina toda, não só localhost)

# terminal 2 — o app
pnpm dev:app            # `vite --host`: publica na rede e imprime o endereço
```

O `dev:app` imprime as duas coisas. **No celular use a linha `Network`**, não a `Local`:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.0.83:5173/     ← esta
```

### ⚠️ O `.env` do app tem o IP, e ele muda

`packages/app/.env` guarda **como o navegador alcança a API**:

```
VITE_API_URL=http://192.168.0.83:3333
```

Tem de ser o **IP da máquina na rede**, nunca `localhost`: o `localhost` do celular é o
próprio celular, então com `localhost` ali o app abre e **nenhuma requisição funciona** — o
login incluído. O sintoma é cruel, porque a tela carrega bonita e só falha ao enviar.

Quando o roteador renovar o DHCP e o IP mudar, descubra o novo e troque a linha:

```bash
ipconfig | grep -A 4 "Ethernet"     # o IPv4 da placa que está na sua rede
```

Confira que subiram — **pelo IP, que é o que o celular vai usar**:

```bash
curl http://192.168.0.83:3333/health     # {"status":"ok"}
curl -o /dev/null -w "%{http_code}
" http://192.168.0.83:5173/     # 200
```

Se o `curl` pelo IP funcionar e o celular não, sobrou uma coisa: **o firewall do Windows**.
Ele já libera o `node.exe`; se você trocar a versão do Node, a liberação é por executável e o
Windows vai perguntar de novo — responda **permitir**.

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

1. Abra **http://192.168.0.83:5173** (no computador, `http://localhost:5173` também serve) →
   você é mandado para `/login`.
2. E-mail `admin@clube.local`, senha do `.env`.
3. Você cai na home.

**O que você vai ver na primeira vez: "nenhum clube ainda".** Isso está **certo**, não é bug.
O super-admin do seed é dono da *plataforma* e não é membro de nenhum *clube* — são papéis
diferentes. Criar clube pela interface é MVP 4.

Vale testar dois caminhos aqui:

- **Senha errada** → mensagem de credencial inválida, **e você continua na tela de login** (um
  401 de login não desloga ninguém — foi conserto da Tarefa 15).
- **Abrir `/` sem estar logado** → vai para `/login`, e depois de entrar **volta para onde você
  queria**, não para a home. Teste com `http://192.168.0.83:5173/books/abc?tab=plano#dia-3`: você
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

## 5.2. Registrar um grifo do livro de papel (MVP 2, Tarefas 22–25)

É a fatia que o MVP 2 existe para entregar: você grifou uma frase **no livro de papel**, com
uma caneta de cor, e quer registrar isso — o trecho, a cor, a página e o que você achou.

**O caminho:** tela do livro → **"Ver o acervo do livro"** → **"Novo grifo"**.
(Ou direto em `/books/:bookId/highlights/new`.)

1. **Trecho grifado** — obrigatório. É uma caixa de texto de várias linhas de propósito: uma
   frase de livro costuma ter duas. Você **digita** (ou cola) — não existe OCR de foto de
   página, e isso é decisão registrada, não esquecimento.
2. **Cor da caneta** — obrigatória, cinco cores fixas. Elas são **as mesmas** do grifo do
   editor, de propósito: os valores ficam espelhados para não parecer bug. Cada cor tem
   **nome** ao lado da bolinha — cor nunca é a única informação, para quem não distingue as
   cinco.
3. **Página** — opcional. Aceita inteiro de 1 para cima; `0`, negativo e `45,5` são recusados
   **na tela**, antes de enviar.
4. **Comentário** — opcional, e é **o editor completo** (o mesmo da anotação): negrito, lista,
   citação, o menu `/`. Ele carrega só quando você abre o formulário.

| Provoque | Deve acontecer |
|---|---|
| Salvar com o trecho em branco | o campo é marcado, a frase aparece, e **nada é enviado** |
| Salvar sem escolher cor | mesma coisa |
| Página `0`, `-3` ou `45,5` | recusada na tela, com frase própria |
| Salvar sem tocar no comentário | grifo criado **sem** comentário — e a linha dele no acervo não mostra área de comentário nenhuma |
| Abrir um grifo seu, não mudar nada, salvar | **nenhuma requisição** é feita |
| Abrir o grifo **dela** | abre em leitura: **nenhum** botão de corrigir, **nenhum** de arquivar |
| Arquivar o seu grifo | pede confirmação; **cancelar não chama a API**; confirmar tira da lista e ele **não volta** ao recarregar |

⚠️ **O grifo não depende de você ter escrito anotação naquele dia.** Foi essa a razão de ele
ser uma coisa própria e não um bloco dentro da anotação — está no `docs/adr/0004-*.md`.

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

## 6.2. O acervo do livro: anotações e grifos num lugar (MVP 2, Tarefas 27–28)

**O caminho:** tela do livro → **"Ver o acervo do livro"** (`/books/:bookId/acervo`).

A tela do livro voltou a ser **só o plano** — 30 dias, hoje destacado, quem escreveu em cada
dia. O acervo é onde mora **o que o clube escreveu**: as anotações do dia, as avulsas e os
grifos, **numa lista só**, mais recente primeiro, com o tipo dito em cada linha.

**O filtro tem quatro dimensões**, e as quatro combinam (é "e", não "ou"):

| Dimensão | Como aparece | O que esperar |
|---|---|---|
| **Pessoa** | `Tudo · Minhas · De Maria · De Zeca` — com o avatar de cada uma | ⚠️ **é aqui que o MVP 2 fecha a pergunta 1 do MVP 1**: antes dizia "De outras pessoas" |
| **Tipo** | `Tudo · Do dia · Avulsa · Grifo` | recorta de verdade; grifo **não** é um tipo de anotação |
| **Cor** | as cinco cores, com nome | ⚠️ o grupo **desaparece** quando o tipo é "Do dia" ou "Avulsa" — um filtro de cor ali só poderia esvaziar a lista |
| **Leitura** | um **seletor** com os dias do plano | ⚠️ escolher um dia **exclui** as avulsas e os grifos, porque nenhum dos dois pertence a um dia. É o comportamento certo, não um bug. E o seletor **desaparece** quando o tipo é "Avulsa" ou "Grifo", pelo mesmo motivo da cor |

| Provoque | Deve acontecer |
|---|---|
| Filtrar por pessoa, tipo, cor e leitura ao mesmo tempo | a lista some (é "e", não "ou") — e o estado diz **"nada com este filtro"**, que é diferente de **"nada ainda"** |
| Acervo vazio × filtro sem resultado | **duas frases diferentes**. Se as duas forem iguais, é bug |
| Trocar o tipo com uma cor escolhida | a cor é **descartada** — não fica um recorte invisível |
| Convidar uma terceira pessoa e ela sair do clube depois | ela **deixa** de ser um chip do filtro, mas o **nome** dela continua aparecendo nas anotações que ela deixou. É o ADR 0002: o que ela escreveu é do clube |
| Tocar numa linha sua | abre a tela certa: do dia, avulsa ou o formulário do grifo |
| Tocar numa linha dela | abre em leitura, sem botão de editar |
| Desligar a rede e recarregar | erro de carregamento com "tentar de novo" — e repetir **refaz as três** requisições |

⚠️ **Não existe contador de resultados**, e é de propósito: "12 anotações" convida a comparar
quem escreveu mais, e o princípio do projeto é **incentivo por presença, não por comparação**.
Se você quiser o número, é uma decisão sua — diga, porque hoje existe um teste que **proíbe**
qualquer contador na tela.

---

## 6.3. Buscar por texto no clube inteiro (MVP 2, Tarefa 29)

**O caminho:** home → **"Buscar no acervo"** (`/busca`). O link só aparece quando a estante
tem livro.

A diferença em relação ao §6.2: o acervo é **de um livro** e recorta o que já está na tela; a
busca é **do clube inteiro** e pergunta ao servidor. Cada resultado diz **de qual livro** é —
sem isso, "página 112" seria ambíguo.

| Provoque | Deve acontecer |
|---|---|
| Abrir a tela e não digitar nada | um convite para escrever, **sem** cobrança — e **nenhuma requisição** ao servidor |
| Digitar **uma** letra | nada é pedido (uma letra casaria quase tudo) |
| Digitar duas letras e esperar | duas requisições (anotações e grifos), **uma vez** — não uma por tecla |
| Digitar rápido, apagar, digitar de novo | ele **espera você parar**; não dispara a cada tecla |
| Buscar uma palavra do **comentário de um grifo** | acha |
| Buscar uma palavra do **trecho grifado** | acha ⚠️ — e isso é a **pergunta 2** do MVP 2: a decisão fechada não mencionava o trecho, e eu decidi casar os dois, porque uma busca de grifos que não acha a frase grifada não serve para nada |
| Buscar `CORAÇÃO` tendo escrito `coração` | acha (maiúscula é ignorada) |
| Buscar `coracao` tendo escrito `coração` | ⚠️ **não acha** — ver a ressalva do §1 e a pergunta 1 |
| Buscar `%` ou `_` | são tratados como letras, não como curinga |
| Buscar algo que não existe | frase própria, **diferente** da do estado inicial |
| Buscar e tocar num resultado | abre a tela certa, no **livro daquele resultado** |

⚠️ **O que a busca não te conta:** ela traz no máximo **500 anotações e 500 grifos** por
consulta, e **não avisa** se cortou. Para o clube de duas pessoas isso são cerca de **oito
meses** de registro completo — e o corte só morde se a palavra casar todos eles. Está
registrado como dívida com esse número; o conserto honesto é o servidor dizer que truncou, e
isso é mudança de contrato da API, fatia própria.

---

## 6.4. Marcar "li hoje", e ver quem já leu (MVP 3, Tarefas 30–32c)

Abra `/books/:id` (a tela do livro, pela estante da home).

1. Acima do plano, no dia de hoje, há **"li hoje"** em primeira pessoa. Toque.
2. O botão passa a oferecer a desfeita, e na **linha do dia**, no plano, aparece uma **marca
   de leitura** — um **glifo** (✓), ao lado das **iniciais** de quem escreveu.
3. Peça para a outra pessoa marcar também, no aparelho dela. **Recarregue.** Agora há **duas**
   marcas naquele dia.
4. Toque de novo para desmarcar. A marca some. (Desmarcar é **apagar o registro**, não
   arquivá-lo — é a exceção documentada do projeto: `ReadingLog` é log imutável, e desmarcar é
   dizer "isto nunca aconteceu".)

⚠️ **O que conferir de propósito, porque é a decisão de produto do MVP 3:** em nenhum lugar
desta tela aparece **número**. Nem "2 de 30", nem percentual, nem barra que enche. Progresso é
**presença** — uma marca por leitor, por dia. Se você vir um número em qualquer canto, é bug
(a rota nem devolve contagem, então seria preciso alguém tê-la inventado na tela).

⚠️ **A marca de LEITURA é distinguível da de ESCRITA sem depender de cor**: quem **leu** vira
um **glifo**; quem **escreveu** vira a **inicial** (letra). Se as duas te parecerem a mesma
coisa no celular, diga — foi desenhado para não parecer.

⚠️ **Só o dia de hoje se marca.** Ver a ressalva do §1.

---

## 6.5. O feed de atividade na home (MVP 3, Tarefas 33–35)

Volte para `/`. Abaixo da estante há **a atividade do clube**: quem, o quê, em que livro, e
quando — uma **frase** por linha, em ordem cronológica.

1. Marque uma leitura, escreva uma anotação e registre um grifo.
2. Recarregue a home. As três aparecem, **a mais recente em cima**.
3. Toque numa linha: ela leva **ao lugar certo** — a anotação abre a anotação, o grifo abre o
   grifo, a leitura abre a tela do livro.

⚠️ **O que conferir, e é o mesmo princípio do §6.4:** o feed é **frase**, não tabela. Não há
coluna de pessoa (que convidaria o olho a varrer e contar), não há agrupamento por pessoa
(que **é** o placar), e não há "carregar mais" (que convidaria a rolar procurando quem fez
mais). Se você sentir vontade de comparar quem fez mais, diga — o desenho falhou.

⚠️ **Números NA LINHA são esperados e legítimos** — "há 2 horas", "há 3 dias", ou um livro
chamado *1984*. O que não pode existir é número **que o app inventou**: "3 atividades",
"+2", "12 dias lidos". Há uma guarda automática para isso, e ela sabe a diferença.

---

## 6.6. Preferências e ativar as notificações no aparelho (MVP 3, Tarefas 36–36b)

No **cabeçalho**, ao lado do idioma e do tema, há um atalho para **`/preferencias`**.

1. **Horário do lembrete** — um campo de hora. Mude e saia do campo: salva sozinho, sem botão
   "Salvar". ⚠️ Se você **limpar** o campo, nada é enviado (campo vazio não é erro, é gesto).
2. **"Quero o lembrete da leitura de hoje"** — liga e desliga, salva sozinho.
3. **"Quero saber quando alguém do clube lê ou escreve"** — idem.
4. Se uma gravação falhar (derrube a API no terminal 1 e tente), o controle **volta ao valor
   anterior** e aparece um recado. ⚠️ Confira isso: um interruptor que fica ligado na tela e
   desligado no banco é a pior forma desta tela errar — você acharia que vai ser lembrado, e
   não seria.

### Ativar no aparelho — e as quatro recusas

Mais abaixo há **"ativar neste aparelho"**. Ele só aparece se o servidor tiver chave VAPID
configurada (veja abaixo); sem chave, a seção diz que a função está indisponível — **não é
erro**, é o estado normal de quem não configurou.

⚠️ **Onde isso FUNCIONA, e a ressalva é grande:** push exige **contexto seguro**. Pelo
`http://192.168.0.83:5173` da rede local **não vai funcionar** — a tela vai dizer, com todas
as letras, que o endereço não é seguro. Os caminhos que funcionam:

- **`http://localhost:5173` na sua própria máquina** — é o caminho mais rápido para ver o push
  aparecer;
- **um túnel HTTPS** para o celular, se você quiser testar no aparelho de verdade.

⚠️ **E no iPhone há uma segunda condição:** push em PWA só funciona com o app **adicionado à
tela de início**. Fora dela o Safari expõe a API e nunca concede a permissão — a tela tem uma
frase própria para esse caso, diferente das outras três.

As quatro recusas possíveis, cada uma com sua frase: **endereço não seguro** · **permissão
negada** (você recusou antes, e aí tem de reverter nas configurações do navegador) ·
**navegador sem suporte** · **iPhone fora da tela de início**. Se você vir uma frase genérica
de "não deu", é bug.

### Configurar a chave VAPID (uma vez só)

Sem isto, nada de push funciona — e **o projeto roda normalmente assim**, por escolha.

```bash
# gera um par novo. A saída tem uma chave PÚBLICA e uma PRIVADA.
npx web-push generate-vapid-keys
```

Cole as duas em `packages/backend/.env`:

```
VAPID_PUBLIC_KEY=<a pública>
VAPID_PRIVATE_KEY=<a privada>
VAPID_SUBJECT="mailto:voce@exemplo.com"
```

⚠️ **A privada nunca sai do backend.** Não a copie para `packages/app/.env`, não a mande por
mensagem, não a cole em lugar nenhum — o front recebe a **pública** pela própria API, sem
precisar de variável. O `.env.example` tem as duas linhas **vazias** de propósito, e há um
teste automático que impede a privada de entrar no pacote que vai para o celular.

Reinicie a API depois de editar o `.env`.

---

## 6.7. O lembrete diário — rodar o dispatcher à mão (MVP 3, Tarefa 37)

O lembrete **não** roda sozinho: não existe cron dentro do servidor, de propósito. Quem chama
é um cron externo — ou você, à mão:

```bash
pnpm --filter @clube/backend notifications:dispatch
```

Ele imprime **uma linha de JSON** e sai com código 0, inclusive quando não há ninguém a
lembrar. As respostas possíveis:

| `reason` | O que significa |
|---|---|
| `vapid-not-configured` | não há chave no `.env` — ele nem abre o banco |
| `ok` | rodou; veja os quatro contadores |

Os contadores: `considered` (quantas pessoas foram avaliadas), `sent` (quantas foram
lembradas), `skipped` (quantas não foram, por **qualquer** motivo) e `disabled` (quantos
**aparelhos** o envio descobriu mortos e desligou). ⚠️ `sent + skipped` sempre fecha com
`considered`; o `disabled` conta aparelho, não pessoa.

**Para ver um lembrete chegar:**

1. Ative as notificações no aparelho (§6.6).
2. Em `/preferencias`, ponha o **horário do lembrete** alguns minutos **no passado** (a janela
   padrão é de **10 minutos** depois do horário).
3. Garanta que **existe plano para hoje** no livro do clube — sem trecho do dia, não há do que
   lembrar, e a pessoa conta como `skipped`.
4. ⚠️ Garanta que você **não marcou "li hoje"** — quem já leu **não** recebe lembrete. Essa é
   a regra anti-culpa, e ela é o ponto da feature.
5. Rode o comando.

⚠️ **Rodar duas vezes não manda duas vezes.** Há uma trava no banco (um registro por pessoa,
por tipo, por dia no fuso dela), e é ela que deixa o cron rodar de cinco em cinco minutos sem
incomodar ninguém. Se você quiser receber o lembrete **de novo no mesmo dia**, apague a linha —
o comando está no §8.

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
-- ⚠️ O MVP 3 acrescentou QUATRO tabelas, e duas delas entram AQUI EM CIMA.
-- O ActivityEvent e o ReadingLog apontam para Club, Book, User E
-- ReadingPlanItem, os quatro com ON DELETE RESTRICT (declarado no plano,
-- herdado nos demais — relação obrigatória tem RESTRICT por padrão no Prisma).
-- Se eles ficarem para depois, o DELETE do ReadingPlanItem falha e a limpeza
-- inteira aborta no meio da transação.
DELETE FROM "ActivityEvent";
DELETE FROM "ReadingLog";
-- O Highlight vem em seguida entre os de conteúdo: as três FKs dele (Club, Book,
-- User) são ON DELETE RESTRICT, então o Book não sai antes dos grifos dele.
DELETE FROM "Highlight";
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
membros, convites, livros, planos, anotações, grifos, **marcas de leitura e atividade**.

### E as outras duas tabelas do MVP 3 — quando apagar

`PushSubscription` e `NotificationDelivery` **não entram no bloco acima de propósito**: as
duas apontam **só para `User`**, que aquele bloco não toca, então elas não bloqueiam nada. Mas
elas guardam duas coisas que você vai querer zerar em situações específicas:

```bash
docker exec -i clube_db psql -U clube -d clube <<'SQL'
-- "Quero ativar as notificações neste aparelho DE NOVO, do zero."
-- Apaga as inscrições. Depois disso, a tela de preferências volta a oferecer
-- "ativar neste aparelho" — e o navegador pode ter de pedir permissão outra vez.
DELETE FROM "PushSubscription";

-- "Já recebi o lembrete hoje e quero recebê-lo de novo."
-- Esta tabela É a idempotência: enquanto a linha do dia existir, o dispatcher
-- conta a pessoa como `skipped` e não manda nada. Apagar a linha devolve o
-- lembrete daquele dia.
DELETE FROM "NotificationDelivery";
SQL
```

⚠️ **Se você quiser apagar um USUÁRIO** (criado por aceite de convite, por exemplo), as duas
tabelas acima passam a bloquear: as FKs delas para `User` são `RESTRICT`. Apague-as **antes**
do usuário, junto com o `ActivityEvent` e o `ReadingLog` dele.

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
