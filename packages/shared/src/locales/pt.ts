/**
 * Catálogo **pt** — o idioma padrão do clube.
 *
 * Chaves **semânticas em inglês**, conteúdo em português (`CLAUDE.md`).
 * Nenhum texto solto nas telas: tudo passa por `t('chave')`.
 *
 * O bloco `errors` não é decoração: `apiErrorKey` só devolve CHAVE, porque a
 * API responde com a mensagem do Zod **em inglês** e `error.message` só existe
 * na classe 400 (`docs/CONVENCOES-CODIGO.md` §6.2). Toda chave que
 * `API_ERROR_KEYS` declara tem de existir aqui — há teste.
 */
export const pt = {
  app: {
    name: 'Clube do Livro',
  },
  nav: {
    signOut: 'Sair',
    // O rótulo acessível da entrada de preferências no cabeçalho (Tarefa 36b,
    // regra 3): o ícone do `lucide-react` é `aria-hidden`, e ícone sozinho não
    // tem nome para quem ouve a tela.
    settings: 'Preferências',
  },
  theme: {
    label: 'Tema',
    light: 'Claro',
    dark: 'Escuro',
    system: 'Do sistema',
  },
  pages: {
    login: {
      title: 'Entrar',
      email: 'E-mail',
      password: 'Senha',
      submit: 'Entrar',
      /*
        O 401 do `/auth/login` é "e-mail ou senha não conferem", e NÃO é o
        `errors.unauthorized` genérico ("Sua sessão terminou. Entre outra
        vez."): dizer a alguém que está justamente tentando entrar que a sessão
        dela terminou é uma mensagem que não faz sentido nenhum na tela.

        Uma frase só para os dois casos, de propósito: distinguir "essa conta
        não existe" de "a senha está errada" entrega ao mundo quais e-mails têm
        conta aqui — e o backend já iguala o TEMPO de resposta dos dois
        (`docs/CONVENCOES-CODIGO.md` §6.4) para não vazar pelo cronômetro o que
        a mensagem não vaza.
      */
      invalidCredentials: 'E-mail ou senha não conferem.',
    },
    acceptInvite: {
      title: 'Aceitar convite',
      /*
        A tela é CEGA de propósito (decisão A da Tarefa 15): não existe
        `GET /invites/:code` público, então ela não sabe de qual clube é o
        convite nem se ele vale. Por isso a frase não promete nome de clube —
        quem convidou já disse isso no WhatsApp (ADR 0003).
      */
      description: 'Escolha uma senha para entrar no clube.',
      name: 'Nome',
      nameHint: 'É como o clube vai te ver. Pode ficar em branco.',
      email: 'E-mail',
      password: 'Senha',
      passwordHint: 'Mínimo de 8 caracteres.',
      submit: 'Entrar no clube',
      /*
        404 e 410 têm frases DIFERENTES (regra 15): são os dois erros que a
        pessoa mais vai ver, e chamar de "não encontrado" um convite que
        venceu manda ela procurar um link errado que existe.

        ⚠️ E O 404 É AMBÍGUO NO BACKEND — medido na rodada de correção. Ele sai
        de `InviteNotFoundError` E de `ClubNotFoundError`, e o corpo não carrega
        discriminador (§6.2). Então a frase NÃO pode mandar conferir o link com
        convicção: quando o clube é que foi apagado, o link está certo e a
        pessoa ficaria conferindo caractere por caractere de um código correto.
      */
      inviteNotFound:
        'Não conseguimos abrir este convite. Confira o link com quem te convidou — ou o clube pode não existir mais.',
      /*
        ⚠️ O 410 COBRE OS DOIS CASOS DE PROPÓSITO, e desde a rodada de correção
        ele é para onde o backend manda `InviteAlreadyUsedError` também (era
        409). "Venceu" e "já foi usado" são a mesma frase para quem lê — "não
        vale mais, peça outro" —, e é a única coisa que ela pode fazer nos dois
        casos.
      */
      inviteExpired:
        'Este convite não vale mais: ele venceu ou já foi usado. Peça um link novo a quem te convidou.',
      /*
        ⚠️ E COM O 410 CARREGANDO O CONVITE JÁ USADO, O 409 DESTA ROTA PASSOU A
        SIGNIFICAR UMA COISA SÓ: `DuplicateMembershipError`, ou seja, este
        e-mail já é membro ativo deste clube. Aí a frase pode ser precisa, e
        marcar o campo de e-mail (regra 16) fica CORRETO — antes o 409 também
        era "o convite já foi usado", e nesse caso o e-mail estava certo e
        recebia `aria-invalid="true"` à toa.
      */
      alreadyInClub:
        'Você já está neste clube. Entre com o seu e-mail e a sua senha.',
    },
    /*
      A HOME (Tarefa 16), e cada frase daqui passou pela varredura da regra 16.

      ⚠️ **NENHUMA FRASE DESTE BLOCO PODE COBRAR.** O princípio anti-culpa do
      `docs/plano-clube-do-livro.md` §1 é requisito, não intenção: "o sistema
      não pune ausência de registro". Então nada de "você está atrasado",
      "faltam 3 dias", "pendente" ou "dívida" — e nada de `você não`, que é a
      forma como a cobrança entra escrita com boas intenções ("Você não escreveu
      hoje"). O acusador é a varredura de `home.test.tsx`, que lê TEXTO e
      ATRIBUTOS e reprova a lista de palavras inteira.

      É por isso que o estado vazio de "nenhum clube" diz *"Seu clube aparece
      aqui"* em vez de *"Você não está em nenhum clube"* — a segunda é a frase
      natural em português, e é exatamente a que a regra proíbe.
    */
    home: {
      /*
        ⚠️ **A CORRENTE DE LEITURA — o "foguinho" (ADR 0010).**

        Estas cinco chaves são as ÚNICAS do projeto isentas da varredura
        anti-culpa, e a isenção é nominal e **pinada por teste**: ampliá-la
        fica vermelho. O ADR registra a reversão da decisão 1 do MVP 3, a
        objeção levantada antes de qualquer linha, e o custo que o dono
        aceitou.

        ⚠️ O `atRisk` é, por construção, uma frase de PERDA — é o mecanismo
        do Duolingo, e é o que o dono escolheu. Ele só aparece para quem TEM
        corrente e ainda não leu hoje: para quem está em zero não há o que
        perder, e mostrá-lo ali seria cobrar quem ainda não começou.
      */
      streak: {
        days_one: '{{count}} dia seguido',
        days_other: '{{count}} dias seguidos',
        none: 'Comece a sua sequência hoje',
        atRisk: 'Você vai perder a sua sequência!',
        mine: 'A sua sequência',
      },
      title: 'Início',
      /** Rótulo (só para leitor de tela) do seletor de clube no cabeçalho. */
      clubLabel: 'Clube',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      today: {
        heading: 'A leitura de hoje',
        /*
          O atalho de UM TOQUE do princípio "atrito mínimo" (§1): abrir o app e
          estar escrevendo o trecho de hoje custa dois toques.
        */
        write: 'Escrever a anotação de hoje',
      },
      shelf: {
        heading: 'O que o clube está lendo',
        /* Nomeia a lista para o leitor de tela ("lista, 2 itens"). */
        label: 'Livros do clube',
      },
      noClubs: {
        title: 'Seu clube aparece aqui',
        /*
          A mensagem tem de dizer O QUE FAZER sem prometer botão que não
          existe: criar clube é ação de plataforma (super-admin, Tarefa 42), e
          entrar num clube é pelo link de convite (ADR 0003).
        */
        description:
          'Quem cria um clube é quem administra o sistema. Se alguém já te convidou, abra o link do convite que você recebeu.',
      },
      noBooks: {
        title: 'A estante está vazia',
        description:
          'O livro do mês é cadastrado por um administrador do clube, já com o plano de leitura de cada dia.',
      },
      /*
        ⚠️ **O FEED DE ATIVIDADE (Tarefa 35) — INCENTIVO, NUNCA PLACAR.**

        `docs/ACEITE-MVP.md`, MVP 3, pergunta 1 (respondida pelo dono):
        atividade é **presença, não placar**. Daí a forma destas quatro frases,
        e ela é decisão (decisão A da spec): a linha é uma **frase**, não uma
        tabela com coluna de pessoa — uma coluna convida o olho a varrê-la e
        contar quem fez mais, e a frase obriga a ler uma coisa de cada vez.

        ⚠️ **AS QUATRO SÃO DISTINGUÍVEIS, e isso é teste** (lição nº 16 do MVP
        2: duas coisas que falam a mesma frase são indistinguíveis pela
        varredura). O acusador é o `catalogs.test.ts`.

        ⚠️ **E NENHUMA DELAS CONTA NADA.** Não há "e mais N", não há "3
        atividades de Maria", não há agrupamento por pessoa — a `COUNTER_SHAPE`
        proíbe a forma, e o contrato da rota (que não devolve contagem nenhuma)
        torna o número irrenderizável.

        ⚠️ ~~O livro entra e o TEMA do dia não.~~ **CAIU NA TAREFA 38e**, por
        decisão do dono ("quero o tema do dia na linha"). A medição 2 da Tarefa
        35 continua correta sobre o que ela mediu — o EVENTO não carrega o
        título —, e a saída não foi guardá-lo lá: o `listActivity` resolve o
        título na LEITURA, contra o plano atual, e o devolve no
        `planItemTitle`. Por isso são **seis** frases, e não quatro: os dois
        tipos que têm dia (`PLAN_NOTE` e `READ`) ganham uma irmã com o tema, e
        os dois que não têm dia (avulsa e grifo) não ganham nada.

        ⚠️ **O TEMA É CONTEÚDO DO USUÁRIO — quem o digita é o admin do clube.**
        Ele entra pelo `{{theme}}` e nunca mora aqui: as varreduras anti-culpa e
        a `COUNTER_SHAPE` deste catálogo medem as NOSSAS frases, e um "Cap. 3"
        digitado por alguém não é uma delas. É também por isso que a frase com
        tema não pode ser montada por concatenação: o buraco é o que separa o
        nosso texto do dele.
      */
      feed: {
        heading: 'O que aconteceu por aqui',
        /* Nomeia a lista para o leitor de tela ("lista, 5 itens"). */
        label: 'Atividade do clube',
        /* Frase PRÓPRIA: enquanto ela está no ar, a estante já está na tela, e
           um segundo "Carregando…" não diria de quê. */
        loading: 'Carregando a atividade…',
        /* ⚠️ Constatação, nunca cobrança: "ninguém leu ainda" seria o §1 do
           plano violado pelo estado vazio. E ela é DIFERENTE da de falha. */
        empty: 'Ainda não há atividade por aqui.',
        failed: 'Não foi possível carregar a atividade agora.',
        /* As quatro frases, uma por tipo de `ActivityEvent` — usadas quando não
           há tema do dia (os dois `null` da decisão C da Tarefa 38e: o evento
           sem dia, e o dia que o admin tirou do plano). */
        planNote: '{{name}} escreveu a anotação do dia em {{book}}',
        freeNote: '{{name}} escreveu uma anotação avulsa em {{book}}',
        highlight: '{{name}} grifou um trecho de {{book}}',
        read: '{{name}} leu um dia de {{book}}',
        /* ⚠️ As DUAS com o tema do dia (Tarefa 38e) — só os tipos que TÊM dia.
           "Ela escreveu sobre o capítulo 4" é o exemplo do §1 do plano, escrito
           lá desde o começo, e é o que faz a atividade do outro puxar. */
        planNoteOnTheme: '{{name}} escreveu sobre {{theme}}, em {{book}}',
        readOnTheme: '{{name}} leu {{theme}}, de {{book}}',
      },
      /*
        REGRA 17: o membership sumiu entre o `/me` e a listagem da estante
        (404). Frase própria porque o `errors.notFound` genérico ("Não
        encontramos o que você procurava") não diz o quê — e aqui o "o quê" é o
        clube inteiro.
      */
      clubUnavailable: 'Não foi possível abrir este clube agora.',
    },
    /*
      A TELA DO LIVRO (Tarefa 17) — o plano do mês, dia por dia.

      ⚠️ **É A TELA ONDE A COBRANÇA NASCERIA NATURALMENTE**, e por isso cada
      frase daqui passou pela varredura do `__tests__/anti-guilt.test.ts`: são
      trinta dias em lista, a maioria deles sem anotação, e a frase natural para
      um deles é justamente a que o `docs/plano-clube-do-livro.md` §1 proíbe.
      Nada de "você deixou dias para trás", nada de "faltam", nada de contagem.

      O estado vazio fala do LIVRO, não da pessoa ("Este livro ainda não tem
      plano de leitura"), e diz de quem é a ação — o admin do clube cadastra o
      plano.
    */
    book: {
      /** O nome da TELA. Vale enquanto o título do livro não chegou. */
      title: 'Livro',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      /*
        REGRA 9: o 404 desta tela é livro de outro clube, livro arquivado ou id
        inexistente — para quem não é membro, os três são a mesma coisa
        (`CLAUDE.md`: sem membership, 404 e não 403). Frase própria porque o
        `errors.notFound` genérico não diz o quê, e aqui o "o quê" é o livro do
        mês.
      */
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      /*
        ⚠️ **AS DUAS ABAS MORRERAM NA TAREFA 28, e o que fica é UM link**
        (decisão B). A chave `tabs` tinha `notes` ("Anotações") e `highlights`
        ("Grifos"), e as duas eram INCONSISTENTES entre si: a primeira listava
        na própria tela do livro e a segunda navegava. Agora a tela do livro é
        o que ela é — o PLANO —, e o acervo (anotações **e** grifos) é um lugar
        só, a um link de distância.

        A frase fala do que há do outro lado, e não de "aba": quem toca sai
        desta tela.
      */
      acervoLink: 'Ver o acervo do livro',
      /*
        ⚠️ **O TOQUE "LI HOJE" (Tarefa 32b) — em PRIMEIRA PESSOA, e o rótulo
        diz o ESTADO ATUAL junto com a ação.**

        Ele é um botão de dois estados e não um `checkbox` (decisão D): o
        estado é do servidor e a ação é assíncrona, e um `checkbox` prometeria
        alternância local imediata. Como o estado vive no RÓTULO, não há
        `aria-pressed` — quem ouve a tela ouve a frase inteira, e a varredura
        que exige zero `[aria-pressed]` nesta tela (o resto das abas mortas da
        Tarefa 28) continua valendo.

        ⚠️ Ele só existe quando HÁ um dia de hoje no plano (decisão E): um
        livro do mês passado não tem "hoje", e um botão desabilitado ali seria
        cobrança silenciosa ("você não pode mais").

        ⚠️ E o recado de falha **não** cobra ninguém: ele fala do registro que
        não foi gravado, nunca da pessoa que não leu.
      */
      read: {
        mark: 'Marcar que li hoje',
        unmark: 'Li hoje — tirar a marca',
        failed: 'Não deu para registrar sua leitura agora.',
      },
      plan: {
        /* Nomeia a lista para o leitor de tela ("lista, 30 itens"). */
        label: 'Dias do plano de leitura',
        /*
          ⚠️ **A POSIÇÃO NO PLANO (Tarefa 40, §A.9), E ELA É A ÚNICA FRASE DO
          APP ISENTA DA VARREDURA DE PLACAR.**

          "Dia 11 de 30" tem a forma que a `COUNTER_SHAPE` proíbe
          (`\d+ de \d+`), e passa por **isenção nominal**: a chave está em
          `COUNTER_EXEMPT_KEYS`
          (`packages/shared/src/locales/__tests__/guilt-terms.ts`), pinada por
          igualdade exata, e a varredura de DOM subtrai esta frase — literal a
          literal, com buraco só de dígito — antes de medir o formato.

          ⚠️ **O QUE JUSTIFICA A ISENÇÃO:** isto não é placar. Placar conta o
          que foi feito contra o que havia para fazer ("3 de 30 dias lidos") e
          compara; isto diz ONDE a leitura de hoje está no mês, e o número não
          muda com o que ninguém fez. Decisão do dono, em `docs/BACKLOG.md`
          ("decisões fechadas do MVP 3.5").

          ⚠️ **E ELA MORA AQUI porque o PLANO é o dono do assunto** (decisão C
          da Tarefa 40): o Início e a tela do dia a LEEM deste namespace, sem
          duplicar. Duas frases dizendo a mesma posição divergiriam na primeira
          correção — o defeito que o `GUILT_TERMS` viveu até a Tarefa 19.
        */
        dayOfPlan: 'Dia {{number}} de {{total}}',
        /* A ÚNICA marca da lista (decisão C): hoje. Nada mais é destacado. */
        today: 'Hoje',
        /*
          ⚠️ **O FALLBACK, e ele deixou de ser o caso comum.** O `writers` do
          `GET /books/:bookId` devolve só `userId`; desde a Tarefa 26a existe
          `GET /clubs/:clubId/members` para resolver o nome, e a Tarefa 27 usa
          essa rota nas DUAS metades desta tela — o acervo e esta sobreposição.

          Esta frase sobrou para o estado real de quem **não conhece as
          pessoas**: o `GET /members` que falhou, o `/me` que ainda não chegou,
          ou um autor que não está na lista. Ela não cobra ninguém e não diz
          "alguém que você não conhece".
        */
        writer: 'Alguém do clube escreveu neste dia',
        /*
          ⚠️ **INTERPOLADA, e a razão é a metade FALADA do nome.** Trocar este
          `aria-label` pelo nome cru ("Maria") daria a inicial certa e perderia
          o "escreveu neste dia" — o que dá sentido ao avatar sozinho para quem
          ouve a tela. Com a interpolação, as duas coisas convivem, e a mesma
          pessoa deixa de ser "Maria" no acervo e "alguém" no plano, dois dedos
          acima.
        */
        writerNamed: '{{name}} escreveu neste dia',
        /*
          ⚠️ **A SOBREPOSIÇÃO DE LEITURA (Tarefa 32b) — o par irmão do
          `writer`/`writerNamed`, e ele NÃO pode dizer a mesma frase.**

          As duas marcas convivem na MESMA linha do plano, e a lição nº 16 do
          MVP 2 ("duas coisas que falam a mesma frase") já mentiu numa tela
          deste projeto: o avatar de quem escreveu e a marca de quem leu
          precisam ser distinguíveis por quem OUVE a tela, e não só por quem a
          vê. Daí "leu" contra "escreveu", e um teste que prova que os dois
          textos acessíveis são diferentes.

          Nada de contagem: um leitor a mais é uma marca a mais, nunca um
          número (`docs/ACEITE-MVP.md`, MVP 3, pergunta 1 — progresso é
          presença, não placar).
        */
        reader: 'Alguém do clube leu este dia',
        readerNamed: '{{name}} leu este dia',
        empty: {
          title: 'Este livro ainda não tem plano de leitura.',
          description:
            'Um administrador do clube cadastra o plano, com o tema de cada dia.',
        },
      },
      /*
        ⚠️ **AS MARCAS DE PRESENÇA (Tarefa 40, §A.9) — UM GLIFO POR LEITOR,
        NUNCA UM NÚMERO.**

        `docs/ACEITE-MVP.md`, MVP 3, pergunta 1: progresso é PRESENÇA, não
        placar. Um leitor a mais é uma marca a mais — e é por isso que a legenda
        explica a FORMA do glifo (vazado × cheio) em vez de contar quantos são.

        ⚠️ **A COR NUNCA É O ÚNICO PORTADOR**, a mesma regra do `PersonAvatar` e
        das cinco canetas: o vazado e o cheio se distinguem por forma, e as três
        frases abaixo são o que o leitor de tela fala. Quem renderiza é a Tarefa
        44.
      */
      marks: {
        heading: 'As marcas',
        read: 'Leu neste dia',
        wrote: 'Leu e escreveu',
        hint: 'Cheio = escreveu',
      },
      /*
        ⚠️ **"NESTE LIVRO" — DOIS RÓTULOS, E NENHUM DELES É O NÚMERO.**

        O §A.9 chamou as duas chaves de `clubNotesCount` e `highlightsCount`, e
        o `Count` do nome é o que elas NÃO são: o valor é dado, vem da API e
        entra ao lado do rótulo. A frase diz de QUE se está falando —
        "Anotações do clube", "Grifos" —, e um rótulo que trouxesse o número
        dentro de si ("{{count}} anotações") seria a mesma coisa que o catálogo
        prometendo o que a tela mostra.

        ⚠️ **E NENHUMA DAS DUAS É PLACAR**: contagem de acervo é o tamanho do
        que o clube escreveu, não a medida do que ninguém escreveu — não tem
        total contra o qual comparar, que é o que faz um placar.

        ⚠️⚠️ **AS TRÊS GANHARAM CONSUMIDOR NA TAREFA 44b (2026-09-23), e a
        espera durou quatro fatias.** Elas nasceram na Tarefa 40 e a Tarefa 44 —
        que deveria consumi-las — **parou** na regra 9: `GET /books/:bookId` não
        devolvia contagem nenhuma, e as duas listagens que teriam os dados
        devolvem array cortado em `FIND_ROW_LIMIT = 500`. O dono abriu exceção
        ao fora-de-escopo do MVP 3.5 e autorizou backend para isto, numa fatia
        própria (`docs/tasks/44b-neste-livro-e-o-ultimo-grifo.md`): hoje a
        resposta do livro traz `inventory: { notes, highlights }`, contado com
        `count()` no banco, e quem o desenha é a margem de `book.tsx`.

        ⚠️ **O NÚMERO É EXATO, e a espera foi por isso.** O atalho que estava à
        mão — somar os `writers[].userIds` que a rota já devolvia — é exato para
        a anotação do DIA (o índice único cuida disso) e **cegaria a avulsa**,
        porque índice único não compara nulo com nulo. Um número plausível e
        errado faz a pessoa seguir; um `undefined` a faz parar. A medição está na
        nota nº 2 de `docs/tasks/44-o-livro.md`.

        ⚠️ **"Último grifo" NASCEU AQUI, na 44b** — a regra 9 da Tarefa 44
        proibia chave nova, e ela valia **lá**. O trecho, a página e o nome
        vêm de dado; só o rótulo é catálogo. As outras duas frases do bloco já
        existiam: o endereço do acervo é `pages.book.acervoLink`, logo acima,
        e a página do grifo é `pages.acervo.item.page` — nenhuma das duas
        precisou de irmã nova (medido na 44b; a spec previa duas chaves novas e
        só uma era).
      */
      inBook: {
        heading: 'Neste livro',
        notes: 'Anotações do clube',
        highlights: 'Grifos',
        lastHighlight: 'Último grifo',
      },
    },
    /*
      O ACERVO DO LIVRO (Tarefa 28) — anotações **e** grifos num lugar só.

      ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** (`docs/adr/0002-*.md`).
      Nenhuma frase daqui pode sugerir que exista anotação ou grifo que o clube
      não vê: nada de "só você", "privada", "visível para". As seis dimensões
      olham o MESMO acervo — pessoa, tipo, leitura, cor, palavra e faixa de
      página são formas de OLHAR.

      ⚠️ **E O GRIFO NÃO É UM TIPO DE ANOTAÇÃO** (ADR 0004): ele é entidade
      própria, e o vocabulário tem de deixar isso claro sem o leitor adivinhar.
      Daí `kind.highlight` ao lado de `kind.plan`/`kind.free`, e não um terceiro
      "tipo de anotação".

      ⚠️ **`kind` TEM UM DONO SÓ, e ele serve o chip E a linha.** As três
      palavras aparecem duas vezes na tela (o chip do filtro por tipo e o rótulo
      de cada linha), e duas chaves seriam duas verdades sobre a mesma coisa —
      a lição nº 3 do MVP 1 aplicada a três palavras.

      ⚠️ **NENHUM `all` REPETE O TEXTO DE OUTRO GRUPO, e é medido pela própria
      suíte:** com três grupos de chips na mesma tela, dois "Tudo" fariam
      `getByRole('button', { name: 'Tudo' })` achar dois botões — e, antes disso,
      fariam a pessoa ver dois chips com o mesmo nome e comportamento diferente.
      O `all` de cada dimensão fala da dimensão dele.
    */
    acervo: {
      /** O nome da TELA. O título do livro entra como contexto, abaixo. */
      title: 'Acervo',
      loading: 'Carregando o acervo…',
      retry: 'Tentar de novo',
      /* Livro de outro clube, livro arquivado, ou id inexistente: para quem
         não é membro os três são a mesma resposta (`CLAUDE.md`: 404). */
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      unavailable: 'Não foi possível carregar o acervo agora.',
      /* Nomeia a lista para o leitor de tela ("lista, 12 itens"). */
      label: 'Anotações e grifos deste livro',
      /* Criar é EXPLÍCITO, e são DOIS destinos: o grifo não é uma anotação. */
      newNote: 'Nova anotação',
      newHighlight: 'Novo grifo',
      kind: {
        plan: 'Do dia',
        free: 'Avulsa',
        highlight: 'Grifo',
      },
      filters: {
        person: {
          /* Nomeia o grupo de chips para quem navega por leitor de tela. */
          label: 'De quem é o acervo',
          all: 'De todo mundo',
          mine: 'Minhas',
          /*
            O complemento de "Minhas" — o modo DEGRADADO (o mesmo da Tarefa 27):
            é o que a tela mostra quando não sabe as pessoas, ou não sabe qual
            delas sou eu.
          */
          others: 'De outras pessoas',
          /* É NAVEGAÇÃO, não permissão: diz de quem é o acervo que você está
             olhando, nunca que essa pessoa escondeu algo. */
          person: 'De {{name}}',
          /* `User.name` é anulável e o backend não inventa fallback (decisão C
             da Tarefa 26a): quem escolhe a palavra é a tela. */
          unnamed: 'De alguém sem nome',
        },
        type: {
          label: 'O que mostrar',
          all: 'Tudo',
        },
        color: {
          /*
            ⚠️ O grupo de cor só EXISTE quando o tipo pode incluir grifo
            (decisão E): um chip de cor com o tipo em "Avulsa" é um filtro que
            garante zero resultados, e mostrar um controle que só pode esvaziar
            a lista é pior que esconder.
          */
          label: 'Cor do grifo',
          all: 'Todas as cores',
        },
        reading: {
          /*
            ⚠️ É um `<select>` NATIVO, e o rótulo é VISÍVEL (decisão D): o plano
            real tem trinta dias, e trinta chips num celular é um filtro que
            ninguém usa. Um `aria-label` solto num `<select>` sem rótulo deixa
            quem vê a tela sem saber o que aquela caixa recorta.
          */
          label: 'Leitura do dia',
          all: 'Todas as leituras',
        },
        /*
          A QUINTA DIMENSÃO — O TEXTO (Tarefa 38g).

          ⚠️ **O RÓTULO É VISÍVEL, pelo mesmo motivo do `<select>` de leitura**:
          um `aria-label` solto daria nome a quem OUVE a tela e deixaria quem VÊ
          sem saber o que aquele campo recorta. E ele diz "neste livro" porque
          esta tela é o acervo de UM livro — a `/busca` do clube, que atravessa
          todos, tem rótulo próprio em `pages.busca.field`.

          ⚠️ **E A FRASE NÃO PROMETE MAIS DO QUE O RECORTE FAZ** (decisão B): a
          palavra é procurada no que foi escrito — o texto da anotação, o trecho
          do grifo e o comentário dele —, nunca no título da anotação.
        */
        text: {
          label: 'Palavra neste livro',
          placeholder: 'Uma palavra do que vocês escreveram',
        },
        /*
          A SEXTA DIMENSÃO — A FAIXA DE PÁGINA (Tarefa 38h).

          ⚠️ **NÃO HÁ RÓTULO DE GRUPO, e a ausência é decisão.** Os dois rótulos
          se bastam ("Da página", "Até a página"), e um terceiro texto por cima
          deles só existiria para ser o nome acessível de um `<fieldset>` — que
          tem `role="group"` implícito. A fronteira acessível de grupo desta
          tela é do `FilterBar` de `packages/ui` (decisão C da Tarefa 27), e
          escrevê-la numa segunda casa é o jeito silencioso de a segunda sair de
          sincronia.

          ⚠️ **E AS DUAS PONTAS SÃO OPCIONAIS (decisão D):** só "de", só "até",
          ou as duas. Por isso nenhuma frase promete uma faixa fechada — em
          branco é "sem limite deste lado", nunca "página zero".

          ⚠️ **A FAIXA É DO GRIFO, e o vocabulário não pode sugerir que ela
          alcance a anotação:** anotação não tem página (decisão B), some da
          faixa como já some da cor, e o controle inteiro desaparece quando o
          tipo exclui grifo.
        */
        page: {
          from: 'Da página',
          to: 'Até a página',
        },
        /*
          ⚠️ **"REFINAR" (Tarefa 40, §A.9) — O BOTÃO QUE RECOLHE AS SEIS
          DIMENSÕES, e ele é o único rótulo desta família que não pertence a
          uma dimensão.**

          Daí ele ser folha direta de `filters`, e não de um sétimo grupo: as
          seis chaves irmãs nomeiam POR QUE se filtra (pessoa, tipo, cor,
          leitura, palavra, página); esta nomeia o gesto de abrir todas elas —
          bottom sheet no celular, painel na margem no desktop (Tarefa 46).

          ⚠️ **E ELA CONTINUA SENDO NAVEGAÇÃO, NÃO PERMISSÃO** (ADR 0002):
          "refinar" fala de olhar melhor, nunca de esconder de alguém.
        */
        refine: 'Refinar',
        /*
          ⚠️ **FECHAR O PAINEL (Tarefa 46) — E ELA NÃO REUSA A DE ARQUIVAR.**

          `pages.acervo.archive.close` já diz "Fechar", e a tentação de reusá-la
          é exatamente a lição nº 16 do MVP 2 ao contrário: duas coisas que
          falam a MESMA frase hoje podem precisar falar frases diferentes
          amanhã, e uma chave só faz a primeira correção de texto mexer nas
          duas. O diálogo de arquivar fala de uma ação destrutiva; este fala de
          um painel de navegação.
        */
        close: 'Fechar',
        /*
          ⚠️ **O X DE CADA CHIP ATIVO (Tarefa 46), e o `{{label}}` é
          OBRIGATÓRIO.**

          São até seis chips na mesma faixa, um por dimensão. Seis botões com o
          nome acessível "Remover" seriam a mesma palavra para seis gestos
          diferentes — o defeito que `⚠️ gives every dimension a DISTINCT
          neutral label` já guarda do lado dos chips de filtro, e que aqui
          apareceria como `getByRole('button', { name })` lançando "found
          multiple elements".

          ⚠️ **E O NOME É "TIRAR DA VISTA", NÃO "APAGAR"** (ADR 0002 + regra 4
          da Tarefa 28): o chip some do recorte, nada some do clube. O
          vocabulário de arquivar mora em `pages.acervo.item.archive`, e é
          outro assunto.
        */
        remove: 'Remover {{label}}',
      },
      item: {
        /* Só aparece quando o grifo TEM página — a ausência é silenciosa. */
        page: 'Página {{number}}',
        author: {
          /* Autoria é "você × a pessoa", e o `me` separa os dois. */
          you: 'Você',
          /* O genérico, para quando a tela não conhece as pessoas. */
          other: 'Alguém do clube',
        },
        /* As duas ações do grifo existem SÓ na linha de quem está olhando. */
        edit: 'Corrigir este grifo',
        archive: 'Arquivar este grifo',
      },
      empty: {
        /* Acervo vazio NÃO cobra: a frase fala do que dá para fazer, nunca do
           que a pessoa deixou de escrever. */
        title: 'Nada por aqui ainda.',
        description:
          'Toque em "Nova anotação" ou em "Novo grifo" para começar o acervo.',
        /* O recorte do filtro sem nada dentro: é navegação, não ausência —
           "escreva a primeira" seria mentira embaixo de um filtro. */
        filtered: 'Nada por aqui com este filtro.',
        /*
          ⚠️ **O TERCEIRO VAZIO (decisão F da Tarefa 38g), e ele é DISTINTO dos
          outros dois** — a pessoa faz coisas diferentes com cada um: no
          primeiro ela escreve, no segundo ela solta um chip, aqui ela troca a
          palavra. A frase fala da PALAVRA, nunca de quem escreveu pouco — e ela
          é só TÍTULO: o único vazio com descrição é o do acervo sem nada, onde
          há o que sugerir ("toque em Nova anotação").
        */
        noMatch: 'Nada por aqui com esta palavra.',
      },
      archive: {
        /* Arquivar pede confirmação, e cancelar não chama a API. */
        title: 'Arquivar este grifo?',
        description: 'Ele sai da lista do clube. O trecho não é apagado.',
        confirm: 'Arquivar',
        /*
          ⚠️ **"DEIXAR COMO ESTÁ" NO LUGAR DE "CANCELAR" (Tarefa 40, §A.9
          `keepAsIs`)** — a mesma troca da anotação avulsa, e a MESMA frase de
          propósito: é a mesma ação em duas telas, e o bloco `archive.*` já é
          duplicado por tela porque cada uma é dona da sua confirmação.
        */
        cancel: 'Deixar como está',
        close: 'Fechar',
        failed: 'Não foi possível arquivar agora.',
      },
    },
    /*
      A BUSCA NO ACERVO DO CLUBE (Tarefa 29) — a última fatia do MVP 2.

      ⚠️ **ESTE BLOCO É PEQUENO DE PROPÓSITO, e o que falta nele é decisão.**
      As três palavras de TIPO ("Do dia", "Avulsa", "Grifo"), o par de AUTORIA
      ("Você" · "Alguém do clube"), a "Página {{number}}" e o "Corrigir este
      grifo" **não** se repetem aqui: a tela de busca usa as chaves de
      `pages.acervo.item.*` e `pages.acervo.kind.*`. É a lição nº 3 do MVP 1
      aplicada exatamente como o bloco do acervo já a aplica internamente —
      aquele vocabulário é do MODELO de entrada (o `type` de
      `pages/acervo-entries.ts`), não de uma tela, e duas chaves seriam duas
      verdades sobre as mesmas palavras. O nome das cores vem do
      `COLOR_LABEL_KEYS`, pelo mesmo motivo.

      ⚠️ **E NENHUMA FRASE DAQUI COBRA NEM CONTA.** Não existe "12 resultados"
      (a `COUNTER_SHAPE` da varredura anti-culpa proíbe a forma, por decisão de
      produto: "incentivo por presença, não por comparação"), e o estado sem
      resultado fala da PALAVRA — "tente outra" —, nunca de quem escreveu pouco.
      Os dois estados vazios são frases DIFERENTES: "ainda não me disseram o que
      procurar" e "procurei e não achei" nunca são o mesmo texto.
    */
    busca: {
      /** O nome da TELA. */
      title: 'Busca',
      /** A entrada, na home: é de lá que se chega (a busca é do CLUBE). */
      entry: 'Buscar no acervo do clube',
      field: {
        /* Rótulo VISÍVEL: um `aria-label` solto deixa quem vê a tela sem saber
           o que aquele campo procura. */
        label: 'O que você procura',
        placeholder: 'Uma palavra do que o clube escreveu',
      },
      /*
        ⚠️ **DUAS FRASES DE ESPERA, E NÃO UMA — conserto medido da auditoria.**

        Elas eram a MESMA chave, e o defeito era duplo. O visível: com o `/me`
        ainda no ar a tela dizia "Procurando…" quando **nada** havia sido
        pedido — mentira sobre o que o app está fazendo. E o invisível, que é
        pior: um estado que fala pela frase do outro é um estado que a varredura
        de DOM **não consegue distinguir**, então uma cobrança plantada no
        `loading` da busca passava com o teste do `/me` verde (§7.9 — a guarda
        tem de morar onde a propriedade é decidível). Duas frases, dois estados,
        duas asserções.
      */
      /** A espera do CLUBE: o `/me` ainda não chegou. Nada foi pedido. */
      clubLoading: 'Carregando…',
      /** A espera da BUSCA: o termo saiu e as duas listagens estão no ar. */
      loading: 'Procurando…',
      retry: 'Tentar de novo',
      /* Qualquer falha da busca — as duas listagens são uma coisa só: meia
         busca seria uma lista incompleta em silêncio. */
      unavailable: 'Não foi possível buscar agora.',
      /* Nomeia a lista para o leitor de tela ("lista, 4 itens"). */
      label: 'Resultados da busca',
      start: {
        /* O estado INICIAL, e ele fala do que fazer — nunca do que a pessoa
           deixou de registrar. */
        title: 'Escreva uma palavra.',
        description:
          'A busca procura em tudo o que o clube escreveu, em qualquer livro.',
      },
      empty: {
        /* DISTINTO do inicial: aqui houve busca. E a frase fala da palavra. */
        title: 'Nada com esta palavra.',
        description: 'Tente outra palavra, ou escreva-a com o acento que usou.',
      },
      item: {
        /* De qual livro é o resultado — é o campo que distingue esta tela do
           acervo de um livro. A frase neutra entra quando a estante não
           chegou: o `bookId` cru teria cara de informação e não é de ninguém. */
        unknownBook: 'Livro do clube',
      },
      noClubs: {
        /* Sem clube não há acervo para buscar. A frase não promete botão que
           não existe: criar clube é super-admin, e entrar é pelo link de
           convite (ADR 0003). */
        title: 'Você ainda não está em um clube.',
        description: 'Quando entrar em um, a busca procura no acervo dele.',
      },
    },
    /*
      O CADASTRO DO LIVRO E DO PLANO (Tarefa 20) — a tela que aposenta o
      Swagger.

      ⚠️ **É A ÚNICA TELA DE ADMINISTRAÇÃO DO MVP 1**, e a única em que a
      pessoa que lê não é a pessoa que age: o admin cadastra o mês para o
      clube inteiro. Por isso a recusa (`notAdmin`) fala de PAPEL, nunca de
      visibilidade — dentro do clube não existe conteúdo privado
      (`docs/adr/0002-visibilidade-total-no-clube.md`): o que existe é quem
      pode CADASTRAR.

      ⚠️ **E NENHUMA FRASE DAQUI COBRA.** É um formulário, então há mensagem
      de campo — mas ela fala do CAMPO ("escreva o tema deste dia"), nunca da
      pessoa nem de dia nenhum que ficou sem anotação. O acusador de palavra é
      `locales/__tests__/anti-guilt.test.ts`.
    */
    bookForm: {
      /** O nome da TELA em cada modo (decisão A: uma tela, dois modos). */
      newTitle: 'Novo livro',
      editTitle: 'Editar o livro',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      /*
        REGRA 2: a URL aberta na mão por quem não é OWNER/ADMIN dá FRASE, não
        formulário. Ela fala do papel — "quem administra o clube" —, que é o
        que o `Membership.role` decide.
      */
      notAdmin:
        'Só quem administra o clube cadastra o livro e o plano de leitura.',
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      /* DECISÃO E: salvar é EXPLÍCITO. Não há autosave neste formulário. */
      save: 'Salvar',
      entry: {
        /* REGRA 1: as entradas só aparecem para OWNER/ADMIN. */
        new: 'Cadastrar o livro do mês',
        edit: 'Editar o livro e o plano',
      },
      fields: {
        title: 'Título',
        /* REGRA 3: obrigatório, marcado na tela, e nada é enviado. */
        titleRequired: 'Escreva o título do livro.',
        month: 'Mês do clube',
        monthHint: 'No formato AAAA-MM.',
        monthRequired: 'Escolha o mês do livro.',
        /* REGRA 4: o mês malformado é reprovado ANTES do envio. */
        monthInvalid: 'O mês precisa estar no formato AAAA-MM.',
        author: 'Autor',
        /* REGRA 5: os três opcionais. Em branco, não entram no corpo. */
        optionalHint: 'Pode ficar em branco.',
        coverUrl: 'Endereço da capa',
        totalPages: 'Total de páginas',
      },
      plan: {
        heading: 'Plano de leitura',
        description:
          'Cada dia do plano tem um tema — capítulo, subcapítulo ou assunto.',
        /* REGRA 13: plano vazio é válido; a frase diz o que dá para fazer. */
        empty:
          'O plano ainda não tem nenhum dia. Gere os dias de uma vez ou acrescente um a um.',
        /*
          REGRA 7 e DECISÃO C: o gerador é o que faz esta tela substituir o
          Swagger — sem ele, cadastrar um mês é digitar 30 datas à mão no
          celular. Os TEMAS continuam sendo digitados um a um: eles são o
          conteúdo.
        */
        generator: {
          label: 'Gerar os dias do plano',
          startDate: 'Primeiro dia',
          count: 'Quantos dias',
          submit: 'Gerar os dias',
        },
        /* REGRA 8: acrescentar e remover uma linha à mão. */
        add: 'Acrescentar um dia',
        remove: 'Remover o dia {{number}}',
        /*
          O nome acessível de cada campo carrega o NÚMERO da linha: trinta
          campos chamados "Data" fazem o leitor de tela dizer a mesma coisa
          trinta vezes, e é justamente quem não vê a tela que precisa saber em
          qual dia está.
        */
        dateLabel: 'Data do dia {{number}}',
        titleLabel: 'Tema do dia {{number}}',
        referenceLabel: 'Referência do dia {{number}}',
        /* REGRA 9: tema vazio marca a LINHA, e nada é enviado. */
        titleRequired: 'Escreva o tema deste dia.',
        dateRequired: 'Escolha a data deste dia.',
        dateInvalid: 'A data deste dia precisa estar no formato AAAA-MM-DD.',
        /*
          REGRA 10: as duas frases da regra de sequência do `shared`
          (`findPlanDateProblem`) — repetida e fora de ordem são problemas
          DIFERENTES, e dizer "confira a data" nos dois manda o admin procurar
          o que já está na frente dele.
        */
        dateDuplicate: 'Esta data já está em outro dia do plano.',
        dateOutOfOrder: 'As datas do plano precisam ir sempre para a frente.',
        /*
          REGRA 12: o 400 do domínio ao remover um dia que já tem anotação. A
          frase diz o que aconteceu com o FORMULÁRIO (a linha voltou) e o que
          fazer — o corpo do 400 não diz qual dia é, e inventar isso seria
          mentir.
        */
        dayHasNotes:
          'Um dos dias que saiu do plano já tem anotação do clube, então ele voltou para a lista. Salve de novo sem tirá-lo.',
        /*
          ⚠️ **QUANTOS DIAS O PLANO TEM (Tarefa 40, §A.9 `planDays`) — com par
          de plural, porque o português muda.**

          O i18next escolhe entre `days_one` e `days_other` a partir do
          `count`; a chave que a tela escreve continua sendo `days`. O sufixo é
          protocolo, não snake_case — e a lista de sufixos aceitos é FECHADA em
          `_one`/`_other` por `catalogs.test.ts`.

          ⚠️ **E ISTO NÃO É PLACAR**: é o tamanho do plano que o admin está
          cadastrando, sem nada contra o que comparar. "1 dia" acontece de
          verdade — o plano de um dia é válido.
        */
        days_one: '{{count}} dia',
        days_other: '{{count}} dias',
        /*
          ⚠️ **"DIA 3 · TEM ANOTAÇÃO" (Tarefa 40, §A.9 `dayHasNote`) — E O NOME
          DA CHAVE É `dayWithNote` DE PROPÓSITO.**

          `dayHasNotes`, logo acima, já existe e é OUTRA coisa: o recado do 400
          do domínio ao tentar remover do plano um dia que já tem anotação.
          Duas chaves a um `s` de distância, uma dizendo "Dia 3 · tem anotação"
          e a outra "Um dos dias que saiu do plano…", é erro esperando
          acontecer — e o acusador é o teste que exige que as duas digam coisas
          diferentes (`catalogs.test.ts`).

          Esta é o RÓTULO da linha: ela avisa, antes do gesto, qual dia não sai
          do plano de graça. Ela não cobra ninguém — fala do dia, não de quem
          escreveu ou deixou de escrever.
        */
        dayWithNote: 'Dia {{number}} · tem anotação',
      },
    },
    /*
      A ANOTAÇÃO DO DIA (Tarefa 18) — o editor, o autosave e o que o clube
      escreveu sobre o mesmo trecho.

      ⚠️ **NENHUMA FRASE DAQUI COBRA, e a mais perigosa é a do dia em que só
      você escreveu.** A tentação natural é "ninguém mais escreveu ainda" —
      que é o §1 do plano ao contrário: comentário sobre a ausência do outro.
      A saída é não dizer nada: sem nota alheia, a seção simplesmente não
      existe (regra 18).

      ⚠️ **E O ESTADO DE SALVAMENTO FALA DO TEXTO, NÃO DA PESSOA.** "Não foi
      possível salvar" com "seu texto continua na tela" é a informação que
      importa quando a rede cai no meio de uma frase (regra 12): o medo é
      perder o que escreveu, e a frase responde exatamente isso.
    */
    dayNote: {
      /** O nome da TELA. Vale enquanto o tema do dia não chegou. */
      title: 'Anotação do dia',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      /*
        REGRA 5: o mesmo 404 da tela do livro — livro de outro clube, livro
        arquivado ou id inexistente são a mesma coisa para quem não é membro
        (`CLAUDE.md`: sem membership, 404 e não 403).
      */
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      /*
        REGRA 4: o `planItemId` do endereço não está no plano do livro. É link
        velho, plano reescrito pelo admin, ou id trocado à mão — e nenhum
        deles pode virar tela branca.
      */
      dayUnavailable: 'Este dia não faz parte do plano deste livro.',
      /* REGRA 6: o editor chega num chunk próprio, e o chunk tem de chegar. */
      editorLoading: 'Abrindo o editor…',
      /*
        O convite para escrever — a única frase que o editor mostra vinda da
        tela (§10 do `docs/EDITOR.md`: o resto dos rótulos dele é interno).
      */
      placeholder: 'Escreva sobre a leitura de hoje…',
      mine: {
        heading: 'Sua anotação',
      },
      others: {
        heading: 'O que o clube escreveu',
        /*
          ⚠️ ~~LACUNA DE BACKEND, registrada: nenhuma rota lista os membros do
          clube, então o NOME de quem não é você não existe em resposta
          nenhuma da API hoje. "Alguém do clube" é honesto; uma inicial tirada
          do UUID teria cara de inicial e não seria de ninguém.~~
          ~~author: 'Alguém do clube',~~

          ⚠️ **A CHAVE `author` MORREU NA TAREFA 42 (decisão F), E A LACUNA QUE
          ELA REGISTRAVA JÁ ESTAVA FECHADA HAVIA DEZESSEIS FATIAS.**
          `GET /clubs/:clubId/members` existe desde a Tarefa 26a, e **seis**
          telas já resolviam o nome por ele (`acervo`, `activity-feed`,
          `book`, `busca`, `reading-marks`, `streak-bar`) — só esta e a avulsa
          ficaram para trás, e a mesma pessoa era "Maria" no acervo e "Alguém
          do clube" aqui.

          O comentário é riscado em vez de apagado porque ele é o registro de
          POR QUE a frase existiu, e apagá-lo faria a próxima pessoa achar que
          nunca houve lacuna.

          O genérico continua existindo, num dono só:
          `pages.acervo.item.author.other`. Três chaves para um conceito era
          **defeito**, e a Tarefa 40 o pinou dizendo isso — veja
          `catalogs.test.ts`, no mapa de frases repetidas.
        */
        /*
          REGRA 17: a nota da outra pessoa é só leitura, e a tela DIZ isso —
          em vez de simplesmente não ter botão, que se lê como bug.
        */
        readOnly: 'Somente leitura',
      },
      /*
        ⚠️ **OS GRIFOS DESTA LEITURA (Tarefa 40, §A.9) — O CABEÇALHO DE UMA
        SEÇÃO QUE NÃO EXISTIA.**

        Desde a Tarefa 38i o grifo carrega o dia do plano, e é isso que torna
        esta seção possível: a tela do dia passa a poder mostrar os grifos
        daquela leitura, e não os do livro inteiro. A frase fala da LEITURA, não
        de quem grifou — nada aqui compara ninguém.
      */
      highlights: {
        heading: 'Grifos desta leitura',
      },
      save: {
        saving: 'Salvando…',
        saved: 'Salvo',
        /*
          ⚠️ **O "SALVO ÀS 21:42" (Tarefa 40, §A.9), E ELE É IRMÃO DO `saved`,
          NÃO SUBSTITUTO.**

          `saved` é o instante em que a gravação voltou; este é o estado que
          fica DEPOIS, quando a pessoa para de digitar e a nota de margem
          precisa dizer desde quando o texto está a salvo. O §A.9 escreveu
          `{hora}`, que erra duas vezes: não é a sintaxe do i18next (sairia
          literal na tela) e não é inglês (`CLAUDE.md`).

          ⚠️ **A HORA É FORMATADA PELA TELA, nunca pelo catálogo**, e pelo fuso
          do Settings (`CLAUDE.md`): o catálogo garante o buraco, jamais o que
          entra nele.
        */
        savedAt: 'Salvo {{time}}',
        /*
          ⚠️ **A FILA OFFLINE (Tarefa 21, regra 15) — E ELA NÃO TEM TOM DE
          ERRO.** A escrita não chegou ao servidor, está guardada no aparelho e
          vai sozinha quando a conexão voltar. Nada aqui é falha da pessoa (a
          rede caiu), nada aqui pede uma ação dela (não há o que tocar), e não
          existe botão de repetir ao lado: insistir é justamente o que a fila
          faz por ela.
        */
        queued: 'Sem conexão agora. Seu texto está guardado e vai sozinho.',
        /*
          ⚠️ **O `ApiError` COM STATUS 2xx** (`docs/CONVENCOES-CODIGO.md` §6.8):
          o servidor aceitou e EXECUTOU, e só a resposta não casou o contrato.
          A frase não pode dizer "não foi possível salvar" — seria falso, e
          empurraria a pessoa a mandar de novo o que já está gravado. Também não
          pode dizer "Salvo": o app não confirmou nada.
        */
        unconfirmed:
          'Enviado. A confirmação não chegou, e seu texto continua na tela.',
        /* REGRA 12: o que a pessoa precisa saber é que o texto não se perdeu. */
        failed: 'Não foi possível salvar agora. Seu texto continua na tela.',
        /*
          REGRA 13: 403/404 no `PUT`. É o membership que sumiu, ou o dia de
          leitura que o admin apagou — e retentar pede a mesma negativa.
        */
        unavailable:
          'Este dia de leitura não está mais disponível para você. Seu texto continua na tela.',
        retry: 'Salvar de novo',
      },
    },
    /*
      A ANOTAÇÃO AVULSA (Tarefa 19) — a ideia que veio da página 112, com
      título e referência próprios.

      ⚠️ **A TELA SERVE TRÊS ESTADOS, E SÓ UM DELES TEM AÇÃO**: criar, corrigir
      a MINHA, e ler a de outra pessoa. A de outra pessoa não tem affordance
      nenhuma (ADR 0002: o grupo lê, não interfere) — e isso não é privacidade,
      é autoria.
    */
    freeNote: {
      /** O nome da TELA de correção. O título de verdade está no campo. */
      title: 'Anotação',
      newTitle: 'Nova anotação',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      /* REGRA 14: o editor chega num chunk próprio, e o chunk tem de chegar. */
      editorLoading: 'Abrindo o editor…',
      placeholder: 'Escreva a sua anotação…',
      /* O 404 do livro e a anotação que não está no acervo dele. */
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      noteUnavailable: 'Não foi possível abrir esta anotação agora.',
      /*
        ⚠️ ~~Autoria da nota alheia — o mesmo limite de backend da Tarefa 18.~~
        ~~author: 'Alguém do clube',~~

        **MORREU NA TAREFA 42 (decisão F)**, junto com a gêmea de
        `pages.dayNote.others.author`: o "limite de backend" não existia mais
        desde a Tarefa 26a. O nome sai do `nameOfWriter`, e o genérico tem um
        dono só — `pages.acervo.item.author.other`.
      */
      /* A tela DIZ que é leitura, em vez de só não ter botão (que se lê como
         bug). Leitura é sobre AUTORIA, nunca sobre quem pode ver. */
      readOnly: 'Somente leitura',
      fields: {
        title: 'Título',
        /* REGRA 9: título vazio marca o campo, e nada é enviado. */
        titleRequired: 'Escreva um título para a anotação.',
        reference: 'Referência',
        referenceHint: 'Onde isso aparece no livro. Pode ficar em branco.',
      },
      /* REGRA 16: criar é um BOTÃO. Não há autosave antes de existir a nota. */
      create: 'Criar anotação',
      archive: {
        /* REGRAS 17 e 18: só a minha tem a ação, e ela pede confirmação. */
        action: 'Arquivar anotação',
        title: 'Arquivar esta anotação?',
        description: 'Ela sai da lista do clube. O texto não é apagado.',
        confirm: 'Arquivar',
        /*
          ⚠️ **"DEIXAR COMO ESTÁ" NO LUGAR DE "CANCELAR" (Tarefa 40, §A.9
          `keepAsIs`) — troca de VALOR, não chave nova.**

          O diálogo tem duas saídas e nenhuma delas é abandonar um formulário:
          uma arquiva, a outra deixa a anotação onde está. "Cancelar" nomeia o
          gesto de desistir de um preenchimento que aqui não existe; a frase
          nova diz o que o botão FAZ. O par `confirm`/`cancel` continua com os
          mesmos nomes de chave — quem muda é o que ele fala.
        */
        cancel: 'Deixar como está',
        close: 'Fechar',
        failed: 'Não foi possível arquivar agora.',
      },
      /*
        ⚠️ **A PRÉVIA DO ACERVO (Tarefa 40, §A.9) — o cabeçalho que promete
        exatamente uma coisa: que o que se vê ali é o que o CLUBE vai ver.**

        ⚠️ E ela não é frase de privacidade (ADR 0002): "como vai aparecer no
        acervo" fala de FORMA, não de quem pode ver — dentro do clube não existe
        anotação que alguém não veja, e uma prévia que dissesse "o que os outros
        vão poder ver" inverteria isso.
      */
      preview: {
        heading: 'Como vai aparecer no acervo',
      },
      save: {
        saving: 'Salvando…',
        saved: 'Salvo',
        /* O irmão do `saved`: o estado que FICA. A hora vem da tela, no fuso
           do Settings — o catálogo garante o buraco, nunca o conteúdo. */
        savedAt: 'Salvo {{time}}',
        /* O que a pessoa precisa saber é que o texto não se perdeu. */
        failed: 'Não foi possível salvar agora. Seu texto continua na tela.',
        /* 403/404 no `PATCH`: a nota deixou de ser sua, ou sumiu. */
        unavailable:
          'Esta anotação não está mais disponível para você. Seu texto continua na tela.',
        retry: 'Salvar de novo',
      },
    },
    /*
      ⚠️ **O QUE SOBROU DA TELA DE GRIFOS (Tarefa 25): OS NOMES DAS CORES.**

      A tela morreu na Tarefa 28 — o acervo (`pages.acervo`) lista anotações e
      grifos num lugar só, e a rota `/books/:bookId/highlights` deu lugar a
      `/books/:bookId/acervo` (decisão A). Todas as outras chaves deste bloco
      foram para lá.

      ⚠️ **ESTAS FICARAM AQUI, E O ENDEREÇO É A RAZÃO:** o mapa hex → chave vive
      em `packages/app/src/pages/highlight-colors.tsx`, um módulo NEUTRO que o
      acervo **e** o formulário de grifo importam (a lição medida da Tarefa 17
      sobre o `router-link.tsx`), e ele é escopo fechado desta fatia. Renomear a
      chave obrigaria a tocá-lo por nada — o valor não mudou de dono, só a tela
      que o mostrava.

      ⚠️ **E A COR NUNCA É O ÚNICO PORTADOR DE INFORMAÇÃO**: cada cor tem NOME,
      e é o nome que o leitor de tela fala. O `Record<HighlightColor, MessageKey>`
      daquele módulo amarra as duas pontas no COMPILADOR — uma cor nova na
      paleta de `@clube/shared` deixa o mapa incompleto e reprova no `tsc`, em
      vez de aparecer na tela como uma bolinha sem nome.
    */
    highlights: {
      colors: {
        yellow: 'Amarelo',
        green: 'Verde',
        orange: 'Laranja',
        blue: 'Azul',
        pink: 'Rosa',
      },
    },
    /*
      O FORMULÁRIO DO GRIFO (Tarefa 25) — registrar e corrigir.

      ⚠️ **A RECUSA FALA DE AUTORIA, NUNCA DE VISIBILIDADE.** O grifo de outra
      pessoa aparece INTEIRO na coleção (ADR 0002: dentro do clube não existe
      conteúdo privado); o que não existe é corrigir o que o outro escreveu.
    */
    highlightForm: {
      newTitle: 'Novo grifo',
      editTitle: 'Corrigir o grifo',
      loading: 'Carregando…',
      retry: 'Tentar de novo',
      /* REGRA 20: o editor chega num chunk próprio, e o chunk tem de chegar. */
      editorLoading: 'Abrindo o editor…',
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      highlightUnavailable: 'Não foi possível abrir este grifo agora.',
      /* Autoria, não privacidade: o trecho está na coleção, para todo mundo. */
      notYours: 'Só quem escreveu corrige o próprio grifo.',
      /*
        ⚠️ **A FRASE MUDOU NA TAREFA 28, porque o DESTINO mudou.** Ela dizia
        "Ver os grifos do livro" e apontava para `/books/:bookId/highlights` —
        uma rota que deixou de existir (decisão A: o acervo a substitui). O
        formulário volta para o acervo, que tem anotações **e** grifos, e uma
        frase que promete só os grifos mentiria sobre onde a pessoa vai cair.
        É a mesma disciplina da chave `tabs.highlightsSoon`, que morreu na
        Tarefa 25 no instante em que deixou de ser verdade.
      */
      backToList: 'Ver o acervo do livro',
      fields: {
        quote: 'Trecho grifado',
        quoteHint: 'Copie o trecho como ele está no livro.',
        /* REGRA 12: trecho em branco marca o campo, e nada é enviado. */
        quoteRequired: 'Escreva o trecho que você grifou.',
        color: 'Cor da caneta',
        /* Nomeia o grupo dos cinco chips de cor. */
        colorGroup: 'Escolha a cor da caneta',
        /* REGRA 13: a cor é obrigatória, e vem da paleta fixa de 5. */
        colorRequired: 'Escolha a cor da caneta.',
        page: 'Página',
        pageHint: 'Pode ficar em branco.',
        /* REGRA 14: inteiro a partir de 1, recusado ANTES de enviar — quem
           escreve não deve descobrir isso por um 400. */
        pageInvalid: 'A página precisa ser um número inteiro, de 1 em diante.',
        reference: 'Referência',
        referenceHint: 'Capítulo ou seção. Pode ficar em branco.',
        comment: 'Seu comentário',
        commentHint:
          'O que você pensou sobre esse trecho. Pode ficar em branco.',
      },
      /*
        ⚠️ **A PRÉVIA DO ACERVO (Tarefa 40, §A.9) — a MESMA frase da anotação
        avulsa, e as duas chaves existem de propósito.**

        Não é violação da decisão C (chave de duas telas não duplica): aquela
        vale para frase cujo ASSUNTO é de uma tela e é lida por outra — o caso
        do `pages.book.plan.dayOfPlan`. Aqui cada formulário é dono da própria
        prévia, como cada um já é dono do próprio `archive.*` e do próprio
        indicador de salvamento.
      */
      preview: {
        heading: 'Como vai aparecer no acervo',
      },
      /* REGRA 19: registrar é um BOTÃO, nunca autosave. */
      create: 'Registrar grifo',
      save: 'Salvar',
      /*
        ⚠️ **"RASCUNHO GUARDADO" (Tarefa 40, §A.9 `draftSaved`) — E O NOME DA
        CHAVE NÃO É O QUE O §A.9 PEDIU. Medido, e o motivo é uma colisão:**

        o mapa da Tarefa 40 manda `pages.highlightForm.save.draft`, e
        `pages.highlightForm.save` **já existe e é uma STRING** — o rótulo do
        botão "Salvar", lido por `highlight-form.tsx:610`. Transformá-la em
        objeto faria `t('pages.highlightForm.save')` devolver a chave crua na
        tela, e o conserto exigiria editar a tela, que esta fatia não toca.

        ⚠️ **E A FORMA PLANA É A CONSISTENTE AQUI:** este formulário nunca teve
        grupo `save.*` — o vocabulário de gravação dele é plano (`create`,
        `save`, `failed`), porque ele grava por BOTÃO e não por autosave. As
        telas que têm `save: { … }` (a do dia e a avulsa) são as que salvam
        sozinhas. Então a chave entra plana, ao lado das irmãs, com o nome do
        §A.9.

        O que ela diz: o texto do grifo ficou guardado no aparelho, e o grifo
        ainda não foi registrado. Nada de falha, nada de cobrança — é o mesmo
        tom da fila offline da tela do dia.
      */
      draftSaved: 'Rascunho guardado',
      failed: 'Não foi possível salvar agora. O que você escreveu está aqui.',
    },
    notFound: {
      title: 'Página não encontrada',
      description: 'O endereço que você abriu não existe neste clube.',
      backHome: 'Voltar para o início',
    },
    /*
      AS PREFERÊNCIAS DA PESSOA (Tarefa 36b) — três controles e o aparelho.

      ⚠️ **PRIMEIRA PESSOA E SEM COBRANÇA** (regra 12): "me lembre às", nunca
      "você não leu hoje". O lembrete existe para ajudar, e a tela que o
      configura é o último lugar onde cabe uma régua. A varredura que guarda
      isto é a do VOCABULÁRIO (`anti-guilt.test.ts`), que percorre este catálogo
      inteiro — não uma guarda de dígito copiada do feed, porque aqui o
      dígito é legítimo e obrigatório (`07:30` **é** um número).

      ⚠️ **E A TELA NÃO PROMETE NOTIFICAÇÃO QUE AINDA NÃO EXISTE** (regra 17):
      nada nesta fatia exibe push — o `push-handler.js` é a Tarefa 38. Por isso
      `device.active` fala do APARELHO ("os avisos estão ativados neste
      aparelho"), e não do futuro ("você vai receber um aviso agora").
    */
    settings: {
      title: 'Preferências',
      loading: 'Carregando suas preferências…',
      failed: 'Não foi possível abrir suas preferências.',
      retry: 'Tentar de novo',
      saveFailed: 'Não foi possível guardar esta preferência. Tente de novo.',
      reminderTime: 'Me lembre às',
      /*
        ⚠️ **"SALVA SOZINHO." (Tarefa 40, §A.9 `savesItself`) — a dica do campo
        de hora, e ela existe porque esta tela não tem botão de salvar.**

        Cada controle grava ao mudar (`saveFailed` é o que aparece quando não
        dá), e um campo sem botão ao lado faz a pessoa procurar o botão. A frase
        fala do APARELHO fazendo o trabalho — nunca da pessoa que precisa
        lembrar de salvar.
      */
      reminderTimeHint: 'Salva sozinho.',
      reminderEnabled: 'Quero o lembrete da leitura de hoje',
      notifyGroupActivity: 'Quero saber quando alguém do clube lê ou escreve',
      device: {
        title: 'Neste aparelho',
        activate: 'Ativar os avisos neste aparelho',
        deactivate: 'Desativar os avisos neste aparelho',
        active: 'Os avisos estão ativados neste aparelho.',
        inactive: 'Os avisos estão desativados neste aparelho.',
        failed:
          'Não foi possível mudar os avisos deste aparelho. Tente de novo.',
        // ⚠️ `enabled: false` é o estado NORMAL de quem clona o projeto sem
        // VAPID (decisão F): não é erro, e não pode parecer erro.
        unavailable: 'Os avisos ainda não estão configurados neste servidor.',
        /*
          ⚠️ O TERCEIRO ESTADO: o `GET /notifications/config` não respondeu.
          Não é `unavailable` (que é configuração ausente, e normal) e não é
          sucesso — e o conserto é outro: aqui se tenta de novo, lá se
          configura o servidor. As três preferências acima continuam
          funcionando; só o aparelho ficou sem resposta.
        */
        configFailed:
          'Não foi possível saber se os avisos estão disponíveis. Abra esta tela de novo daqui a pouco.',
        // As QUATRO recusas da decisão G — quatro consertos diferentes.
        insecureContext:
          'Os avisos só funcionam num endereço seguro. Abra o clube por https, ou por localhost na sua própria máquina.',
        unsupported:
          'Este navegador não sabe receber avisos. Experimente abrir o clube em outro navegador.',
        iosNotInstalled:
          'No iPhone, os avisos só funcionam com o clube na tela de início. Toque em Compartilhar e em “Adicionar à Tela de Início”.',
        permissionDenied:
          'Os avisos estão bloqueados para este endereço. Libere a permissão nas configurações do navegador.',
        /*
          ⚠️ O BOTÃO DE TESTE, e as três frases dele NÃO CONTAM APARELHO.

          A resposta da rota traz `{ sent, disabled }`, e seria fácil escrever
          "mandei para 2 aparelhos". Num clube de duas pessoas isso é ruído: os
          dois estados que mudam o que a pessoa FAZ são "saiu" e "não saiu para
          ninguém". E a contagem custaria uma regra de plural para não dizer
          nada acionável.

          Cada frase diz o CONSERTO, como as quatro recusas acima — uma
          mensagem que só informa o fracasso deixa a pessoa adivinhando.
        */
        test: 'Enviar um aviso de teste',
        testSent:
          'Mandei o aviso. Se ele não aparecer em alguns segundos, quem o bloqueou foi o aparelho — confira as notificações do sistema.',
        /*
          ⚠️ O CASO QUE ESTE BOTÃO EXISTE PARA REVELAR, e ele é invisível sem
          o botão: o navegador ainda tem a inscrição (por isso a tela diz
          "ativado"), e o servidor não tem nenhuma viva. Sem o teste, a pessoa
          só descobre isso na hora em que o lembrete NÃO chega — que é a hora
          em que ela não está olhando.
        */
        testNobody:
          'Nenhum aparelho recebeu. A inscrição deste aparelho não vale mais no servidor: desative e ative os avisos de novo.',
        testFailed: 'Não consegui enviar o aviso de teste. Tente de novo.',
      },
    },
  },
  /*
    O editor (Tarefa 14). São as ÚNICAS duas frases traduzidas do editor: o §10
    do `docs/EDITOR.md` decide que os rótulos internos dele (tooltip da barra,
    título de bloco do menu `/`) ficam em português no código, porque
    transformar vinte tooltips em chave de catálogo custa mais do que resolve.

    Estas duas são diferentes porque não são rótulo de controle: são ESTADO que
    a pessoa lê no meio de uma ação que pode dar errado. Elas entram no
    `RichEditor` por PROP, já traduzidas pela tela (decisão B da Tarefa 13: o
    `@clube/ui` não chama `t()`).
  */
  /*
    ⚠️ **A NOTIFICAÇÃO PUSH (Tarefa 37) — A ÚNICA FRASE DO SISTEMA QUE CHEGA
    SEM A PESSOA ABRIR A TELA.**

    Ela mora no catálogo por duas razões, e as duas são regra do projeto:

    1. **`CLAUDE.md`:** não se escreve português cru no backend. O dispatcher é
       backend, e a frase é conteúdo que a pessoa lê.
    2. **decisão H da Tarefa 37:** o idioma é o `Settings.locale` DELA, e não o
       do navegador — porque não há navegador nenhum aberto quando o lembrete
       sai. É a única mensagem do produto que não pode perguntar ao i18n da
       tela.

    ⚠️ ~~**E ELA NÃO COBRA** (`docs/plano-clube-do-livro.md` §1 e regra 15): nada
    de "você não leu", "faltam N dias", "você está atrasada", nem contagem de
    coisa alguma.~~ **CAIU PELA METADE NA TAREFA 38c** — leia a ressalva abaixo
    antes de acreditar nesta frase. Ela diz **o trecho de hoje** e para por aí —
    o mesmo texto do `home.today.heading`, que é o que a pessoa vê ao abrir o
    app. Quem guarda isso é a varredura de `__tests__/anti-guilt.test.ts`, que
    percorre o catálogo inteiro: uma guarda de tela nunca veria esta frase,
    porque ela não passa por tela nenhuma.

    ⚠️ **A RESSALVA (ADR 0010, pedido do dono e reafirmado por ele):** existem
    agora DUAS frases de lembrete, e a diferença importa. O `body` é o de sempre
    e continua não cobrando nada — é o que recebe quem está em **zero**, ou seja,
    justamente quem já não tem nada a perder. O `streakBody_*` **cobra de
    propósito**, com contagem e moldura de perda, e vai só para quem **tem**
    corrente. As duas chaves da moldura são **isentas por nome** da varredura, e
    a isenção é **pinada por igualdade exata**: ampliar a lista fica vermelho.
  */
  notifications: {
    readingReminder: {
      /** O título da notificação no aparelho. */
      title: 'A leitura de hoje',
      /*
        O corpo é SÓ o tema do dia — "Cap. 3 — A promessa" —, que vem do plano
        que o admin cadastrou. Nenhuma moldura em volta: um "não se esqueça de"
        ou um "que tal" transformaria o lembrete em cutucada, e o `{{title}}`
        sozinho é a frase mais curta que ainda diz o que ler.
      */
      body: '{{title}}',
      /*
        ⚠️ **A MOLDURA DE PERDA (ADR 0010).** Só é usada para quem TEM
        corrente; quem está em zero recebe o `body` acima, sem moldura
        nenhuma. Estas duas chaves são isentas da varredura anti-culpa, e a
        isenção é nominal e pinada.

        O `{{title}}` continua no fim: mesmo cobrando, o lembrete tem de
        dizer O QUE ler — senão vira só a cobrança.
      */
      streakBody_one:
        'Você vai perder a sua sequência de {{count}} dia. {{title}}',
      streakBody_other:
        'Você vai perder a sua sequência de {{count}} dias. {{title}}',
    },
    /*
      O AVISO DE ATIVIDADE DO CLUBE (Tarefa 38) — "um incentiva o outro"
      (`CLAUDE.md`), e é o oposto de uma cobrança: ele conta o que ALGUÉM fez,
      nunca o que você deixou de fazer.

      ⚠️ **NENHUMA DESTAS FRASES LEVA CONTEÚDO** (`docs/NOTIFICACOES.md` §1: *"o
      push nunca leva o conteúdo"*). Nem trecho de anotação, nem título do dia,
      nem nome de livro: a notificação aparece em TELA BLOQUEADA, e o que a
      pessoa escreveu se lê no app, autenticado.

      ⚠️ **E NENHUMA DELAS DIZ O NOME DE QUEM FEZ**, o que é uma ausência
      deliberada e não um esquecimento. O `ActivityEvent` guarda REFERÊNCIA e
      não conteúdo (Tarefa 33), o `listActivity` registra por extenso que "não
      resolve nome de pessoa" — quem resolve é a TELA, pelo
      `GET /clubs/:clubId/members` —, e `User.name` é anulável, então a frase
      com nome precisaria de uma segunda frase para quem não tem nome. O aviso
      diz que o clube está vivo; quem foi, o app conta quando a pessoa abre.

      Uma frase por nascimento (os quatro `ActivityType`), porque "escreveu uma
      anotação" e "guardou um grifo" são notícias diferentes para quem recebe.
    */
    groupActivity: {
      /** O título é o mesmo nos quatro: quem agrupa é o `tag`, não o texto. */
      title: 'O clube está lendo',
      /** `PLAN_NOTE` — a anotação do dia de leitura. */
      planNote: 'Alguém do clube escreveu sobre a leitura de hoje.',
      /** `FREE_NOTE` — a anotação avulsa, que não tem dia. */
      freeNote: 'Alguém do clube escreveu uma anotação.',
      /** `HIGHLIGHT` — o grifo. */
      highlight: 'Alguém do clube guardou um grifo.',
      /** `READ` — alguém marcou que leu. */
      read: 'Alguém do clube registrou a leitura de hoje.',
    },
    /*
      O BOTÃO "ENVIAR NOTIFICAÇÃO DE TESTE" (`POST /notifications/test`).

      É diagnóstico, e a frase tem de responder à única pergunta de quem aperta
      o botão: "chegou?". Nada de conteúdo, nada de cobrança — e nenhum `TEST`
      no `NOTIFICATION_KINDS`, porque aquela lista é o vocabulário de uma chave
      de idempotência e um teste que só funciona uma vez por dia não testa nada
      (decisão G da Tarefa 38).
    */
    test: {
      title: 'Tudo certo',
      body: 'Se você está vendo isto, os avisos do clube funcionam neste aparelho.',
    },
  },
  editor: {
    /*
      ⚠️ **`editor.slashHint` NÃO É EXCEÇÃO AO §10 DO `docs/EDITOR.md` — É A
      REGRA DESTE NAMESPACE (Tarefa 40, §A.9 `editorSlashHint`).**

      O §10 manda os rótulos INTERNOS do editor ficarem cravados em português
      dentro de `packages/ui` — os tooltips da barra, os títulos do menu `/`, os
      vazios dos popups. Esta frase não é rótulo interno.

      ⚠️ **E o argumento verdadeiro é mais forte do que "quem renderiza",
      medido na auditoria desta fatia:** `packages/ui` **não chama `t()` nenhuma
      vez, e não pode** — são zero ocorrências, e `no-i18n.test.ts` as proíbe,
      porque o design system não conhece idioma. Logo **todas** as folhas de
      `editor.*` são lidas pela TELA e entram por prop: `image.uploading` e
      `image.uploadFailed` chegam como `uploadingLabel`/`uploadFailedLabel`
      (quem chama o `t()` é `day-note.tsx:617-618`), e `slashHint` é a terceira.

      ⚠️ **A primeira versão deste comentário dizia "a mesma família do
      `placeholder`, que o §10 já manda passar pelo `t()`" — e se apoiava numa
      chave FANTASMA:** o §10 citava `t('editor.placeholder')`, que nunca
      existiu. As telas usam `pages.dayNote.placeholder` e
      `pages.freeNote.placeholder`. O §10 e o docblock da prop em
      `RichEditor.tsx` foram corrigidos; esta frase cita os nomes que existem.

      Quem renderiza, para o registro: a TELA, no rodapé da coluna de leitura
      (`DiaDesktop`, `NovaAnotacaoDesktop`) — e tela nenhuma deste projeto tem
      texto solto (`CLAUDE.md`).

      ⚠️ Ela vive em `editor.*` e não em `pages.*` porque o namespace nomeia o
      ASSUNTO, não o renderizador: as duas telas que a mostram são donas iguais,
      e pôr em uma para a outra ler de lá seria eleger uma dona sem razão
      (decisão C ao contrário).
    */
    slashHint: 'Digite / para inserir um bloco',
    image: {
      uploading: 'Enviando imagem…',
      uploadFailed: 'Falha ao enviar',
    },
  },
  errors: {
    network: 'Sem conexão com o servidor. Verifique a internet.',
    badRequest: 'Confira os dados e tente de novo.',
    unauthorized: 'Sua sessão terminou. Entre outra vez.',
    forbidden: 'Você não tem permissão para fazer isso.',
    notFound: 'Não encontramos o que você procurava.',
    conflict: 'Isso já existe.',
    gone: 'Este link não vale mais.',
    payloadTooLarge: 'O conteúdo é grande demais.',
    serverError: 'Algo deu errado do nosso lado. Tente de novo.',
    unknown: 'Não foi possível concluir. Tente de novo.',
    fields: {
      invalid: 'Há um campo com valor inválido.',
      author: 'Confira o autor.',
      code: 'Confira o código do convite.',
      coverUrl: 'A capa precisa ser um endereço válido.',
      doc: 'Confira o texto da anotação.',
      email: 'Confira o e-mail.',
      month: 'O mês do clube precisa estar no formato AAAA-MM.',
      name: 'Confira o nome.',
      password: 'Confira a senha.',
      planItems: 'Confira o plano de leitura.',
      planItem: {
        date: 'Confira a data deste dia do plano.',
        reference: 'Confira a referência deste dia do plano.',
        title: 'Confira o tema deste dia do plano.',
      },
      reference: 'Confira a referência.',
      role: 'Confira o papel escolhido.',
      text: 'Confira o texto da busca.',
      timezone: 'Confira o fuso horário.',
      title: 'Confira o título.',
      totalPages: 'O total de páginas precisa ser um número inteiro positivo.',
      ttlDays: 'A validade precisa ser um número inteiro de dias.',
    },
  },
};
