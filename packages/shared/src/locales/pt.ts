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
  },
  language: {
    label: 'Idioma',
    pt: 'Português',
    en: 'Inglês',
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
    },
    /*
      O ACERVO DO LIVRO (Tarefa 28) — anotações **e** grifos num lugar só.

      ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** (`docs/adr/0002-*.md`).
      Nenhuma frase daqui pode sugerir que exista anotação ou grifo que o clube
      não vê: nada de "só você", "privada", "visível para". As quatro dimensões
      olham o MESMO acervo — pessoa, tipo, leitura e cor são formas de OLHAR.

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
      },
      archive: {
        /* Arquivar pede confirmação, e cancelar não chama a API. */
        title: 'Arquivar este grifo?',
        description: 'Ele sai da lista do clube. O trecho não é apagado.',
        confirm: 'Arquivar',
        cancel: 'Cancelar',
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
      `locales/__tests__/anti-guilt.test.ts`, nos dois locales.
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
          ⚠️ LACUNA DE BACKEND, registrada: nenhuma rota lista os membros do
          clube, então o NOME de quem não é você não existe em resposta
          nenhuma da API hoje. "Alguém do clube" é honesto; uma inicial tirada
          do UUID teria cara de inicial e não seria de ninguém.
        */
        author: 'Alguém do clube',
        /*
          REGRA 17: a nota da outra pessoa é só leitura, e a tela DIZ isso —
          em vez de simplesmente não ter botão, que se lê como bug.
        */
        readOnly: 'Somente leitura',
      },
      save: {
        saving: 'Salvando…',
        saved: 'Salvo',
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
      /* Autoria da nota alheia — o mesmo limite de backend da Tarefa 18. */
      author: 'Alguém do clube',
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
        cancel: 'Cancelar',
        close: 'Fechar',
        failed: 'Não foi possível arquivar agora.',
      },
      save: {
        saving: 'Salvando…',
        saved: 'Salvo',
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
      /* REGRA 19: registrar é um BOTÃO, nunca autosave. */
      create: 'Registrar grifo',
      save: 'Salvar',
      failed: 'Não foi possível salvar agora. O que você escreveu está aqui.',
    },
    notFound: {
      title: 'Página não encontrada',
      description: 'O endereço que você abriu não existe neste clube.',
      backHome: 'Voltar para o início',
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
  editor: {
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
