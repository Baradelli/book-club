import { pt } from './pt';

/**
 * Catálogo **en** — o segundo locale.
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
      clubUnavailable: 'We could not open this club right now.',
    },
    book: {
      title: 'Book',
      loading: 'Loading…',
      retry: 'Try again',
      bookUnavailable: 'We could not open this book right now.',
      tabs: {
        notes: 'Notes',
        highlights: 'Highlights',
      },
      plan: {
        label: 'Days of the reading plan',
        today: 'Today',
        writer: 'Someone in the club wrote on this day',
        empty: {
          title: 'This book has no reading plan yet.',
          description:
            'A club admin registers the plan, with the topic of each day.',
        },
      },
      notes: {
        label: 'Notes on this book',
        loading: 'Loading the notes…',
        new: 'New note',
        filters: {
          label: 'How to look at the collection',
          all: 'Everything',
          mine: 'Mine',
          /* The complement of "Mine", never a chip per person: no route lists
             the members of a club with their names yet. */
          others: 'By other people',
        },
        author: {
          you: 'You',
          other: 'Someone in the club',
        },
        kind: {
          plan: 'Of the day',
          free: 'Standalone',
        },
        empty: {
          title: 'No notes around here yet.',
          description: 'Tap "New note" to write the first one.',
          filtered: 'Nothing here with this filter.',
        },
        unavailable: 'We could not load the notes right now.',
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
    highlights: {
      title: 'Highlights',
      loading: 'Loading the highlights…',
      retry: 'Try again',
      bookUnavailable: 'We could not open this book right now.',
      unavailable: 'We could not load the highlights right now.',
      new: 'New highlight',
      label: 'Highlights of this book',
      filters: {
        label: 'How to look at the collection',
        all: 'Every colour',
      },
      colors: {
        yellow: 'Yellow',
        green: 'Green',
        orange: 'Orange',
        blue: 'Blue',
        pink: 'Pink',
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
        title: 'No highlights here yet.',
        description: 'Tap "New highlight" to record the first one.',
        filtered: 'Nothing here in this colour.',
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
    highlightForm: {
      newTitle: 'New highlight',
      editTitle: 'Correct the highlight',
      loading: 'Loading…',
      retry: 'Try again',
      editorLoading: 'Opening the editor…',
      bookUnavailable: 'We could not open this book right now.',
      highlightUnavailable: 'We could not open this highlight right now.',
      notYours: 'Only the person who wrote a highlight corrects it.',
      backToList: 'See the highlights of the book',
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
