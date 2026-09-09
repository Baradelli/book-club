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
      tabs: {
        notes: 'Anotações',
        /*
          ⚠️ A ABA DEIXOU DE SER DESABILITADA na Tarefa 25, e a chave
          `highlightsSoon` ("Os grifos chegam no MVP 2") morreu com ela: a
          frase deixou de ser verdade no instante em que a tela passou a
          existir, e uma explicação que mente é pior que nenhuma. Agora a aba
          é um LINK para a coleção do livro.
        */
        highlights: 'Grifos',
      },
      plan: {
        /* Nomeia a lista para o leitor de tela ("lista, 30 itens"). */
        label: 'Dias do plano de leitura',
        /* A ÚNICA marca da lista (decisão C): hoje. Nada mais é destacado. */
        today: 'Hoje',
        /*
          ⚠️ O nome acessível do avatar é GENÉRICO, e é lacuna registrada da
          decisão E: o `writers` do `GET /books/:bookId` devolve só `userId`, e
          o nome de quem não é você não está em nenhuma resposta da API hoje (o
          `/me` não lista os membros do clube). Quando listar, esta chave morre e
          o `aria-label` passa a ser o nome da pessoa.
        */
        writer: 'Alguém do clube escreveu neste dia',
        empty: {
          title: 'Este livro ainda não tem plano de leitura.',
          description:
            'Um administrador do clube cadastra o plano, com o tema de cada dia.',
        },
      },
      /*
        O ACERVO DO LIVRO (Tarefa 19) — a aba "Anotações" deixando de ser um
        rótulo.

        ⚠️ **O FILTRO É NAVEGAÇÃO, NÃO PERMISSÃO** (`docs/adr/0002-*.md`).
        Nenhuma frase daqui pode sugerir que exista anotação que o clube não vê:
        nada de "só você", "privada", "visível para". O filtro é uma forma de
        OLHAR o mesmo acervo — e é por isso que o terceiro chip fala de quem
        escreveu, nunca de quem pode ler.
      */
      notes: {
        /* Nomeia a lista para o leitor de tela ("lista, 5 itens"). */
        label: 'Anotações deste livro',
        loading: 'Carregando as anotações…',
        /* REGRA 16: criar é EXPLÍCITO. Abrir uma tela não cria linha no banco. */
        new: 'Nova anotação',
        filters: {
          /* Nomeia o grupo de chips para quem navega por leitor de tela. */
          label: 'Como olhar o acervo',
          all: 'Tudo',
          mine: 'Minhas',
          /*
            ⚠️ **É O COMPLEMENTO DE "MINHAS", E NÃO UM CHIP POR PESSOA.**
            Nenhuma rota da API lista os membros do clube com nome (lacuna de
            backend registrada na Tarefa 18), então "de Fulana" é impossível
            hoje — e num clube de duas pessoas o complemento é informação
            completa.

            ⚠️ E A FRASE NÃO É "De outras pessoas" POR UM MOTIVO MEDIDO: o
            radical `tras` da varredura anti-guilt (`locales/__tests__/
            anti-guilt.test.ts`, que existe para pegar "atrás"/"atrasado")
            casa dentro de "ou-TRAS". A guarda está certa e a palavra é que
            tinha de mudar — o sentido é o mesmo, e é o mesmo vocabulário que
            `pages.dayNote.others.author` já usa.
          */
          others: 'De outras pessoas',
        },
        author: {
          /* REGRA 2: autoria é "você × outra pessoa", e o `me` do contexto
             é quem separa os dois. */
          you: 'Você',
          other: 'Alguém do clube',
        },
        /* REGRA 3: os dois tipos convivem na lista, identificados. */
        kind: {
          plan: 'Do dia',
          free: 'Avulsa',
        },
        empty: {
          /*
            REGRA 7: acervo vazio NÃO cobra. A frase fala do livro e do que dá
            para fazer — nunca do que a pessoa deixou de escrever.
          */
          title: 'Nenhuma anotação por aqui ainda.',
          description: 'Toque em "Nova anotação" para escrever a primeira.',
          /* O recorte do filtro sem nada dentro: é navegação, não ausência. */
          filtered: 'Nada por aqui com este filtro.',
        },
        unavailable: 'Não foi possível carregar as anotações agora.',
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
      A COLEÇÃO DE GRIFOS DO LIVRO (Tarefa 25) — a primeira vez que o dono vê
      um grifo na tela.

      ⚠️ **O FILTRO POR COR É NAVEGAÇÃO, NÃO PERMISSÃO**
      (`docs/adr/0002-visibilidade-total-no-clube.md`). Nenhuma frase daqui
      pode sugerir que exista grifo que o clube não vê: nada de "só você",
      "privado", "visível para". As seis opções olham o MESMO acervo.

      ⚠️ **E A COR NUNCA É O ÚNICO PORTADOR DE INFORMAÇÃO** (regra 4): cada
      cor tem NOME, e é o nome que o leitor de tela fala. Os nomes ficam em
      `colors`, e o mapa hex → chave vive em `pages/highlight-colors.tsx` com
      o tipo da paleta de `@clube/shared` — uma cor nova na paleta reprova no
      `tsc` em vez de aparecer sem nome.
    */
    highlights: {
      /** O nome da TELA. O título do livro entra como contexto, abaixo. */
      title: 'Grifos',
      loading: 'Carregando os grifos…',
      retry: 'Tentar de novo',
      /* Livro de outro clube, livro arquivado, ou id inexistente: para quem
         não é membro os três são a mesma resposta (`CLAUDE.md`: 404). */
      bookUnavailable: 'Não foi possível abrir este livro agora.',
      unavailable: 'Não foi possível carregar os grifos agora.',
      /* REGRA 19: registrar é um BOTÃO. Abrir uma tela não grava nada. */
      new: 'Novo grifo',
      /* Nomeia a lista para o leitor de tela ("lista, 12 itens"). */
      label: 'Grifos deste livro',
      filters: {
        /* Nomeia o grupo de chips para quem navega por leitor de tela. */
        label: 'Como olhar o acervo',
        /* O estado "todas" da regra 7 — o acervo inteiro, sem recorte. */
        all: 'Todas as cores',
      },
      colors: {
        yellow: 'Amarelo',
        green: 'Verde',
        orange: 'Laranja',
        blue: 'Azul',
        pink: 'Rosa',
      },
      item: {
        /* REGRA 5: só aparece quando o grifo TEM página. */
        page: 'Página {{number}}',
        author: {
          /* REGRA 4: autoria é "você × outra pessoa", e o `me` separa os dois. */
          you: 'Você',
          other: 'Alguém do clube',
        },
        /* REGRA 9: as duas ações existem SÓ no grifo de quem está olhando. */
        edit: 'Corrigir este grifo',
        archive: 'Arquivar este grifo',
      },
      empty: {
        /* REGRA 8: acervo vazio NÃO cobra. A frase fala do que dá para fazer. */
        title: 'Nenhum grifo por aqui ainda.',
        description: 'Toque em "Novo grifo" para registrar o primeiro.',
        /* O recorte do filtro sem nada dentro: é navegação, não ausência —
           "registre o primeiro" seria mentira embaixo de um filtro. */
        filtered: 'Nada por aqui com esta cor.',
      },
      archive: {
        /* REGRA 10: arquivar pede confirmação, e cancelar não chama a API. */
        title: 'Arquivar este grifo?',
        description: 'Ele sai da lista do clube. O trecho não é apagado.',
        confirm: 'Arquivar',
        cancel: 'Cancelar',
        close: 'Fechar',
        failed: 'Não foi possível arquivar agora.',
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
      backToList: 'Ver os grifos do livro',
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
