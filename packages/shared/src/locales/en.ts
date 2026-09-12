import type { pt } from './pt';

/**
 * Catálogo **en** — o segundo locale.
 *
 * ⚠️ **`import type`, e não `import` (Tarefa 29a, regra 2).** Este arquivo é o
 * alvo de um `import()` dinâmico (`@clube/shared/locales/en`) e por isso vira
 * um CHUNK próprio: um import de valor de `./pt` faria esse chunk arrastar o
 * catálogo português inteiro junto, e quem trocasse de idioma baixaria os dois.
 * Aqui o `pt` só é usado como TIPO, então o `import type` diz isso ao bundler
 * antes de ele ter opinião.
 *
 * O tipo é `typeof pt` de propósito: é o compilador reprovando chave a mais ou
 * a menos, ANTES do teste de paridade. Chave faltando não quebra nada em
 * runtime — o i18next renderiza a própria chave na tela e ninguém percebe —,
 * então ela é barrada nas duas portas: aqui e em
 * `locales/__tests__/catalogs.test.ts` (regra 14).
 */
export const en: typeof pt = {
  app: {
    name: 'Book Club',
  },
  nav: {
    signOut: 'Sign out',
    settings: 'Preferences',
  },
  language: {
    label: 'Language',
    pt: 'Portuguese',
    en: 'English',
  },
  theme: {
    label: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
  },
  pages: {
    login: {
      title: 'Sign in',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      invalidCredentials: 'Email or password do not match.',
    },
    acceptInvite: {
      title: 'Accept invite',
      description: 'Choose a password to join the club.',
      name: 'Name',
      nameHint: 'How the club will see you. You can leave it blank.',
      email: 'Email',
      password: 'Password',
      passwordHint: 'At least 8 characters.',
      submit: 'Join the club',
      inviteNotFound:
        'We could not open this invite. Check the link with whoever invited you — or the club may no longer exist.',
      inviteExpired:
        'This invite is no longer valid: it has expired or has already been used. Ask whoever invited you for a new link.',
      alreadyInClub:
        'You are already in this club. Sign in with your email and password.',
    },
    /*
      ⚠️ A mesma regra do `pt`: nenhuma frase daqui cobra. A varredura da regra
      16 roda contra o catálogo `pt` (é o idioma pinado nos testes), então o
      `en` não é conferido por ela — quem escrever aqui é responsável por não
      reintroduzir "you haven't", "overdue", "behind" ou "pending".
    */
    home: {
      title: 'Home',
      clubLabel: 'Club',
      loading: 'Loading…',
      retry: 'Try again',
      today: {
        heading: "Today's reading",
        write: "Write today's note",
      },
      shelf: {
        heading: 'What the club is reading',
        label: 'Books of the club',
      },
      noClubs: {
        title: 'Your club shows up here',
        description:
          'Clubs are created by whoever runs the system. If someone has invited you, open the invite link you received.',
      },
      noBooks: {
        title: 'The shelf is empty',
        description:
          'The book of the month is registered by a club admin, already with the reading plan for each day.',
      },
      /* The activity feed (task 35): a SENTENCE per line, never a table with a
         column of people — and never a count of anything. The four sentences
         must stay distinct in BOTH locales; `catalogs.test.ts` is the accuser. */
      feed: {
        heading: 'What has been happening here',
        label: 'Club activity',
        loading: 'Loading the activity…',
        empty: 'No activity here yet.',
        failed: 'We could not load the activity right now.',
        planNote: '{{name}} wrote the note of the day in {{book}}',
        freeNote: '{{name}} wrote a standalone note in {{book}}',
        highlight: '{{name}} highlighted a passage of {{book}}',
        read: '{{name}} read a day of {{book}}',
      },
      clubUnavailable: 'We could not open this club right now.',
    },
    book: {
      title: 'Book',
      loading: 'Loading…',
      retry: 'Try again',
      bookUnavailable: 'We could not open this book right now.',
      /* The two tabs died in task 28 (decision B): the book screen is the
         PLAN, and the collection is one place, one link away. */
      acervoLink: 'See the collection of the book',
      /* "I read today", in the first person, with the CURRENT STATE in the
         label — the state lives in the words, not in `aria-pressed`. It only
         exists when the plan has a day of today (task 32b, decision E). */
      read: {
        mark: 'Mark that I read today',
        unmark: 'I read today — remove the mark',
        failed: 'We could not record your reading right now.',
      },
      plan: {
        label: 'Days of the reading plan',
        today: 'Today',
        /* The fallback, for when the screen does not know the people. */
        writer: 'Someone in the club wrote on this day',
        /* Interpolated, so the avatar keeps the name AND the "on this day". */
        writerNamed: '{{name}} wrote on this day',
        /* The reading overlay (task 32b): the sibling of the pair above, and
           it must NOT speak the same sentence — the two marks share a row, and
           whoever hears the screen has to tell them apart. */
        reader: 'Someone in the club read this day',
        readerNamed: '{{name}} read this day',
        empty: {
          title: 'This book has no reading plan yet.',
          description:
            'A club admin registers the plan, with the topic of each day.',
        },
      },
    },
    /*
      THE COLLECTION OF THE BOOK (task 28) — notes AND highlights in one place.

      The filter is NAVIGATION, never permission (ADR 0002), and a highlight is
      an entity of its own, never a kind of note (ADR 0004). No `all` repeats
      the wording of another group: three chip groups on one screen means two
      "Everything" chips would be two buttons with the same accessible name.
    */
    acervo: {
      title: 'Collection',
      loading: 'Loading the collection…',
      retry: 'Try again',
      bookUnavailable: 'We could not open this book right now.',
      unavailable: 'We could not load the collection right now.',
      label: 'Notes and highlights of this book',
      newNote: 'New note',
      newHighlight: 'New highlight',
      kind: {
        plan: 'Of the day',
        free: 'Standalone',
        highlight: 'Highlight',
      },
      filters: {
        person: {
          label: 'Whose collection',
          all: 'Everyone',
          mine: 'Mine',
          /* The complement of "Mine" — the DEGRADED mode of task 27. */
          others: 'By other people',
          person: 'By {{name}}',
          unnamed: 'By someone with no name',
        },
        type: {
          label: 'What to show',
          all: 'Everything',
        },
        color: {
          /* The group only EXISTS when the type can include a highlight
             (decision E): a colour chip under "Standalone" is a filter that
             guarantees no results. */
          label: 'Highlight colour',
          all: 'Every colour',
        },
        reading: {
          /* A NATIVE `<select>` with a VISIBLE label (decision D): the real
             plan has thirty days, and thirty chips on a phone is a filter
             nobody uses. */
          label: 'Reading of the day',
          all: 'Every reading',
        },
      },
      item: {
        page: 'Page {{number}}',
        author: {
          you: 'You',
          other: 'Someone in the club',
        },
        edit: 'Correct this highlight',
        archive: 'Archive this highlight',
      },
      empty: {
        title: 'Nothing here yet.',
        description:
          'Tap "New note" or "New highlight" to start the collection.',
        filtered: 'Nothing here with this filter.',
      },
      archive: {
        title: 'Archive this highlight?',
        description: 'It leaves the list of the club. The quote is not erased.',
        confirm: 'Archive',
        cancel: 'Cancel',
        close: 'Close',
        failed: 'We could not archive it right now.',
      },
    },
    /*
      THE SEARCH OVER THE COLLECTION OF THE CLUB (task 29).

      ⚠️ Small on purpose: the TYPE words, the authorship pair, the page label
      and "correct this highlight" live in `pages.acervo.*` and are REUSED — that
      vocabulary belongs to the entry MODEL, not to a screen, and two keys would
      be two truths about the same words.

      ⚠️ And nothing here counts or blames: there is no "12 results" (the
      anti-guilt scan forbids the shape, by product decision), and the
      no-results phrase talks about the WORD, never about who wrote little.
    */
    busca: {
      title: 'Search',
      entry: 'Search the collection of the club',
      field: {
        label: 'What are you looking for',
        placeholder: 'A word from what the club wrote',
      },
      /* Two waiting phrases, not one: the shell wait ("nothing was asked yet")
         and the search wait. They were the same key, and a state that speaks
         with the other one's phrase is a state the DOM scan cannot tell apart. */
      clubLoading: 'Loading…',
      loading: 'Searching…',
      retry: 'Try again',
      unavailable: 'We could not search right now.',
      label: 'Search results',
      start: {
        title: 'Type a word.',
        description:
          'The search looks through everything the club wrote, in every book.',
      },
      empty: {
        title: 'Nothing with this word.',
        description:
          'Try another word, or write it with the accent you actually used.',
      },
      item: {
        unknownBook: 'A book of the club',
      },
      noClubs: {
        title: 'You are not in a club yet.',
        description: 'Once you join one, the search looks through it.',
      },
    },
    bookForm: {
      newTitle: 'New book',
      editTitle: 'Edit the book',
      loading: 'Loading…',
      retry: 'Try again',
      notAdmin:
        'Only whoever administers the club registers the book and the reading plan.',
      bookUnavailable: 'We could not open this book right now.',
      save: 'Save',
      entry: {
        new: 'Register the book of the month',
        edit: 'Edit the book and the plan',
      },
      fields: {
        title: 'Title',
        titleRequired: 'Write the title of the book.',
        month: 'Club month',
        monthHint: 'In the YYYY-MM format.',
        monthRequired: 'Choose the month of the book.',
        monthInvalid: 'The month must look like YYYY-MM.',
        author: 'Author',
        optionalHint: 'You can leave it blank.',
        coverUrl: 'Cover address',
        totalPages: 'Total pages',
      },
      plan: {
        heading: 'Reading plan',
        description:
          'Every day of the plan has a topic — a chapter, a section or a subject.',
        empty:
          'The plan has no days yet. Generate them all at once, or add them one by one.',
        generator: {
          label: 'Generate the days of the plan',
          startDate: 'First day',
          count: 'How many days',
          submit: 'Generate the days',
        },
        add: 'Add a day',
        remove: 'Remove day {{number}}',
        dateLabel: 'Date of day {{number}}',
        titleLabel: 'Topic of day {{number}}',
        referenceLabel: 'Reference of day {{number}}',
        titleRequired: 'Write the topic of this day.',
        dateRequired: 'Choose the date of this day.',
        dateInvalid: 'The date of this day must look like YYYY-MM-DD.',
        dateDuplicate: 'This date is already used by another day of the plan.',
        dateOutOfOrder: 'The dates of the plan must always move forward.',
        dayHasNotes:
          'One of the days that left the plan already has a note from the club, so it is back on the list. Save again without taking it out.',
      },
    },
    dayNote: {
      title: 'Note of the day',
      loading: 'Loading…',
      retry: 'Try again',
      bookUnavailable: 'We could not open this book right now.',
      dayUnavailable: 'This day is not part of the reading plan of this book.',
      editorLoading: 'Opening the editor…',
      placeholder: "Write about today's reading…",
      mine: {
        heading: 'Your note',
      },
      others: {
        heading: 'What the club wrote',
        author: 'Someone in the club',
        readOnly: 'Read only',
      },
      save: {
        saving: 'Saving…',
        saved: 'Saved',
        queued:
          'No connection right now. Your text is saved and will go on its own.',
        unconfirmed:
          'Sent. The confirmation did not arrive, and your text is still here.',
        failed: 'We could not save right now. Your text is still here.',
        unavailable:
          'This reading day is no longer available to you. Your text is still here.',
        retry: 'Save again',
      },
    },
    freeNote: {
      title: 'Note',
      newTitle: 'New note',
      loading: 'Loading…',
      retry: 'Try again',
      editorLoading: 'Opening the editor…',
      placeholder: 'Write your note…',
      bookUnavailable: 'We could not open this book right now.',
      noteUnavailable: 'We could not open this note right now.',
      author: 'Someone in the club',
      readOnly: 'Read only',
      fields: {
        title: 'Title',
        titleRequired: 'Write a title for the note.',
        reference: 'Reference',
        referenceHint:
          'Where this shows up in the book. You can leave it blank.',
      },
      create: 'Create note',
      archive: {
        action: 'Archive note',
        title: 'Archive this note?',
        description: 'It leaves the list of the club. The text is not erased.',
        confirm: 'Archive',
        cancel: 'Cancel',
        close: 'Close',
        failed: 'We could not archive it right now.',
      },
      save: {
        saving: 'Saving…',
        saved: 'Saved',
        failed: 'We could not save right now. Your text is still here.',
        unavailable:
          'This note is no longer available to you. Your text is still here.',
        retry: 'Save again',
      },
    },
    /* All that is left of the highlights screen (task 25): the colour names.
       The screen died in task 28 — the collection (`pages.acervo`) lists notes
       and highlights in one place. These keys stay because the hex -> key map
       lives in `pages/highlight-colors.tsx`, a neutral module the collection
       AND the highlight form import. */
    highlights: {
      colors: {
        yellow: 'Yellow',
        green: 'Green',
        orange: 'Orange',
        blue: 'Blue',
        pink: 'Pink',
      },
    },
    highlightForm: {
      newTitle: 'New highlight',
      editTitle: 'Correct the highlight',
      loading: 'Loading…',
      retry: 'Try again',
      editorLoading: 'Opening the editor…',
      bookUnavailable: 'We could not open this book right now.',
      highlightUnavailable: 'We could not open this highlight right now.',
      notYours: 'Only the person who wrote a highlight corrects it.',
      /* The wording changed in task 28 because the DESTINATION changed: the
         form now goes back to the collection, which has notes AND highlights. */
      backToList: 'See the collection of the book',
      fields: {
        quote: 'Highlighted quote',
        quoteHint: 'Copy the quote as it stands in the book.',
        quoteRequired: 'Write the quote you highlighted.',
        color: 'Pen colour',
        colorGroup: 'Choose the pen colour',
        colorRequired: 'Choose the pen colour.',
        page: 'Page',
        pageHint: 'You can leave it blank.',
        pageInvalid: 'The page must be a whole number, from 1 upwards.',
        reference: 'Reference',
        referenceHint: 'Chapter or section. You can leave it blank.',
        comment: 'Your comment',
        commentHint:
          'What you thought about this quote. You can leave it blank.',
      },
      create: 'Record highlight',
      save: 'Save',
      failed: 'We could not save right now. What you wrote is still here.',
    },
    notFound: {
      title: 'Page not found',
      description: 'The address you opened does not exist in this club.',
      backHome: 'Back to the start',
    },
    settings: {
      title: 'Preferences',
      loading: 'Loading your preferences…',
      failed: 'We could not open your preferences.',
      retry: 'Try again',
      saveFailed: 'We could not save this preference. Try again.',
      reminderTime: 'Remind me at',
      reminderEnabled: 'I want the reminder for the reading of the day',
      notifyGroupActivity:
        'I want to know when someone in the club reads or writes',
      device: {
        title: 'On this device',
        activate: 'Turn the alerts on for this device',
        deactivate: 'Turn the alerts off for this device',
        active: 'The alerts are on for this device.',
        inactive: 'The alerts are off for this device.',
        failed: 'We could not change the alerts on this device. Try again.',
        unavailable: 'The alerts are not configured on this server yet.',
        configFailed:
          'We could not check whether the alerts are available. Open this screen again in a moment.',
        insecureContext:
          'Alerts only work on a secure address. Open the club over https, or over localhost on your own machine.',
        unsupported:
          'This browser cannot receive alerts. Try opening the club in another browser.',
        iosNotInstalled:
          'On iPhone, alerts only work with the club on the Home Screen. Tap Share, then “Add to Home Screen”.',
        permissionDenied:
          'Alerts are blocked for this address. Allow them in your browser settings.',
      },
    },
  },
  /*
    THE PUSH NOTIFICATION (Tarefa 37) — the only sentence in the system that
    arrives without anyone opening a screen. See the pt catalogue for the two
    reasons it lives here (the backend writes no raw prose, and the language is
    the person's `Settings.locale`, because no browser is open when it goes
    out), and for why it never nags.
  */
  notifications: {
    readingReminder: {
      title: "Today's reading",
      body: '{{title}}',
    },
    /*
      The club activity notice (Tarefa 38). See the pt catalogue for why it
      carries no content, and why it names nobody.
    */
    groupActivity: {
      title: 'Your club is reading',
      planNote: "Someone in the club wrote about today's reading.",
      freeNote: 'Someone in the club wrote a note.',
      highlight: 'Someone in the club saved a highlight.',
      read: "Someone in the club logged today's reading.",
    },
    /* The "send a test notification" button (`POST /notifications/test`). */
    test: {
      title: 'All set',
      body: 'If you can see this, club notifications work on this device.',
    },
  },
  editor: {
    image: {
      uploading: 'Uploading image…',
      uploadFailed: 'Upload failed',
    },
  },
  errors: {
    network: 'No connection to the server. Check your internet.',
    badRequest: 'Check the data and try again.',
    unauthorized: 'Your session ended. Please sign in again.',
    forbidden: 'You are not allowed to do that.',
    notFound: 'We could not find what you were looking for.',
    conflict: 'That already exists.',
    gone: 'This link is no longer valid.',
    payloadTooLarge: 'The content is too large.',
    serverError: 'Something went wrong on our side. Try again.',
    unknown: 'We could not finish that. Try again.',
    fields: {
      invalid: 'One of the fields has an invalid value.',
      author: 'Check the author.',
      code: 'Check the invite code.',
      coverUrl: 'The cover must be a valid address.',
      doc: 'Check the text of the note.',
      email: 'Check the email.',
      month: 'The club month must look like YYYY-MM.',
      name: 'Check the name.',
      password: 'Check the password.',
      planItems: 'Check the reading plan.',
      planItem: {
        date: 'Check the date of this day of the plan.',
        reference: 'Check the reference of this day of the plan.',
        title: 'Check the topic of this day of the plan.',
      },
      reference: 'Check the reference.',
      role: 'Check the selected role.',
      text: 'Check the search text.',
      timezone: 'Check the time zone.',
      title: 'Check the title.',
      totalPages: 'The page count must be a positive whole number.',
      ttlDays: 'The expiry must be a whole number of days.',
    },
  },
};
